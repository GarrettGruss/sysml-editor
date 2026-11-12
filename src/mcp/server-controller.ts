/**
 * Sequences start/stop of the hosted MCP server so a `dispose()` that races a slow start never leaves a server
 * (or its discovery file) behind. Free of `vscode`.
 */
import type { RunningMcpServer } from "./server.js";

export class McpServerController<D> {
  private current: { server: RunningMcpServer; key: string } | undefined;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly start: (desired: D) => Promise<RunningMcpServer>,
    private readonly keyOf: (desired: D) => string = (d) => JSON.stringify(d),
  ) {}

  get server(): RunningMcpServer | undefined {
    return this.current?.server;
  }

  /**
   * Make the running server match `desired` (undefined = none), restarting it if the desired key changed.
   * Resolves true if the running server changed. Calls are serialised.
   */
  reconcile(desired: D | undefined): Promise<boolean> {
    const run = this.queue.then(async () => {
      if (this.disposed) return false;
      const key = desired === undefined ? undefined : this.keyOf(desired);
      if (this.current && this.current.key === key) return false;
      let changed = false;
      if (this.current) {
        const old = this.current;
        this.current = undefined;
        await old.server.stop();
        changed = true;
      }
      if (desired !== undefined && key !== undefined && !this.disposed) {
        const server = await this.start(desired);
        if (this.disposed) {
          await server.stop();
          return changed;
        }
        this.current = { server, key };
        changed = true;
      }
      return changed;
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Waits for in-flight work, then stops whatever is running. */
  dispose(): Promise<void> {
    this.disposed = true;
    this.queue = this.queue.then(async () => {
      const c = this.current;
      this.current = undefined;
      await c?.server.stop();
    });
    return this.queue;
  }
}
