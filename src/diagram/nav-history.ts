/** Back and Forward history of the diagrams opened in one editor group (D52): in memory, per key, no `vscode` import. */
export class NavHistory {
  private readonly stacks = new Map<string, { entries: string[]; at: number }>();

  /** A diagram was shown in `key`. Showing the current entry again changes nothing; a new one clears the forward entries. */
  visit(key: string, uri: string): void {
    const s = this.stacks.get(key) ?? { entries: [], at: -1 };
    this.stacks.set(key, s);
    if (s.entries[s.at] === uri) return;
    s.entries.length = s.at + 1;
    s.entries.push(uri);
    s.at = s.entries.length - 1;
  }

  canBack(key: string): boolean {
    return (this.stacks.get(key)?.at ?? 0) > 0;
  }

  canForward(key: string): boolean {
    const s = this.stacks.get(key);
    return !!s && s.at < s.entries.length - 1;
  }

  /** Forget the stacks of every key not in `keys` (tab groups that are closed or empty). */
  retain(keys: readonly string[]): void {
    for (const k of [...this.stacks.keys()]) if (!keys.includes(k)) this.stacks.delete(k);
  }

  /** Move one step in `dir`, skipping entries for which `exists` is false and removing them from the list; the entry reached, or undefined (nothing moves). */
  async step(key: string, dir: -1 | 1, exists: (uri: string) => Promise<boolean>): Promise<string | undefined> {
    const s = this.stacks.get(key);
    if (!s) return undefined;
    let i = s.at + dir;
    while (i >= 0 && i < s.entries.length) {
      if (await exists(s.entries[i]!)) {
        s.at = i;
        return s.entries[i];
      }
      s.entries.splice(i, 1);
      if (dir < 0) { s.at--; i--; }
    }
    return undefined;
  }
}
