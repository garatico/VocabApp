/**
 * vocab-source.ts — where vocabulary comes from.
 *
 * The web app fetches /api/vocab/:lang from Express. A packaged build — Tauri
 * on Windows, Capacitor on Android — has no Node process to answer that, so it
 * reads a static file exported by `npm run export:vocab` instead.
 *
 * Both produce the same envelope, so callers get one shape either way:
 *
 *   { language, count, data: Word[] }
 *
 * Order of attempts:
 *   1. /api/vocab/:lang     live server, always freshest
 *   2. /data/vocab-:lang.json   bundled export
 *
 * The API is tried first even in a packaged build: it costs one failed request
 * on a file:// origin and means a packaged app pointed at a dev server picks up
 * edits immediately. Once a language resolves, the working source is remembered
 * so the fallback isn't re-probed on every language switch.
 *
 * That one failed request does NOT get the Render cold-start retry treatment
 * below in a packaged build (see isPackagedApp) — there is no server back
 * there that might still be waking up, so retrying is just a ~42s wait for a
 * connection that will never succeed before falling through to the bundled
 * export it should have used immediately.
 */

import type { Word } from '../types.ts';
import { logger } from '../utils/logger.ts';

export type VocabOrigin = 'api' | 'static';

export interface VocabPayload {
  language: string;
  count:    number;
  data:     Word[];
  origin:   VocabOrigin;
}

/** Remembered after the first success, so we stop probing a dead API. */
let preferredOrigin: VocabOrigin | null = null;

function apiUrl(lang: string): string    { return `/api/vocab/${lang}`; }
function staticUrl(lang: string): string { return `/data/vocab-${lang}.json`; }

interface FetchOutcome {
  ok:        boolean;
  data:      Word[];
  count:     number;
  /** Worth retrying: a network error or a gateway status, not a real 404/400. */
  retryable: boolean;
}

export interface LoadVocabCallbacks {
  /** Fires before each retry of the API attempt (Render cold-boot backoff). */
  onRetry?:    (attempt: number, total: number) => void;
  /** Fires as response bytes arrive, so a multi-MB language can show real
   *  download progress instead of a stalled spinner. Bytes are post-decompression
   *  and cumulative; there's no reliable total to divide by (gzip'd
   *  Content-Length describes the wire size, not the decoded size). */
  onProgress?: (loadedBytes: number) => void;
}

/**
 * Read a response body via its stream so `onProgress` can report bytes as
 * they arrive, rather than waiting for the whole multi-MB file (Spanish is
 * ~4.7MB) to land before anything happens. Falls back to a plain read when
 * streaming isn't available or no one's listening.
 */
async function readBody(res: Response, onProgress?: (loadedBytes: number) => void): Promise<string> {
  // Check onProgress first: calling getReader() locks the body stream even
  // if it's never read, which makes the res.text() fallback below hang.
  if (!onProgress || !res.body) return res.text();
  const reader = res.body.getReader();

  const decoder = new TextDecoder();
  let text        = '';
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loadedBytes += value.byteLength;
    text        += decoder.decode(value, { stream: true });
    onProgress(loadedBytes);
  }
  text += decoder.decode();
  return text;
}

async function tryFetch(url: string, onProgress?: (loadedBytes: number) => void): Promise<FetchOutcome> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // 502/503/504 is what Render's proxy returns while a sleeping free-tier
      // dyno is still waking up — worth another attempt. Anything else (404,
      // 400) means the URL itself is wrong and won't fix itself on retry.
      return { ok: false, data: [], count: 0, retryable: [502, 503, 504].includes(res.status) };
    }
    const json = JSON.parse(await readBody(res, onProgress)) as { data?: Word[]; count?: number };
    const data = Array.isArray(json.data) ? json.data : null;
    if (!data) return { ok: false, data: [], count: 0, retryable: false };
    return { ok: true, data, count: json.count ?? data.length, retryable: false };
  } catch {
    // Network error (including a dyno that hasn't started accepting
    // connections yet) — retryable.
    return { ok: false, data: [], count: 0, retryable: true };
  }
}

/**
 * Render's free tier spins a sleeping instance down and takes up to roughly a
 * minute to wake one back up; the request that wakes it usually fails once or
 * twice with a gateway error before the app is actually listening. Retry with
 * backoff instead of falling straight through to the static export on the
 * first blip — about 45s of patience across 5 attempts.
 */
const API_RETRY_DELAYS_MS = [1000, 3000, 6000, 12000, 20000];

/**
 * True in a packaged build with no server behind it — Tauri desktop,
 * Capacitor mobile. The Render cold-start retry loop below exists for the
 * hosted web app's sleeping free-tier backend; applied here it just burns
 * ~42s retrying a `/api/vocab` connection that can never succeed before
 * falling through to the bundled static export it should have used
 * immediately.
 *
 * Checked lazily rather than cached at module load so tests can stub the
 * relevant global before calling loadVocab.
 */
function isPackagedApp(): boolean {
  const g = globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(g.__TAURI_INTERNALS__) || Boolean(g.__TAURI__) || Boolean(g.Capacitor?.isNativePlatform?.());
}

async function tryFetchWithRetry(url: string, callbacks: LoadVocabCallbacks): Promise<FetchOutcome> {
  let result = await tryFetch(url, callbacks.onProgress);
  if (!result.ok && isPackagedApp()) return result;
  for (let attempt = 0; !result.ok && result.retryable && attempt < API_RETRY_DELAYS_MS.length; attempt++) {
    callbacks.onRetry?.(attempt + 1, API_RETRY_DELAYS_MS.length);
    await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAYS_MS[attempt]));
    result = await tryFetch(url, callbacks.onProgress);
  }
  return result;
}

/**
 * Load one language, preferring the live API and falling back to the bundled
 * export. Throws only when both are unavailable.
 */
export async function loadVocab(lang: string, callbacks: LoadVocabCallbacks = {}): Promise<VocabPayload> {
  const order: VocabOrigin[] = preferredOrigin === 'static'
    ? ['static', 'api']
    : ['api', 'static'];

  for (const origin of order) {
    const url    = origin === 'api' ? apiUrl(lang) : staticUrl(lang);
    const result = origin === 'api'
      ? await tryFetchWithRetry(url, callbacks)
      : await tryFetch(url, callbacks.onProgress);
    if (!result.ok) continue;

    if (preferredOrigin !== origin) {
      logger.info(`vocab: loading from ${origin} (${url})`);
      preferredOrigin = origin;
    }
    return { language: lang, count: result.count, data: result.data, origin };
  }

  throw new Error(
    `Could not load vocabulary for "${lang}". `
    + 'No server responded and no bundled copy was found at '
    + `${staticUrl(lang)} — run "npm run export:vocab" for offline builds.`,
  );
}

/** Which source last worked. Null until the first successful load. */
export function currentOrigin(): VocabOrigin | null {
  return preferredOrigin;
}

/**
 * Which languages actually have data, or null if that can't be determined.
 *
 * The app offers a fixed list of languages, but one only becomes usable once
 * the pipeline has mined and synced it. This is what lets the dropdown mark
 * an empty language instead of failing when it's selected.
 *
 * Two sources, matching loadVocab: the live API, then the manifest written by
 * `npm run export:vocab` for packaged builds. Null means neither answered —
 * the caller should assume everything is available rather than disabling the
 * whole dropdown on a transient network error.
 */
export async function availableLanguages(): Promise<string[] | null> {
  try {
    const res = await fetch('/api/languages');
    if (res.ok) {
      const json = await res.json() as { languages?: string[] };
      if (Array.isArray(json.languages)) return json.languages;
    }
    // A live server that doesn't know this route is an older build, not a
    // server with no languages. Returning null means "can't tell", and every
    // language stays enabled.
    //
    // Falling through to the static manifest here was a bug: that file is
    // only regenerated by `npm run export:vocab`, so a stale copy would
    // confidently report a language as missing long after it had been added.
    // A wrong answer is worse than no answer.
    return null;
  } catch {
    // Nothing answered at all — no server. That is the packaged Tauri or
    // Capacitor case, where the bundled manifest is the only source there is
    // and is shipped alongside the data it describes.
  }

  try {
    const res = await fetch('/data/index.json');
    if (res.ok) {
      const json = await res.json() as { languages?: { language: string }[] };
      if (Array.isArray(json.languages)) {
        return json.languages.map(l => l.language).filter(Boolean);
      }
    }
  } catch { /* nothing to go on */ }

  return null;
}

/** Reset the remembered source — used by tests and after a manual reload. */
export function resetOrigin(): void {
  preferredOrigin = null;
}
