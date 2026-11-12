import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ParseWorkerClient, type WorkerLike } from "./parse-worker-client.js";
import type { WorkerReply, WorkerRequest } from "./parse-worker-protocol.js";

class FakeWorker extends EventEmitter implements WorkerLike {
  readonly sent: WorkerRequest[] = [];
  terminated = false;
  postMessage(m: WorkerRequest): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(m: WorkerRequest, errors = [{ line: 0, column: 0, message: "boom" }]): void {
    this.emit("message", { type: "result", id: m.id, uri: m.uri, version: m.version, errors, ms: 1 } satisfies WorkerReply);
  }
}

function client(extra: Partial<ConstructorParameters<typeof ParseWorkerClient>[0]> = {}) {
  const workers: FakeWorker[] = [];
  const logs: string[] = [];
  const c = new ParseWorkerClient({
    workerPath: "x.js",
    maxRestarts: 3,
    ...extra,
    log: (m) => logs.push(m),
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
  });
  return { c, workers, logs };
}
const req = (uri: string, version: number) => ({ uri, version, text: `v${version}` });

describe("ParseWorkerClient", () => {
  it("starts lazily and sends one request at a time", async () => {
    const { c, workers } = client();
    expect(workers).toHaveLength(0);
    const a = c.request(req("a", 1));
    const b = c.request(req("b", 2));
    expect(workers).toHaveLength(1);
    expect(workers[0]!.sent.map((m) => m.uri)).toEqual(["a"]);
    workers[0]!.reply(workers[0]!.sent[0]!);
    expect((await a)?.version).toBe(1);
    expect(workers[0]!.sent.map((m) => m.uri)).toEqual(["a", "b"]);
    workers[0]!.reply(workers[0]!.sent[1]!);
    expect((await b)?.uri).toBe("b");
  });

  it("coalesces queued versions of one URI: only the newest is parsed", async () => {
    const { c, workers } = client();
    const first = c.request(req("busy", 1)); // occupies the worker
    const v2 = c.request(req("a", 2));
    const v3 = c.request(req("a", 3));
    const v4 = c.request(req("a", 4));
    expect(await v2).toBeUndefined();
    expect(await v3).toBeUndefined();
    const w = workers[0]!;
    w.reply(w.sent[0]!);
    await first;
    expect(w.sent.map((m) => m.version)).toEqual([1, 4]);
    w.reply(w.sent[1]!);
    expect((await v4)?.version).toBe(4);
    // An older version arriving after a newer one is refused at once.
    const n5 = c.request(req("b", 6));
    expect(await c.request(req("b", 5))).toBeUndefined();
    w.reply(w.sent[2]!);
    expect((await n5)?.version).toBe(6);
  });

  it("does not resend the job that killed the worker; other files still get details", async () => {
    const { c, workers } = client();
    const poison = c.request(req("poison", 1));
    const other = c.request(req("other", 2));
    workers[0]!.emit("exit", 1);
    expect(await poison).toBeUndefined();
    expect(workers).toHaveLength(2);
    expect(workers[1]!.sent.map((m) => m.uri)).toEqual(["other"]);
    workers[1]!.reply(workers[1]!.sent[0]!);
    expect((await other)?.uri).toBe("other");
    expect(c.available).toBe(true);
  });

  it("restarts lazily when the crash left nothing waiting", async () => {
    const { c, workers } = client();
    const a = c.request(req("a", 1));
    workers[0]!.emit("error", new Error("bad"));
    expect(await a).toBeUndefined();
    expect(workers).toHaveLength(1);
    const b = c.request(req("b", 2));
    expect(workers).toHaveLength(2);
    workers[1]!.reply(workers[1]!.sent[0]!);
    expect((await b)?.uri).toBe("b");
  });

  it("crashes far apart or separated by a success do not kill the client", async () => {
    const { c, workers } = client({ maxRestarts: 1 });
    for (let i = 0; i < 4; i++) {
      const p = c.request(req("p" + i, 1));
      workers[workers.length - 1]!.emit("exit", 1);
      expect(await p).toBeUndefined();
      const ok = c.request(req("ok" + i, 1));
      const w = workers[workers.length - 1]!;
      w.reply(w.sent[0]!);
      expect((await ok)?.uri).toBe("ok" + i);
    }
    expect(c.available).toBe(true);
  });

  it("crashes outside the window do not count", async () => {
    const { c, workers } = client({ maxRestarts: 1, restartWindowMs: 10 });
    for (let i = 0; i < 3; i++) {
      const p = c.request(req("p" + i, 1));
      workers[workers.length - 1]!.emit("exit", 1);
      await p;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(c.available).toBe(true);
  });

  it("a tight crash loop marks the client dead", async () => {
    const { c, workers, logs } = client();
    for (let i = 0; i < 4; i++) {
      const p = c.request(req("p" + i, 1));
      workers[workers.length - 1]!.emit("exit", 1);
      expect(await p).toBeUndefined();
    }
    expect(c.available).toBe(false);
    expect(await c.request(req("c", 3))).toBeUndefined();
    expect(workers).toHaveLength(4);
    expect(logs.some((l) => l.includes("main thread"))).toBe(true);
  });

  it("resolves unavailable and keeps going when a reply cannot be deserialised", async () => {
    const { c, workers } = client();
    const a = c.request(req("a", 1));
    const b = c.request(req("b", 2));
    const w = workers[0]!;
    w.emit("message", { type: "result", id: w.sent[0]!.id, uri: "a", version: 1, errors: [], model: { not: "a model" }, ms: 1 });
    expect(await a).toBeUndefined();
    expect(w.sent.map((m) => m.uri)).toEqual(["a", "b"]);
    w.reply(w.sent[1]!);
    expect((await b)?.uri).toBe("b");
  });

  it("marks the client dead when the worker cannot be constructed", async () => {
    const logs: string[] = [];
    let n = 0;
    const c = new ParseWorkerClient({
      workerPath: "missing.js",
      log: (m) => logs.push(m),
      createWorker: () => {
        n++;
        throw new Error("ENOENT");
      },
    });
    expect(await c.request(req("a", 1))).toBeUndefined();
    expect(await c.request(req("b", 2))).toBeUndefined();
    expect(c.available).toBe(false);
    expect(n).toBe(1);
    expect(logs).toHaveLength(1);
  });

  it("terminates a worker that exceeds the request timeout and restarts for the queue", async () => {
    const { c, workers } = client({ requestTimeoutMs: 20 });
    const slow = c.request(req("slow", 1));
    const next = c.request(req("next", 2));
    expect(await slow).toBeUndefined();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[0]!.emit("exit", 1); // late exit of the terminated worker is ignored
    expect(workers).toHaveLength(2);
    workers[1]!.reply(workers[1]!.sent[0]!);
    expect((await next)?.uri).toBe("next");
  });

  it("does not send texts above the size cap", async () => {
    const { c, workers } = client({ maxTextChars: 5 });
    expect(await c.request({ uri: "big", version: 1, text: "123456" })).toBeUndefined();
    expect(workers).toHaveLength(0);
    expect(c.available).toBe(true);
  });

  it("terminates the worker on dispose and resolves outstanding requests", async () => {
    const { c, workers } = client();
    const a = c.request(req("a", 1));
    c.dispose();
    expect(workers[0]!.terminated).toBe(true);
    expect(await a).toBeUndefined();
  });
});
