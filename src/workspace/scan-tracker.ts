/**
 * Bookkeeping for the initial scan versus live events: any URI touched by an event (changed,
 * removed, opened) after the scan began must not be overwritten by the scan's older disk content.
 */
export class ScanTracker {
  private touched = new Set<string>();
  private scanning = true;

  /** Record an event for `key`. */
  touch(key: string): void {
    if (this.scanning) this.touched.add(key);
  }

  isTouched(key: string): boolean {
    return this.touched.has(key);
  }

  /**
   * The text the scan may add for `key`: undefined when an event already handled it, else the open
   * editor text when there is one, else the disk text.
   */
  resolve(key: string, diskText: string | undefined, openText?: string): string | undefined {
    if (this.touched.has(key)) return undefined;
    return openText ?? diskText;
  }

  end(): void {
    this.scanning = false;
    this.touched.clear();
  }
}
