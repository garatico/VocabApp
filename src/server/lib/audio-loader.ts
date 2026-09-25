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
import { slugify } from '../../shared/assets/audio-slug.js';

function audioDir(language: string): string {
  return path.join(dataDir, 'audio', language.toLowerCase());
}

// One directory listing per language instead of an fs.existsSync per word.
// Loading a language asks "is there audio for this word?" ~26,000 times; as
// individual stat calls that was ~0.8 s of the ~1.2 s cold load (and blocks the
// whole server while it runs). A Set lookup is free.
//
// Audio is generated offline and can appear while the server is up, so a miss
// re-reads the directory — at most once per RESCAN_COOLDOWN_MS, which keeps a
// full load (mostly misses) to a single scan.
const RESCAN_COOLDOWN_MS = 5000;
const listings = new Map<string, { at: number; files: Set<string> }>();

function scan(lang: string): { at: number; files: Set<string> } {
  let files: Set<string>;
  try { files = new Set(fs.readdirSync(audioDir(lang))); } catch { files = new Set(); }
  const entry = { at: Date.now(), files };
  listings.set(lang, entry);
  return entry;
}

/** Forget every cached listing (tests; or after a bulk audio import). */
export function clearAudioIndex(): void {
  listings.clear();
}

/** `/audio/{language}/{slug}.wav`, or null if no audio file exists for this word yet. */
export function getAudioUrl(language: string, word: string): string | null {
  if (!language || !word) return null;
  const lang = language.toLowerCase();
  const slug = slugify(word);
  const file = `${slug}.wav`;

  let entry = listings.get(lang) ?? scan(lang);
  if (!entry.files.has(file) && Date.now() - entry.at > RESCAN_COOLDOWN_MS) entry = scan(lang);
  return entry.files.has(file) ? `/audio/${lang}/${file}` : null;
}

export default { getAudioUrl, clearAudioIndex };
