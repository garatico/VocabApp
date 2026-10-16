/** slices.test.ts — mapInSlices (src/client/utils/slices.ts) maps like Array.map and lets the page run between slices. */
import { describe, it, expect } from 'vitest';
import { mapInSlices } from '../../src/client/utils/slices.ts';

describe('mapInSlices', () => {
  it('gives what map gives, in order', async () => {
    const items = Array.from({ length: 5000 }, (_, i) => i);
    expect(await mapInSlices(items, n => n * 2)).toEqual(items.map(n => n * 2));
    expect(await mapInSlices([], n => n)).toEqual([]);
  });

  it('lets a timer run between slices of a long job', async () => {
    let timerRan = false;
    setTimeout(() => { timerRan = true; }, 0);
    const seenDuring: boolean[] = [];
    await mapInSlices(Array.from({ length: 20_000 }, (_, i) => i), n => {
      if (n % 1000 === 0) seenDuring.push(timerRan);
      const end = performance.now() + 0.01; while (performance.now() < end) { /* work */ }
      return n;
    }, 2);
    expect(seenDuring.at(0)).toBe(false);
    expect(seenDuring.at(-1)).toBe(true);
  });
});
