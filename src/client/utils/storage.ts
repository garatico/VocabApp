/**
 * storage.ts — the only module that touches `localStorage`.
 *
 * There were 83 direct calls across 23 files. Roughly half sat inside a
 * `try/catch` and half did not, which is a coin flip rather than a policy:
 * `localStorage` throws on access in Safari's private mode, when a browser has
 * storage disabled for the origin, and on every write once the quota is full.
 * An unguarded read in `settings.ts` or `app.ts` therefore took the whole app
 * down at boot, on exactly the browsers least likely to be reported.
 *
 * So: nothing here throws. A read that cannot happen returns the fallback, a
 * write that cannot happen returns `false` and is dropped. Persistence is a
 * convenience in this app — a lost preference is a worse session, never a
 * broken one — and the call sites read better for not saying so twenty times.
 *
 * ## Keys
 *
 * The literals are unchanged, deliberately. They are already on real machines
 * holding real word lists, and renaming a key is silent data loss. `KEYS`
 * below is a census of the four prefixes in use rather than a scheme anyone
 * would choose:
 *
 *   `s_`   settings          `vq_`  session/mode state
 *   `ml_`  my-lists data     (none) theme, filterExpanded, s_onboarding_seen
 *
 * Unifying them needs a migration that reads the old key, writes the new one
 * and deletes the old — worth doing, but as its own change with its own test.
 */

/**
 * Whether `localStorage` can be reached at all.
 *
 * Probed once with a real write, because merely reading `window.localStorage`
 * succeeds in some browsers that then throw on use.
 */
let available: boolean | null = null;

export function isAvailable(): boolean {
  if (available !== null) return available;
  try {
    const probe = '__vq_probe__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** The stored string, or `fallback` if absent or unreadable. */
export function readString(key: string, fallback: string | null = null): string | null {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Store a string. Returns whether it actually landed. */
export function writeString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a stored JSON value.
 *
 * Returns `fallback` when the key is missing, unreadable, malformed, or fails
 * `guard`. Corrupt entries are common enough to matter: a write interrupted by
 * a quota error leaves truncated JSON behind, and every caller that assumed
 * otherwise threw on the next read.
 *
 * `guard` is a coarse runtime shape check — "is this an object at all", "is
 * this an array of strings" — not a proof of `T`. Callers that care about
 * individual fields still validate them, because a value written by an older
 * version of the app is well-formed JSON of the wrong shape, which no guard
 * this side of a schema can catch.
 */
export function readJson<T>(key: string, fallback: T, guard?: (v: unknown) => boolean): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (guard && !guard(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Serialise and store. Returns whether it landed. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    return writeString(key, JSON.stringify(value));
  } catch {
    return false;   // circular structure, BigInt, …
  }
}

/** Delete a key. Silent if it can't be done. */
export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* nothing to do */ }
}

/**
 * Every key currently stored, as a snapshot.
 *
 * A snapshot rather than a live index because the one caller — the mastery
 * migration — deletes as it goes, and `localStorage.key(i)` re-indexes on every
 * removal, so an index-walking loop silently skips half of what it meant to
 * migrate.
 */
export function keys(): string[] {
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

// ── Shape guards for readJson ────────────────────────────────────────────────

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNumberRecord(v: unknown): v is Record<string, number> {
  return isRecord(v) && Object.values(v).every(x => typeof x === 'number');
}
