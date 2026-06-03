/**
 * tests/helpers/db.js
 *
 * Builds an in-memory SQLite database with the production schema and a small
 * but representative seed dataset so tests never touch vocabulary.db.
 */

import Database, { initShim } from 'better-sqlite3';

// Initialise the WASM engine before any Database is constructed.
await initShim?.();

const SCHEMA = `
  CREATE TABLE words (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    word                  TEXT    NOT NULL,
    display               TEXT,
    language              TEXT    NOT NULL,
    pos                   TEXT,
    difficulty            TEXT,
    notes                 TEXT,
    infinitive            TEXT,
    reflexive             INTEGER DEFAULT 0,
    gender                TEXT,
    plural                TEXT,
    register              TEXT,
    ipa                   TEXT,
    syllables             TEXT,
    conjugations          TEXT,
    emoji                 TEXT,
    band                  TEXT,
    rank                  INTEGER,
    corpus_frequency      REAL,
    domains               TEXT,
    updated_at            TEXT    DEFAULT CURRENT_TIMESTAMP,
    conjugation_class     TEXT,
    future_stem           TEXT,
    conjugation_overrides TEXT,
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
    tag     TEXT    NOT NULL
  );

  CREATE TABLE word_relations (
    word_id    INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    related_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    relation   TEXT,
    PRIMARY KEY (word_id, related_id, relation)
  );
`;

const SEED_WORDS = [
  {
    word: 'hablar', display: 'hablar', language: 'spanish', pos: 'verb',
    difficulty: 'beginner', notes: 'regular -ar verb', infinitive: 'hablar',
    reflexive: 0, ipa: 'aBlah', band: 'A1', rank: 1,
    domains: '["general"]',
    conjugation_class: 'regular-ar',
    glosses: ['to speak', 'to talk'],
    examples: ['Yo hablo espanol.', 'Hablas ingles?'],
  },
  {
    word: 'casa', display: 'casa', language: 'spanish', pos: 'noun',
    difficulty: 'beginner', notes: '', gender: 'feminine', plural: 'casas',
    ipa: 'kasa', band: 'A1', rank: 2,
    domains: '["home","general"]',
    glosses: ['house', 'home'],
    examples: ['Mi casa es grande.'],
  },
  {
    word: 'bonito', display: 'bonito', language: 'spanish', pos: 'adjective',
    difficulty: 'beginner', notes: '', ipa: 'bonito', band: 'A2', rank: 3,
    domains: '["general"]',
    glosses: ['pretty', 'nice', 'beautiful'],
    examples: [],
  },
  {
    word: 'falar', display: 'falar', language: 'portuguese', pos: 'verb',
    difficulty: 'beginner', notes: 'regular -ar verb', infinitive: 'falar',
    ipa: 'falar', band: 'A1', rank: 1,
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
    INSERT INTO words (word, display, language, pos, difficulty, notes,
      infinitive, reflexive, gender, plural, ipa, band, rank, domains,
      conjugation_class, future_stem, conjugation_overrides)
    VALUES (:word, :display, :language, :pos, :difficulty, :notes,
      :infinitive, :reflexive, :gender, :plural, :ipa, :band, :rank, :domains,
      :conjugation_class, :future_stem, :conjugation_overrides)
  `);
  const insertGloss   = db.prepare('INSERT INTO word_glosses (word_id, gloss, position) VALUES (?, ?, ?)');
  const insertExample = db.prepare('INSERT INTO word_examples (word_id, example, position) VALUES (?, ?, ?)');

  const insertAll = db.transaction(() => {
    for (const seed of SEED_WORDS) {
      const info = insertWord.run({
        word:                  seed.word,
        display:               seed.display               ?? null,
        language:              seed.language,
        pos:                   seed.pos                   ?? null,
        difficulty:            seed.difficulty            ?? null,
        notes:                 seed.notes                 ?? null,
        infinitive:            seed.infinitive            ?? null,
        reflexive:             seed.reflexive             ?? 0,
        gender:                seed.gender                ?? null,
        plural:                seed.plural                ?? null,
        ipa:                   seed.ipa                   ?? null,
        band:                  seed.band                  ?? null,
        rank:                  seed.rank                  ?? null,
        domains:               seed.domains               ?? null,
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
