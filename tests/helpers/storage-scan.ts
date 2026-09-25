/**
 * storage-scan.ts — finds every localStorage key family named in src/client.
 *
 * Shared by the fixture-coverage test (storage-golden.test.ts) and the registry
 * tests (storage-keys.test.ts), so "what keys does the source mention?" has one
 * answer. It is a static scan, so it can only find keys that are written down:
 * a key assembled from runtime data would escape it, which is why the golden
 * fixture (which exercises the real writers) is the other half of the net.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

/**
 * Key families named in source. Three shapes, because keys are built three ways:
 *   1. a literal with an app prefix:            'vq_srs_'   `ml_folders_${scope}`
 *   2. a constant prefix plus a suffix:         const P = 'uc_';  `${P}words_`  /  P + 'words_'
 *   3. a constant key with no app prefix at all: const STORAGE_KEY = 'theme'; WIDTHS_KEY = 'admin_table_col_widths'
 * (2) and (3) were invisible to a literal-only scan, which is how the admin panel's
 * six `admin_*` keys and every `uc_*` family slipped past the first version.
 */
export function familiesInSource(): Set<string> {
  const out = new Set<string>();
  const literal = /[`'"]((?:vq_|ml_|uc_|s_)[a-z0-9_]*)(?:\$\{[^}]*\}[a-z0-9_]*)*[`'"]?/g;
  for (const f of sourceFiles(join(ROOT, 'src/client'))) {
    // The registry lists every family by name; scanning it would make "the source names
    // only registered families" true by construction and hide dead entries.
    if (/utils[\\/]storage-keys\.ts$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(literal)) out.add(m[1]);

    // (2) constants holding an app prefix, then used as `${NAME}suffix` or NAME + 'suffix'
    const prefixes = new Map<string, string>();
    for (const m of text.matchAll(/\b(?:const|let)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*['"]((?:vq_|ml_|uc_|s_)[a-z0-9_]*)['"]/g)) {
      prefixes.set(m[1], m[2]);
    }
    for (const [name, prefix] of prefixes) {
      for (const m of text.matchAll(new RegExp('\\$\\{' + name + '\\}([a-z0-9_]+)', 'g'))) out.add(prefix + m[1]);
      for (const m of text.matchAll(new RegExp('\\b' + name + "\\s*\\+\\s*[`'\"]([a-z0-9_]+)", 'g'))) out.add(prefix + m[1]);
    }

    // (3) key constants without an app prefix (admin panel, theme)
    for (const m of text.matchAll(/\b(?:const|let)\s+[A-Za-z_]*KEY[A-Za-z_]*\s*(?::[^=]+)?=\s*['"]([a-z][a-z0-9_]*)['"]/g)) {
      if (!/^(?:vq_|ml_|uc_|s_)/.test(m[1])) out.add(m[1]);
    }

    // Settings keys are written as get('name') / set('name') under the s_ prefix.
    if (/settings[^/\\]*\.ts$/.test(f)) {
      for (const m of text.matchAll(/\b(?:get|set)\('([a-z][a-z0-9_]*)'/g)) out.add('s_' + m[1]);
    }
  }
  // A bare "vq_" / "s_" is a prefix check, not a key.
  return new Set([...out].filter(k => !/^(vq_|ml_|uc_|s_)$/.test(k)));
}

/** A concrete key to classify for a source family: prefixes get a plausible suffix. */
export function sampleKeyFor(family: string): string {
  return family.endsWith('_') ? family + 'spanish' : family;
}
