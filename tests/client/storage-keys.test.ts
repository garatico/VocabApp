/**
 * storage-keys.test.ts — the key registry (src/client/utils/storage-keys.ts).
 *
 * Phase 1 must change nothing at runtime, so the heart of this file is an
 * equivalence proof: full-backup's key filter, now driven by the registry, is
 * compared against the hand-written filter it replaced (kept verbatim below as
 * the oracle) over every key we know of, adversarial keys, and thousands of
 * random ones. The rest guards the registry itself: it must be complete, free
 * of dead or ambiguous entries, and classify the ambiguous cases correctly.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KEY_FAMILIES, classifyKey, keyClass, isBackedUp, APP_PREFIXES,
} from '../../src/client/utils/storage-keys.ts';
import { familiesInSource, sampleKeyFor, ROOT } from '../helpers/storage-scan.ts';

const golden = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/storage/current.raw.json'), 'utf8')) as
  { data: Record<string, string> };
const GOLDEN_KEYS = Object.keys(golden.data);

// ── the oracle: full-backup.ts's filter exactly as it was before the registry ───
const OLD_PREFIXES = ['s_', 'vq_', 'ml_', 'uc_'];
const OLD_KEYS = new Set(['theme', 'filterExpanded']);
const OLD_EXCLUDED = new Set(['s_last_backup_at', 's_backup_first_seen']);
function oldIsDataKey(key: string): boolean {
  if (OLD_EXCLUDED.has(key)) return false;
  return OLD_KEYS.has(key) || OLD_PREFIXES.some(p => key.startsWith(p));
}

/** Keys the old filter never had a chance to see: the admin panel's are unprefixed, so it excluded them. */
const ADMIN_KEYS = KEY_FAMILIES.filter(f => f.pattern.startsWith('admin_')).map(f => f.pattern);

/**
 * The deliberate differences from the old filter, and only these. Each is a decision:
 *  - the admin panel's keys were excluded only by accident (no prefix); now by rule;
 *  - vq_schema_version (Phase 2) is bookkeeping about *this browser's* layout. Backing it up
 *    would let a restore claim old data was already migrated, so a backup records the schema
 *    beside the data instead (full-backup.ts) and a restore sets the version to match.
 */
const DELIBERATE = [...ADMIN_KEYS, 'vq_schema_version'];

describe('equivalence with the filter the registry replaced', () => {
  const corpus = (): string[] => {
    const fromRegistry = KEY_FAMILIES.flatMap(f => f.match === 'prefix'
      ? [f.pattern, f.pattern + 'spanish', f.pattern + 'x_y'] : [f.pattern]);
    const fromSource = [...familiesInSource()].map(sampleKeyFor);
    const adversarial = [
      '', 'x', 'random', 'vq', 'vq_', 's_', 'ml_', 'uc_', 'S_simple_mode', 'VQ_mode', 'theme2', 'Theme',
      'filterexpanded', ' theme', 'admin_', 'admin', 'admin_table_page_size_custom_x', 'uc_glossorder_',
      'uc_glossorder_spanish', 'vq_history_collapsed', 'vq_history_collapsedx', 's_last_backup_at',
      's_last_backup_at2', 's_backup_first_seen', 'vq_resume_table', 'vq_known_spanish', 'unrelated_lib_key',
      '__vq_probe__', 'i18nextLng', 'debug', 'vq_future_feature_v9', 's_future_setting', 'ml_future_', 'uc_future_x',
    ];
    return [...new Set([...GOLDEN_KEYS, ...fromRegistry, ...fromSource, ...adversarial])];
  };

  it('agrees on every known, adversarial and registered key — except the deliberate differences', () => {
    const disagreements = corpus().filter(k => oldIsDataKey(k) !== isBackedUp(k));
    // The old filter excluded admin_* only because it had no rule for unprefixed keys; the registry
    // makes that explicit (`backup: false`). Any *other* disagreement is a behaviour change.
    expect(disagreements.filter(k => !DELIBERATE.includes(k))).toEqual([]);
    for (const k of ADMIN_KEYS) { expect(oldIsDataKey(k)).toBe(false); expect(isBackedUp(k)).toBe(false); }
    // The one place the old filter would have been wrong: it would have backed up the version marker.
    expect(oldIsDataKey('vq_schema_version')).toBe(true);
    expect(isBackedUp('vq_schema_version')).toBe(false);
  });

  it('agrees on 20,000 random keys built from the prefixes and pieces the app uses', () => {
    let seed = 987654321;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pieces = ['vq_', 'ml_', 'uc_', 's_', 'admin_', 'theme', 'history', 'collapsed', 'srs_', 'lists_', 'glossorder_',
      'known_', 'last_backup_at', 'backup_first_seen', 'spanish', 'french', '_', 'x', '1', 'Z', 'table', 'mode', 'kid_friendly_mode'];
    const bad: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const n = 1 + Math.floor(rnd() * 4);
      const k = Array.from({ length: n }, () => pieces[Math.floor(rnd() * pieces.length)]).join('');
      if (oldIsDataKey(k) !== isBackedUp(k) && !DELIBERATE.includes(k)) bad.push(k);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('every key the golden fixture holds is backed up exactly when it used to be', () => {
    for (const k of GOLDEN_KEYS.filter(k => !DELIBERATE.includes(k))) expect([k, isBackedUp(k)]).toEqual([k, oldIsDataKey(k)]);
  });
});

describe('completeness', () => {
  it('every key family the source names is in the registry', () => {
    const unknown = [...familiesInSource()].filter(f => classifyKey(sampleKeyFor(f)) === null).sort();
    expect(unknown, `Register these in src/client/utils/storage-keys.ts (and seed them in the fixture):\n${unknown.join('\n')}`).toEqual([]);
  });

  it('every key the golden fixture holds is classified', () => {
    expect(GOLDEN_KEYS.filter(k => classifyKey(k) === null)).toEqual([]);
  });

  it('no registry entry is dead: each is reached by a source family or a fixture key', () => {
    const reached = new Set<unknown>();
    for (const f of familiesInSource()) reached.add(classifyKey(sampleKeyFor(f)));
    for (const k of GOLDEN_KEYS) reached.add(classifyKey(k));
    const dead = KEY_FAMILIES.filter(f => !reached.has(f)).map(f => f.pattern);
    expect(dead, 'Entries no code or fixture key reaches — remove them or seed them').toEqual([]);
  });
});

describe('the registry itself', () => {
  it('has no duplicate patterns', () => {
    const seen = new Set<string>();
    const dupes = KEY_FAMILIES.map(f => f.pattern).filter(p => seen.has(p) || !seen.add(p));
    expect(dupes).toEqual([]);
  });

  it('prefix patterns end in an underscore, so "vq_history_" cannot swallow "vq_historyx"', () => {
    expect(KEY_FAMILIES.filter(f => f.match === 'prefix' && !f.pattern.endsWith('_')).map(f => f.pattern)).toEqual([]);
  });

  it('every owner is a real file', () => {
    const missing = KEY_FAMILIES.filter(f => !existsSync(join(ROOT, 'src/client', f.owner))).map(f => `${f.pattern} -> ${f.owner}`);
    expect(missing).toEqual([]);
  });

  it('only bookkeeping and explicit opt-outs are excluded from backups', () => {
    const excluded = KEY_FAMILIES.filter(f => (f.backup ?? f.class !== 'bookkeeping') === false).map(f => f.pattern).sort();
    expect(excluded).toEqual([
      's_backup_first_seen', 's_last_backup_at', 'vq_schema_version',
      ...ADMIN_KEYS,
    ].sort());
  });

  it('every app-prefixed key is either registered or falls back to being backed up', () => {
    for (const p of APP_PREFIXES) expect(isBackedUp(p + 'brand_new_key')).toBe(classifyKey(p + 'brand_new_key')?.class === 'bookkeeping' ? false : true);
    expect(isBackedUp('some_other_apps_key')).toBe(false);
  });
});

describe('the cases the old prefix approach got wrong or could not express', () => {
  const cls = (k: string) => keyClass(k);

  it('a panel\'s collapsed state is UI even though it wears the history-data prefix', () => {
    expect(cls('vq_history_spanish')).toBe('data');
    expect(cls('vq_history_collapsed')).toBe('ui');
  });

  it('the specific beats the general: legacy gloss order is not plain My Content data', () => {
    expect(cls('uc_words_spanish')).toBe('data');
    expect(cls('uc_triviaoverride_spanish')).toBe('data');
    expect(cls('uc_glossorder_spanish')).toBe('legacy');
  });

  it('settings, UI state and housekeeping under the shared s_ prefix are told apart', () => {
    expect(cls('s_simple_mode')).toBe('settings');
    expect(cls('s_lang_color_spanish')).toBe('settings');
    expect(cls('s_section_open_bodyTable')).toBe('ui');
    expect(cls('s_onboarding_seen')).toBe('ui');
    expect(cls('s_last_backup_at')).toBe('bookkeeping');
    expect(cls('s_kid_friendly_mode')).toBe('legacy');
  });

  it('irreplaceable data is data, wherever its prefix sits', () => {
    for (const k of ['vq_lists_spanish', 'vq_lists_multi', 'vq_mastery_spanish', 'vq_mastery_dates_spanish', 'vq_srs_spanish',
      'vq_misses_spanish', 'vq_tally_spanish', 'vq_streak_best', 'vq_daily_goal', 'vq_daily_progress_spanish',
      'vq_presets_table', 'vq_visual_profiles', 'vq_chat_history', 'vq_smart_spanish', 'ml_folders_single_spanish',
      'ml_folder_style_smart_spanish', 'ml_starter_seeded_spanish', 'uc_pictures_spanish']) {
      expect([k, cls(k)]).toEqual([k, 'data']);
    }
  });

  it('what is only "where you left off" is not data', () => {
    for (const k of ['vq_mode', 'vq_lang', 'vq_size', 'vq_sort', 'vq_resume_table', 'vq_classfilter_table', 'ml_browse_sort',
      'ml_sidebar_section_collapsed_smart', 'filterExpanded', 'admin_table_col_widths']) {
      expect([k, cls(k)]).toEqual([k, 'ui']);
    }
    expect(cls('theme')).toBe('settings');
  });

  it('an unknown key is unknown', () => {
    expect(cls('some_other_apps_key')).toBeNull();
    expect(cls('vq_future_feature_v9')).toBeNull();
  });
});
