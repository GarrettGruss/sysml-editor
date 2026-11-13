/** Helpers to do large work in slices that let the event loop breathe. */

export const yieldToEventLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Run `fn` over `items` in batches of `size`, yielding between batches. Stops early when `cancelled()`. */
export async function inBatches<T>(
  items: readonly T[],
  size: number,
  fn: (batch: T[]) => Promise<void> | void,
  opts: { yieldFn?: () => Promise<void>; cancelled?: () => boolean } = {},
): Promise<void> {
  const yieldFn = opts.yieldFn ?? yieldToEventLoop;
  for (let i = 0; i < items.length; i += size) {
    if (opts.cancelled?.()) return;
    await fn(items.slice(i, i + size));
    await yieldFn();
  }
}
