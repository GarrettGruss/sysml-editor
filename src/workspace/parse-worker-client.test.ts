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

function client(maxRestarts = 1) {
  const workers: FakeWorker[] = [];
  const logs: string[] = [];
  const c = new ParseWorkerClient({
    workerPath: "x.js",
    maxRestarts,
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

  it("restarts once after a crash and resends the interrupted request, then gives up", async () => {
    const { c, workers, logs } = client(1);
    const a = c.request(req("a", 1));
    workers[0]!.emit("exit", 1);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.sent.map((m) => m.uri)).toEqual(["a"]);
    const b = c.request(req("b", 2));
    workers[1]!.emit("error", new Error("bad"));
    expect(await a).toBeUndefined();
    expect(await b).toBeUndefined();
    expect(c.available).toBe(false);
    expect(await c.request(req("c", 3))).toBeUndefined();
    expect(workers).toHaveLength(2);
    expect(logs.some((l) => l.includes("no longer available"))).toBe(true);
  });

  it("terminates the worker on dispose and resolves outstanding requests", async () => {
    const { c, workers } = client();
    const a = c.request(req("a", 1));
    c.dispose();
    expect(workers[0]!.terminated).toBe(true);
    expect(await a).toBeUndefined();
  });
});
