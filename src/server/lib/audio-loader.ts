/**
 * audio-loader.ts — filesystem-based pronunciation-audio detection.
 *
 * Audio lives at data/audio/<language>/<slug>.wav, one file per (language,
 * word) pair — generated offline by VocabApp-Data's `audio` pipeline step
 * (Piper TTS), never fetched or synthesized at request time. Unlike
 * svg-loader.ts's CONCEPTS map, there is no file shared across languages
 * here: a word's pronunciation is part of its identity, not a filing
 * choice, so this is mounted plainly at /audio (see app.ts) rather than
 * through flat-static.ts's flattened, language-agnostic index — two
 * different languages can and do share a spelling (e.g. "que"), and a flat
 * index would make one of them permanently unreachable.
 *
 * slugify() must match audio.py's slugify() in the VocabApp-Data repo
 * exactly — the two are independent implementations of the same filename
 * rule, not shared code, since the two projects share no code across the
 * split (see that file's own comment on the same point).
 */

import fs   from 'fs';
import path from 'path';
import { dataDir } from './paths.js';

// Windows reserves these as device names — CON, PRN, AUX, NUL, COM1-9,
// LPT1-9 — for *any* file, regardless of extension: "con.wav" resolves to
// the console device, not a file on disk, to plain Win32 file APIs. Must
// match audio.py's own _WINDOWS_RESERVED set exactly, same reasoning as
// slugify() itself.
const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  ...'0123456789'.split('').map(d => `com${d}`),
  ...'0123456789'.split('').map(d => `lpt${d}`),
]);

function slugify(word: string): string {
  const s = word.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
  return WINDOWS_RESERVED.has(s) ? s + '_' : s;
}

function audioPath(language: string, word: string): string {
  return path.join(dataDir, 'audio', language.toLowerCase(), `${slugify(word)}.wav`);
}

function fileExists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}

/** `/audio/{language}/{slug}.wav`, or null if no audio file exists for this word yet. */
export function getAudioUrl(language: string, word: string): string | null {
  if (!language || !word) return null;
  if (!fileExists(audioPath(language, word))) return null;
  return `/audio/${language.toLowerCase()}/${slugify(word)}.wav`;
}

export default { getAudioUrl };
