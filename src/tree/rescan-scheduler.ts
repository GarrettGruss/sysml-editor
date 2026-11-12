/** Schedules the few delayed re-reads of newly created folders, without vscode so it can be unit tested. */

export interface TimerApi {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: TimerApi = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

interface Entry<T> {
  payload: T;
  handles: Set<unknown>;
}

/** The longest folder path (by `/` segments) that is a prefix of every path. */
export function commonFolder(paths: readonly string[]): string {
  const parts = paths.map((p) => p.split("/"));
  const first = parts[0] ?? [];
  let n = first.length;
  for (const p of parts) {
    let i = 0;
    while (i < n && i < p.length && p[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join("/");
}

/**
 * Each folder path gets re-reads at the given delays. A path below an already scheduled folder is skipped (the
 * ancestor's re-read covers it); scheduling a folder cancels the ones below it. When more than `max` folders of
 * one bucket (a workspace folder) are scheduled, they collapse into their common folder, so a burst of created
 * folders costs a bounded number of searches.
 */
export class RescanScheduler<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly run: (path: string, payload: T) => void,
    private readonly delays: readonly number[],
    private readonly options: {
      max?: number;
      /** The bucket a path belongs to (its workspace folder); collapsing never goes above it. */
      bucketOf?: (path: string) => string | undefined;
      /** The payload for the common folder that replaces `from`. */
      merge?: (common: string, from: readonly { path: string; payload: T }[]) => T;
    } = {},
    private readonly timers: TimerApi = realTimers,
  ) {}

  /** Timers not yet fired. */
  get pending(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.handles.size;
    return n;
  }

  get scheduled(): string[] {
    return [...this.entries.keys()];
  }

  schedule(path: string, payload: T): void {
    for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) if (this.entries.has(path.slice(0, i)) || this.entries.has(path)) return;
    if (this.entries.has(path)) return;
    this.cancelBelow(path);
    this.add(path, payload);
    this.collapse(path);
  }

  /** Forget the re-reads of `path` and of everything below it. */
  cancel(path: string): void {
    this.drop(path);
    this.cancelBelow(path);
  }

  clear(): void {
    for (const p of [...this.entries.keys()]) this.drop(p);
  }

  private cancelBelow(path: string): void {
    const prefix = path + "/";
    for (const p of [...this.entries.keys()]) if (p.startsWith(prefix)) this.drop(p);
  }

  private drop(path: string): void {
    const e = this.entries.get(path);
    if (!e) return;
    for (const h of e.handles) this.timers.clear(h);
    this.entries.delete(path);
  }

  private add(path: string, payload: T): void {
    const entry: Entry<T> = { payload, handles: new Set() };
    this.entries.set(path, entry);
    for (const ms of this.delays) {
      const h = this.timers.set(() => {
        entry.handles.delete(h);
        if (entry.handles.size === 0 && this.entries.get(path) === entry) this.entries.delete(path);
        this.run(path, payload);
      }, ms);
      entry.handles.add(h);
    }
  }

  private collapse(path: string): void {
    const max = this.options.max ?? 20;
    const bucket = this.options.bucketOf?.(path);
    if (bucket === undefined && this.options.bucketOf) return;
    const same = [...this.entries].filter(([p]) => this.options.bucketOf?.(p) === bucket);
    if (same.length <= max) return;
    const paths = same.map(([p]) => p);
    const common = commonFolder(paths);
    if (bucket !== undefined && !(common === bucket || common.startsWith(bucket + "/"))) return;
    const from = same.map(([p, e]) => ({ path: p, payload: e.payload }));
    const payload = this.options.merge ? this.options.merge(common, from) : from[0]!.payload;
    for (const p of paths) this.drop(p);
    this.add(common, payload);
  }
}
