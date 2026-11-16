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

  /** Move one step in `dir`, skipping (and dropping) entries for which `exists` is false; the entry reached, or undefined (nothing moves). */
  async step(key: string, dir: -1 | 1, exists: (uri: string) => Promise<boolean>): Promise<string | undefined> {
    const s = this.stacks.get(key);
    if (!s) return undefined;
    for (let i = s.at + dir; i >= 0 && i < s.entries.length; i += dir) {
      if (await exists(s.entries[i]!)) {
        s.at = i;
        return s.entries[i];
      }
    }
    // Nothing reachable in that direction: forget the missing entries beyond the current one.
    if (dir < 0) {
      s.entries.splice(0, s.at);
      s.at = 0;
    } else s.entries.length = s.at + 1;
    return undefined;
  }
}
