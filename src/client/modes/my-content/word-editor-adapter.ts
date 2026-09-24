/**
 * word-editor-adapter.ts — My Content's side of the shared Word Editor.
 *
 * The editor works in WordData and knows nothing about storage. My Content
 * never edits a real word: it keeps a per-learner *override* holding only what
 * differs from the original (data/user-content.ts). This adapter is the
 * translation between the two —
 *
 *   original Word + override  →  WordData shown in the form (with `original`
 *                                 attached, so the form can mark what changed)
 *   WordData from the form    →  the override that reproduces it, i.e. only
 *                                 the fields that differ from the original
 *
 * — kept as pure functions (`rawToData`, `effectiveToData`, `diffToOverride`)
 * so the mapping can be tested without a DOM or storage.
 */

import type { Word } from '../../types.ts';
import { loadRawWords, getCachedWords } from '../../data/data-loader.ts';
import {
  applyWordOverrideRecord, getUserWords, addUserWord, removeUserWord, removeWordOverride,
  replaceWordOverride, getWordOverrides, pickWordOverride,
  type WordOverride,
} from '../../data/user-content.ts';
import { bandForRank } from '../../data/bands.ts';
import { LANGUAGE_NAMES } from '../../data/languages.ts';
import { foldKey } from '../../utils/match.ts';
import { POS_CHIPS } from '../my-lists/types.ts';
import { showToast } from '../../ui/toast.ts';
import { Settings } from '../../settings.ts';
import type {
  WordData, WordEditorAdapter, WordEditorMeta, WordPage, WordPageQuery,
} from '../../ui/word-editor/types.ts';

export type WordScope = 'all' | 'edited' | 'custom';

export interface MyContentAdapterState {
  /** Which words the list shows: everything, only ones with edits, only ones the user added. */
  scope: WordScope;
}

const wordKey = (word: string): string => word.trim().toLowerCase();
const same = (a: readonly unknown[], b: readonly unknown[]): boolean => JSON.stringify(a) === JSON.stringify(b);

// ── Word ↔ WordData ─────────────────────────────────────────────────────────

/** A word as the form shows it: every field the editor knows, from `w`. */
export function rawToData(w: Word): WordData {
  const rank = w.rank ?? null;
  return {
    word: w.word,
    translation: w.translation,
    pos: w.pos,
    // Real words arrive with difficulty as the string "1", not the number 1 (the
    // column is TEXT) — normalised so the form's <select> and comparisons agree.
    difficulty: w.difficulty != null ? String(w.difficulty) : null,
    notes: w.notes ?? '',
    glosses: [...w.glosses],
    examples: [...w.examples],
    domains: [...w.domains],
    emoji: w.emoji ?? null,
    frequency: {
      band: w.frequency?.band ?? bandForRank(rank),
      rank,
      corpus_frequency: w.frequency?.corpus_frequency ?? null,
    },
    linguistic: {
      ipa: w.linguistic?.ipa ?? null,
      syllables: w.linguistic?.syllables ?? null,
      gender: w.linguistic?.gender ?? null,
      plural: w.linguistic?.plural ?? null,
      infinitive: w.linguistic?.infinitive ?? null,
      register: w.linguistic?.register ?? null,
      reflexive: Boolean(w.linguistic?.reflexive),
    },
    tags: [...w.tags],
    disambiguator: w.disambiguator ?? null,
    synonyms: [...(w.relations?.synonyms ?? [])],
    antonyms: [...(w.relations?.antonyms ?? [])],
    meaningDisambiguators: { ...(w.meaningDisambiguators ?? {}) },
  };
}

/** The word as it currently reads (override applied), with the untouched original attached. */
export function effectiveToData(
  raw: Word, override: WordOverride | null, custom: boolean,
): WordData {
  const eff = rawToData(applyWordOverrideRecord(raw, override));
  return { ...eff, original: rawToData(raw), edited: !!override, custom };
}

/**
 * The override that makes `raw` read as `data`: only what differs. Anything the
 * form reports that matches the original is left out, so editing a field back
 * to its original value un-overrides it (and a resync of the real data is never
 * frozen out by a same-value override).
 */
export function diffToOverride(raw: Word, data: Omit<WordData, 'word'>): Omit<WordOverride, 'updatedAt'> {
  const o: Omit<WordOverride, 'updatedAt'> = {};
  const orig = rawToData(raw);

  const translation = (data.translation ?? '').trim();
  if (translation !== orig.translation) o.translation = translation;

  const pos = data.pos || null;
  if (pos !== (orig.pos ?? null)) o.pos = pos;

  const notes = (data.notes ?? '').trim();
  if (notes !== orig.notes) o.notes = notes;

  const domains = data.domains ?? [];
  if (!same(domains, orig.domains ?? [])) o.domains = [...domains];

  const examples = data.examples ?? [];
  if (!same(examples, orig.examples ?? [])) o.examples = [...examples];

  const difficulty = data.difficulty ? Number(data.difficulty) : null;
  const origDifficulty = orig.difficulty != null ? Number(orig.difficulty) : null;
  if (difficulty !== origDifficulty) o.difficulty = difficulty;

  // A cleared rank is not an override (there is no "no rank" to override to) —
  // it just leaves the original in place.
  const rank = data.frequency?.rank ?? null;
  if (rank != null && rank !== (orig.frequency?.rank ?? null)) o.rank = rank;

  const tags = data.tags ?? [];
  if (!same(tags, orig.tags ?? [])) o.tags = [...tags];
  const synonyms = data.synonyms ?? [];
  if (!same(synonyms, orig.synonyms ?? [])) o.synonyms = [...synonyms];
  const antonyms = data.antonyms ?? [];
  if (!same(antonyms, orig.antonyms ?? [])) o.antonyms = [...antonyms];

  // An empty disambiguator over a real one is meaningful (it hides it), so this
  // compares as written rather than treating '' as "unset".
  const disambiguator = (data.disambiguator ?? '').trim();
  if (disambiguator !== (orig.disambiguator ?? '')) o.disambiguator = disambiguator;

  // Glosses: a plain list in the form; three things in the override. What the
  // original had that is gone is *hidden* (never deleted — Revert brings it
  // back), what is new is *added*, and if the order is not simply the original
  // order followed by the additions, the full order is recorded.
  const final = data.glosses ?? [];
  const origGlosses = orig.glosses ?? [];
  const hidden = origGlosses.filter(g => !final.includes(g));
  const added = final.filter(g => !origGlosses.includes(g));
  if (hidden.length) o.hiddenGlosses = hidden;
  if (added.length) o.addedGlosses = added;
  const natural = [...origGlosses.filter(g => final.includes(g)), ...added];
  if (!same(final, natural)) o.glossOrder = [...final];

  // Per-sense notes: keep only the senses whose note differs from the original.
  const origNotes = orig.meaningDisambiguators ?? {};
  const notesNow = data.meaningDisambiguators ?? {};
  const noteDiff: Record<string, string> = {};
  for (const g of final) {
    const now = (notesNow[g] ?? '').trim();
    if (now !== (origNotes[g] ?? '')) noteDiff[g] = now;
  }
  if (Object.keys(noteDiff).length) o.meaningDisambiguators = noteDiff;

  return o;
}

// ── The adapter ─────────────────────────────────────────────────────────────

const POS_VALUES = [...POS_CHIPS.map(c => c.value).filter(Boolean), 'phrase', 'other'];

async function findRaw(lang: string, key: string): Promise<Word | undefined> {
  const k = wordKey(key);
  return (await loadRawWords(lang)).find(w => wordKey(w.word) === k);
}

async function currentData(lang: string, key: string): Promise<WordData> {
  const raw = await findRaw(lang, key);
  if (!raw) throw new Error(`"${key}" is not in this language's vocabulary`);
  const custom = getUserWords(lang).some(u => wordKey(u.word) === wordKey(key));
  return effectiveToData(raw, pickWordOverride(getWordOverrides(lang), key), custom);
}

export function createMyContentAdapter(state: MyContentAdapterState): WordEditorAdapter {
  return {
    async getMeta(): Promise<WordEditorMeta> {
      // Domains come from whichever languages are already loaded — a domain the
      // learner has never had reason to load is not worth a download to suggest.
      const domains = new Set<string>();
      LANGUAGE_NAMES.forEach(l => getCachedWords(l)?.forEach(w => w.domains.forEach(d => domains.add(d))));
      return {
        pos: POS_VALUES,
        domains: [...domains].sort(),
        languages: LANGUAGE_NAMES,
        disambiguatorSupported: true,
      };
    },

    async fetchPage(q: WordPageQuery): Promise<WordPage> {
      const raw = await loadRawWords(q.lang);
      const overrides = getWordOverrides(q.lang);
      const userKeys = new Set(getUserWords(q.lang).map(u => wordKey(u.word)));

      type Row = { raw: Word; o: WordOverride | null; custom: boolean };
      let rows: Row[] = raw.map(w => ({ raw: w, o: pickWordOverride(overrides, w.word), custom: userKeys.has(wordKey(w.word)) }));
      if (state.scope === 'edited') rows = rows.filter(r => r.o);
      else if (state.scope === 'custom') rows = rows.filter(r => r.custom);

      const needle = q.search ? foldKey(q.search) : '';
      const posSet = new Set(q.pos ? q.pos.split(',') : []);
      const bandSet = new Set(q.band ? q.band.split(',') : []);
      const domainSet = new Set(q.domain ? q.domain.split(',') : []);
      if (needle || posSet.size || bandSet.size || domainSet.size) {
        rows = rows.filter(r => {
          const e = applyWordOverrideRecord(r.raw, r.o);
          if (posSet.size && !posSet.has(e.pos ?? '')) return false;
          if (bandSet.size && !bandSet.has(bandForRank(e.rank ?? null) ?? '')) return false;
          if (domainSet.size && !e.domains.some(d => domainSet.has(d))) return false;
          if (needle) {
            return foldKey(e.word).includes(needle)
              || foldKey(e.translation).includes(needle)
              || e.glosses.some(g => foldKey(g).includes(needle));
          }
          return true;
        });
      }

      // Most frequent first, like the Admin list. Words the user added carry
      // ranks past the real vocabulary, so they land at the end.
      const rankOf = (r: Row): number => r.o?.rank ?? r.raw.rank ?? Number.MAX_SAFE_INTEGER;
      rows.sort((a, b) => rankOf(a) - rankOf(b));

      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / q.limit));
      const page = Math.min(Math.max(1, q.page), pages);
      const slice = rows.slice((page - 1) * q.limit, page * q.limit);
      return { words: slice.map(r => effectiveToData(r.raw, r.o, r.custom)), total, page, pages };
    },

    async updateWord(key, lang, data) {
      const raw = await findRaw(lang, key);
      if (!raw) throw new Error(`"${key}" is not in this language's vocabulary`);
      replaceWordOverride(lang, key, diffToOverride(raw, data));
      return currentData(lang, key);
    },

    async createWord(key, lang, data) {
      const word = key.trim();
      const translation = (data.translation ?? '').trim();
      if (!translation) throw new Error('Enter a translation for the new word');
      if (await findRaw(lang, word)) throw new Error(`"${word}" already exists — search for it to edit it`);
      addUserWord(lang, {
        word,
        translation,
        // `translation` is the primary sense; toWord() puts it first, so only
        // the *other* glosses are stored as extras.
        extraGlosses: (data.glosses ?? []).filter(g => g !== translation),
        pos: data.pos || null,
        domains: data.domains ?? [],
        notes: (data.notes ?? '').trim(),
        examples: data.examples ?? [],
        difficulty: data.difficulty ? Number(data.difficulty) : null,
        tags: data.tags ?? [],
        synonyms: data.synonyms ?? [],
        antonyms: data.antonyms ?? [],
        disambiguator: (data.disambiguator ?? '').trim(),
        meaningDisambiguators: data.meaningDisambiguators ?? {},
        rank: data.frequency?.rank ?? null,
      });
      return currentData(lang, word);
    },

    // Settings → "Confirm before removing a word edit" — the same prompt the
    // original editor showed before dropping a word's overrides.
    confirmRevert: key =>
      !Settings.getConfirmRemoveWordOverride()
      || window.confirm(`Revert every edit you made to "${key}"?`),

    async revertWord(key, lang) {
      removeWordOverride(lang, key);
      return currentData(lang, key);
    },

    async deleteWord(key, lang) {
      const k = wordKey(key);
      const mine = getUserWords(lang).find(u => wordKey(u.word) === k);
      if (!mine) throw new Error('Only words you added can be deleted');
      removeUserWord(lang, mine.id);
      removeWordOverride(lang, key);
    },

    notify: (message, kind) => showToast(message, kind),
  };
}
