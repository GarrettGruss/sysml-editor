/**
 * Main-thread side of the parse worker (src/parse-worker.ts): a `DetailsProvider` for ModelIndex.
 * Free of `vscode`, so it can be used from tests and scripts.
 *
 * One request is in the worker at a time. Waiting requests are kept per URI and only the newest
 * version is sent; an older one resolves with `undefined` (superseded). The worker starts lazily
 * on the first request or on `start()`. If it dies it is restarted once and the outstanding work is
 * sent again; after a second failure every request resolves with `undefined` and the index keeps
 * the provisional errors.
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
  /** Restarts allowed after a crash (default 1). */
  maxRestarts?: number;
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
  private current: { id: number; job: Job } | undefined;
  private nextId = 1;
  private restarts = 0;
  private dead = false;
  private disposed = false;

  constructor(private readonly opts: ParseWorkerClientOptions) {}

  /** Start the worker now (it then warms itself); otherwise it starts on the first request. */
  start(): void {
    if (this.worker || this.dead || this.disposed) return;
    const data: WorkerData = { libraryDir: this.opts.libraryDir, warm: this.opts.warm };
    const w: WorkerLike =
      this.opts.createWorker?.(this.opts.workerPath, data) ?? (new Worker(this.opts.workerPath, { workerData: data }) as unknown as WorkerLike);
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
    if (this.current || !this.worker) return;
    const next = this.waiting.entries().next();
    if (next.done) return;
    const [uri, job] = next.value;
    this.waiting.delete(uri);
    const id = this.nextId++;
    this.current = { id, job };
    const msg: WorkerRequest = { id, uri, version: job.req.version, text: job.req.text };
    this.worker.postMessage(msg);
  }

  private onMessage(m: WorkerReply): void {
    if (m.type === "warmed") {
      this.opts.log?.(`parse worker warmed in ${m.ms} ms (${m.files} texts)`);
      this.opts.onWarmed?.(m);
      return;
    }
    const cur = this.current;
    if (!cur || cur.id !== m.id) return;
    this.current = undefined;
    if (m.type === "failed") {
      this.opts.log?.(`parse worker failed on ${cur.job.req.uri}: ${m.message}`);
      cur.job.resolve(undefined);
    } else {
      cur.job.resolve({ uri: m.uri, version: m.version, errors: m.errors, model: m.model ? deserializeModel(m.model) : undefined });
    }
    this.pump();
  }

  private onCrash(w: WorkerLike, why: string): void {
    if (w !== this.worker || this.disposed) return;
    this.worker = undefined;
    const cur = this.current;
    this.current = undefined;
    // Put the interrupted job back unless a newer version of its URI is already waiting.
    if (cur && !this.waiting.has(cur.job.req.uri)) this.waiting.set(cur.job.req.uri, cur.job);
    else cur?.job.resolve(undefined);
    if (this.restarts < (this.opts.maxRestarts ?? 1)) {
      this.restarts++;
      this.opts.log?.(`parse worker stopped (${why}); restarting`);
      this.start();
      this.pump();
    } else {
      this.dead = true;
      this.opts.log?.(`parse worker stopped (${why}); syntax error details are no longer available in this session`);
      this.failAll();
    }
  }

  private failAll(): void {
    const cur = this.current;
    this.current = undefined;
    cur?.job.resolve(undefined);
    for (const j of this.waiting.values()) j.resolve(undefined);
    this.waiting.clear();
  }
}
