/** Trailing-edge debounce: `fn` runs once, `ms` after the last call, with that call's arguments. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args: A) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
