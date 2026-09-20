/**
 * audio-slug.ts — the filename slug rule, moved out of
 * src/server/lib/audio-loader.ts so the Tauri client can compute the same
 * slug without needing fs.existsSync (see src/client/tauri/asset-resolver.ts,
 * which checks a build-time manifest instead).
 *
 * Must match audio.py's slugify() in the VocabApp-Data repo exactly — the
 * two are independent implementations of the same filename rule, not shared
 * code, since the two projects share no code across the split.
 */

// Windows reserves these as device names — CON, PRN, AUX, NUL, COM1-9,
// LPT1-9 — for *any* file, regardless of extension. Must match audio.py's
// own _WINDOWS_RESERVED set exactly, same reasoning as slugify() itself.
export const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  ...'0123456789'.split('').map(d => `com${d}`),
  ...'0123456789'.split('').map(d => `lpt${d}`),
]);

export function slugify(word: string): string {
  const s = word.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
  return WINDOWS_RESERVED.has(s) ? s + '_' : s;
}
