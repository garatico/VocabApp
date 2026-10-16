/**
 * slices.ts — long loops that hand the main thread back now and then, so the page can paint and answer
 * input while a whole language (45k words) is being prepared.
 */

/** How long one slice may run: under the 50 ms at which a task counts as "long". */
export const SLICE_MS = 12;

/** Lets the browser paint and handle input before the loop continues. */
export function yieldToPage(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** `items.map(fn)`, in slices of about SLICE_MS each. */
export async function mapInSlices<T, U>(items: readonly T[], fn: (item: T) => U, sliceMs = SLICE_MS): Promise<U[]> {
  const out: U[] = [];
  let until = performance.now() + sliceMs;
  for (const item of items) {
    out.push(fn(item));
    if ((out.length & 255) === 0 && performance.now() > until) {
      await yieldToPage();
      until = performance.now() + sliceMs;
    }
  }
  return out;
}
