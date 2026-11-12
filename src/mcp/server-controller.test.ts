import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { discoveryFilePath } from "./discovery.js";
import { McpServerController } from "./server-controller.js";
import { startMcpServer } from "./server.js";

const ctx = () => ({ index: new ModelIndex(), uriToPath: () => undefined, pathToUri: () => undefined });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("McpServerController", () => {
  it("dispose during a slow start leaves no server and no discovery file", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "sysml-ctl-"));
    const ws = path.join(home, "ws");
    try {
      let started: Awaited<ReturnType<typeof startMcpServer>> | undefined;
      const c = new McpServerController<string>(async (w) => {
        await sleep(100);
        started = await startMcpServer({ context: ctx, workspaces: [w], home });
        return started;
      });
      const pending = c.reconcile(ws);
      await sleep(10);
      await c.dispose();
      await pending;
      expect(c.server).toBeUndefined();
      expect(started).toBeDefined();
      expect(existsSync(discoveryFilePath(ws, home))).toBe(false);
      await expect(fetch(started!.url, { method: "POST" })).rejects.toThrow();
      expect(await c.reconcile(ws)).toBe(false); // ignored after dispose
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it("restarts when the key changes and stops when nothing is desired", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "sysml-ctl-"));
    try {
      const c = new McpServerController<string>((w) => startMcpServer({ context: ctx, workspaces: [path.join(home, w)], home }));
      expect(await c.reconcile("a")).toBe(true);
      const first = c.server!;
      expect(await c.reconcile("a")).toBe(false);
      expect(await c.reconcile("b")).toBe(true);
      expect(c.server).not.toBe(first);
      expect(existsSync(discoveryFilePath(path.join(home, "a"), home))).toBe(false);
      expect(await c.reconcile(undefined)).toBe(true);
      expect(c.server).toBeUndefined();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
