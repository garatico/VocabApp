/**
 * tests/helpers/db.js
 *
 * Builds an in-memory SQLite database with the production schema and a small
 * but representative seed dataset so tests never touch vocabulary.db.
 */

import Database, { initShim } from 'better-sqlite3';

import { REQUIRED_WORD_COLUMNS } from '../../src/server/lib/data-requirements.js';

// Initialise the WASM engine before any Database is constructed.
await initShim?.();

/**
 * The test database is built from what the app says it needs — not from a copy
 * of the producer's DDL, and not from the producer's DDL either.
 *
 * It was a hand-written copy for a long time, and it had drifted: the columns
 * came in a different order and not one of the five indexes was here, so the
 * suite ran against a table the pipeline does not build, on a query plan
 * production never uses. Reading the pipeline's schema.sql fixed that, but
 * only while the two projects sat in one repository.
 *
 * Generating it from REQUIRED_WORD_COLUMNS is better than either. The suite
 * now runs against exactly the minimum the app claims to require, so a test
 * that passes here is evidence the claim is true — where a copy of the real
 * schema would quietly supply columns the app depends on but never declared.
 */
const TYPES = {
  id:               'INTEGER PRIMARY KEY AUTOINCREMENT',
  word:             'TEXT NOT NULL',
  language:         'TEXT NOT NULL',
  reflexive:        'INTEGER DEFAULT 0',
  rank:             'INTEGER',
  corpus_frequency: 'REAL',
};

/** Columns the pipeline also writes and the app tolerates without requiring. */
const OPTIONAL = ['past_participle', 'gerund', 'updated_at'];

function buildSchema() {
  const columns = [...REQUIRED_WORD_COLUMNS, ...OPTIONAL]
    .map(name => `    ${name} ${TYPES[name] ?? 'TEXT'}`)
    .join(',\n');

  return `
    CREATE TABLE words (
${columns},
      UNIQUE(word, language)
    );
    CREATE TABLE word_glosses (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      gloss    TEXT    NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE word_examples (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      example  TEXT    NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE word_tags (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      tag     TEXT    NOT NULL,
      UNIQUE(word_id, tag)
    );
    CREATE TABLE meta (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_word_glosses_word_id  ON word_glosses(word_id);
    CREATE INDEX idx_word_examples_word_id ON word_examples(word_id);
    CREATE INDEX idx_word_tags_word_id     ON word_tags(word_id);
    CREATE INDEX idx_words_language        ON words(language);
    CREATE INDEX idx_words_lang_rank       ON words(language, rank);
  `;
}

const SCHEMA = buildSchema();

const SEED_WORDS = [
  {
    word: 'hablar', translation: 'hablar', language: 'spanish', pos: 'verb',
    difficulty: 'beginner', notes: 'regular -ar verb', infinitive: 'hablar',
    reflexive: 0, ipa: 'aBlah', rank: 1,
    domains: '["general"]',
    conjugation_class: 'regular-ar',
    glosses: ['to speak', 'to talk'],
    examples: ['Yo hablo espanol.', 'Hablas ingles?'],
  },
  {
    word: 'casa', translation: 'casa', language: 'spanish', pos: 'noun',
    difficulty: 'beginner', notes: '', gender: 'feminine', plural: 'casas',
    ipa: 'kasa', rank: 2,
    domains: '["home","general"]',
    glosses: ['house', 'home'],
    examples: ['Mi casa es grande.'],
  },
  {
    word: 'bonito', translation: 'bonito', language: 'spanish', pos: 'adjective',
    difficulty: 'beginner', notes: '', ipa: 'bonito', rank: 3,
    domains: '["general"]',
    glosses: ['pretty', 'nice', 'beautiful'],
    examples: [],
  },
  {
    word: 'falar', translation: 'falar', language: 'portuguese', pos: 'verb',
    difficulty: 'beginner', notes: 'regular -ar verb', infinitive: 'falar',
    ipa: 'falar', rank: 1,
    domains: '["general"]',
    glosses: ['to speak', 'to talk'],
    examples: ['Eu falo portugues.'],
  },
];

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const insertWord = db.prepare(`
    INSERT INTO words (word, translation, language, pos, difficulty, notes,
      infinitive, reflexive, gender, plural, ipa, rank, domains,
      past_participle, gerund, conjugation_class, future_stem, conjugation_overrides)
    VALUES (:word, :translation, :language, :pos, :difficulty, :notes,
      :infinitive, :reflexive, :gender, :plural, :ipa, :rank, :domains,
      :past_participle, :gerund, :conjugation_class, :future_stem, :conjugation_overrides)
  `);
  const insertGloss   = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
  const insertExample = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');

  const insertAll = db.transaction(() => {
    for (const seed of SEED_WORDS) {
      const info = insertWord.run({
        word:                  seed.word,
        translation:               seed.translation               ?? null,
        language:              seed.language,
        pos:                   seed.pos                   ?? null,
        difficulty:            seed.difficulty            ?? null,
        notes:                 seed.notes                 ?? null,
        infinitive:            seed.infinitive            ?? null,
        reflexive:             seed.reflexive             ?? 0,
        gender:                seed.gender                ?? null,
        plural:                seed.plural                ?? null,
        ipa:                   seed.ipa                   ?? null,
        rank:                  seed.rank                  ?? null,
        domains:               seed.domains               ?? null,
        past_participle:       seed.past_participle       ?? null,
        gerund:                seed.gerund                ?? null,
        conjugation_class:     seed.conjugation_class     ?? null,
        future_stem:           seed.future_stem           ?? null,
        conjugation_overrides: seed.conjugation_overrides ?? null,
      });
      const wordId = info.lastInsertRowid;
      (seed.glosses  || []).forEach((g, i) => insertGloss.run(wordId, g, i));
      (seed.examples || []).forEach((e, i) => insertExample.run(wordId, e, i));
    }
  });

  insertAll();
  return db;
}
