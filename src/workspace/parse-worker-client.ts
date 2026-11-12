/**
 * Main-thread side of the parse worker (src/parse-worker.ts): a `DetailsProvider` for ModelIndex.
 * Free of `vscode`, so it can be used from tests and scripts.
 *
 * One request is in the worker at a time. Waiting requests are kept per URI and only the newest
 * version is sent; an older one resolves with `undefined` (superseded). The worker starts lazily
 * on the first request or on `start()`. If it dies, the job it was running is NOT sent again (the
 * text may be what killed it) and resolves with `undefined`; jobs still waiting go to the restarted
 * worker. More than `maxRestarts` crashes within `restartWindowMs` without a successful answer in
 * between mark the client dead. A request that runs longer than `requestTimeoutMs` terminates the
 * worker like a crash; texts above `maxTextChars` are not sent. `undefined` always means "details
 * unavailable": the index then parses that document synchronously.
 */
import { Worker } from "node:worker_threads";
import { deserializeModel } from "../model/serialize.js";
import type { DetailsProvider, DetailsReply, DetailsRequest } from "../model/types.js";
import type { WorkerData, WorkerReply, WorkerRequest } from "./parse-worker-protocol.js";

interface Job {
  req: DetailsRequest;
  resolve: (r: DetailsReply | undefined) => void;
}

export interface ParseWorkerClientOptions extends WorkerData {
  /** Path of the bundled worker script (dist/parse-worker.js). */
  workerPath: string;
  log?: (msg: string) => void;
  /** Called when the worker has finished warming up. */
  onWarmed?: (info: { ms: number; files: number }) => void;
  /** Crashes tolerated within `restartWindowMs` before the client is dead (default 3). */
  maxRestarts?: number;
  /** Window for the crash-loop guard (default 60 s). */
  restartWindowMs?: number;
  /** A request running longer than this terminates the worker (default 60 s). */
  requestTimeoutMs?: number;
  /** Longer texts are not sent and resolve unavailable (default 2,000,000 characters). */
  maxTextChars?: number;
  /** For tests: creates the worker (default: a `node:worker_threads` Worker). */
  createWorker?: (path: string, data: WorkerData) => WorkerLike;
}

/** The part of `Worker` the client uses. */
export interface WorkerLike {
  on(event: "message", f: (m: WorkerReply) => void): unknown;
  on(event: "error", f: (e: unknown) => void): unknown;
  on(event: "exit", f: (code: number) => void): unknown;
  postMessage(m: WorkerRequest): void;
  terminate(): unknown;
}

export class ParseWorkerClient implements DetailsProvider {
  private worker: WorkerLike | undefined;
  private readonly waiting = new Map<string, Job>();
  private current: { id: number; job: Job; timer?: ReturnType<typeof setTimeout> } | undefined;
  private nextId = 1;
  private crashes: number[] = [];
  private dead = false;
  private disposed = false;

  constructor(private readonly opts: ParseWorkerClientOptions) {}

  /** Start the worker now (it then warms itself); otherwise it starts on the first request. */
  start(): void {
    if (this.worker || this.dead || this.disposed) return;
    const data: WorkerData = { libraryDir: this.opts.libraryDir, warm: this.opts.warm };
    let w: WorkerLike;
    try {
      w = this.opts.createWorker?.(this.opts.workerPath, data) ?? (new Worker(this.opts.workerPath, { workerData: data }) as unknown as WorkerLike);
    } catch (e) {
      this.dead = true;
      this.opts.log?.(`parse worker could not start (${String(e)}); syntax error details come from the main thread`);
      this.failAll();
      return;
    }
    this.worker = w;
    w.on("message", (m) => this.onMessage(m));
    w.on("error", (e) => this.onCrash(w, `error: ${String(e)}`));
    w.on("exit", (code) => this.onCrash(w, `exit code ${code}`));
  }

  get available(): boolean {
    return !this.dead && !this.disposed;
  }

  request(req: DetailsRequest): Promise<DetailsReply | undefined> {
    if (!this.available) return Promise.resolve(undefined);
    if (req.text.length > (this.opts.maxTextChars ?? 2_000_000)) {
      this.opts.log?.(`parse worker: ${req.uri} is too large to send (${req.text.length} characters)`);
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const prev = this.waiting.get(req.uri);
      const cur = this.current?.job.req;
      if ((prev && prev.req.version > req.version) || (cur && cur.uri === req.uri && cur.version > req.version)) return resolve(undefined);
      prev?.resolve(undefined); // superseded before it was sent
      this.waiting.set(req.uri, { req, resolve });
      this.start();
      this.pump();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll();
    const w = this.worker;
    this.worker = undefined;
    void w?.terminate();
  }

  private pump(): void {
    if (this.current || !this.worker || this.disposed) return;
    const next = this.waiting.entries().next();
    if (next.done) return;
    const [uri, job] = next.value;
    this.waiting.delete(uri);
    const id = this.nextId++;
    const w = this.worker;
    const timer = setTimeout(() => this.onTimeout(w, id), this.opts.requestTimeoutMs ?? 60_000);
    timer.unref?.();
    this.current = { id, job, timer };
    const msg: WorkerRequest = { id, uri, version: job.req.version, text: job.req.text };
    try {
      w.postMessage(msg);
    } catch (e) {
      this.opts.log?.(`parse worker: could not send ${uri}: ${String(e)}`);
      clearTimeout(timer);
      this.current = undefined;
      job.resolve(undefined);
      this.pump();
    }
  }

  private onTimeout(w: WorkerLike, id: number): void {
    if (w !== this.worker || this.current?.id !== id || this.disposed) return;
    this.opts.log?.(`parse worker timed out on ${this.current.job.req.uri}; terminating it`);
    this.worker = undefined;
    void w.terminate();
    this.afterWorkerLoss("request timeout");
  }

  private onMessage(m: WorkerReply): void {
    if (m.type === "warmed") {
      this.crashes = [];
      this.opts.log?.(`parse worker warmed in ${m.ms} ms (${m.files} texts)`);
      try {
        this.opts.onWarmed?.(m);
      } catch (e) {
        this.opts.log?.(`parse worker: onWarmed failed: ${String(e)}`);
      }
      return;
    }
    const cur = this.current;
    if (!cur || cur.id !== m.id) return;
    clearTimeout(cur.timer);
    this.current = undefined;
    try {
      if (m.type === "failed") {
        this.opts.log?.(`parse worker failed on ${cur.job.req.uri}: ${m.message}`);
        cur.job.resolve(undefined);
      } else {
        this.crashes = [];
        cur.job.resolve({ uri: m.uri, version: m.version, errors: m.errors, model: m.model ? deserializeModel(m.model) : undefined });
      }
    } catch (e) {
      this.opts.log?.(`parse worker: bad reply for ${cur.job.req.uri}: ${String(e)}`);
      cur.job.resolve(undefined);
    } finally {
      this.pump();
    }
  }

  private onCrash(w: WorkerLike, why: string): void {
    if (w !== this.worker || this.disposed) return;
    this.worker = undefined;
    this.afterWorkerLoss(why);
  }

  /** The worker is gone: fail the running job (never resend it), then restart or give up. */
  private afterWorkerLoss(why: string): void {
    const cur = this.current;
    this.current = undefined;
    clearTimeout(cur?.timer);
    cur?.job.resolve(undefined);
    const now = Date.now();
    const win = this.opts.restartWindowMs ?? 60_000;
    this.crashes = this.crashes.filter((t) => now - t < win);
    this.crashes.push(now);
    if (this.crashes.length <= (this.opts.maxRestarts ?? 3)) {
      this.opts.log?.(`parse worker stopped (${why}); ${this.waiting.size > 0 ? "restarting" : "it restarts on the next request"}`);
      if (this.waiting.size > 0) {
        this.start();
        this.pump();
      }
    } else {
      this.dead = true;
      this.opts.log?.(`parse worker stopped (${why}); syntax error details come from the main thread for the rest of this session`);
      this.failAll();
    }
  }

  private failAll(): void {
    const cur = this.current;
    this.current = undefined;
    clearTimeout(cur?.timer);
    cur?.job.resolve(undefined);
    for (const j of this.waiting.values()) j.resolve(undefined);
    this.waiting.clear();
  }
}
