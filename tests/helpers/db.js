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
    -- Trivia and Guess the Blank question banks: "concept + per-language
    -- translations" (schema v3 of the sibling VocabApp-Data project) — a
    -- question is authored once as a concept row and translated into any
    -- number of languages independently, English included as an equal
    -- rather than a hardcoded side-channel. Not in REQUIRED_WORD_COLUMNS/
    -- REQUIRED_TABLES by design (see content-loader.ts) — these four exist
    -- here so route tests have real rows to assert against, not because the
    -- app requires them to boot.
    CREATE TABLE trivia_questions (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,
      domains     TEXT,
      difficulty  TEXT NOT NULL,
      answer_type TEXT NOT NULL
    );
    CREATE TABLE trivia_translations (
      question_id        TEXT NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
      language           TEXT NOT NULL,
      reading_difficulty TEXT NOT NULL,
      reading_length     TEXT NOT NULL,
      question_text      TEXT NOT NULL,
      answers            TEXT NOT NULL,
      updated_at         TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (question_id, language)
    );
    CREATE TABLE guess_blank_questions (
      id         TEXT PRIMARY KEY,
      category   TEXT NOT NULL,
      domains    TEXT,
      difficulty TEXT NOT NULL
    );
    CREATE TABLE guess_blank_translations (
      question_id TEXT NOT NULL REFERENCES guess_blank_questions(id) ON DELETE CASCADE,
      language    TEXT NOT NULL,
      clues       TEXT NOT NULL,
      answer      TEXT NOT NULL,
      updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (question_id, language)
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

// Concept + per-language translations. Deliberately includes, beyond the
// "one concept, several languages" happy path:
//   - es-j1 / es-j-b1: spanish and english translations with CONTENT that
//     differs (not just wording) between the two languages, so a test that
//     fetches 'spanish' and checks the english-side fields actually proves
//     the join didn't cross the two — matching text wouldn't prove that.
//   - es-noeng1 / es-b-noeng: a concept with a translation in one language
//     and NO 'english' row at all, proving loadTriviaQuestions/
//     loadGuessBlankQuestions degrade gracefully (empty string/array, not a
//     throw) rather than assuming every concept has been migrated with an
//     English translation.
const SEED_TRIVIA_QUESTIONS = [
  { id: 'es-h1',     category: 'history',     domains: '["history"]',   difficulty: 'easy',   answer_type: 'year' },
  { id: 'es-p1',     category: 'pop-culture', domains: '["art"]',       difficulty: 'medium', answer_type: 'person' },
  { id: 'pt-h1',     category: 'history',     domains: '["geography"]', difficulty: 'easy',   answer_type: 'place' },
  { id: 'es-j1',     category: 'history',     domains: '["geography"]', difficulty: 'easy',   answer_type: 'place' },
  { id: 'es-noeng1', category: 'pop-culture', domains: null,             difficulty: 'hard',   answer_type: 'thing' },
];

const SEED_TRIVIA_TRANSLATIONS = [
  { question_id: 'es-h1', language: 'spanish', reading_difficulty: 'easy', reading_length: 'short',
    question_text: '¿En qué año llegó Cristóbal Colón a América?', answers: '["1492"]' },
  { question_id: 'es-h1', language: 'english', reading_difficulty: 'easy', reading_length: 'short',
    question_text: 'In what year did Christopher Columbus arrive in the Americas?', answers: '["1492"]' },

  { question_id: 'es-p1', language: 'spanish', reading_difficulty: 'easy', reading_length: 'short',
    question_text: '¿Quién pintó el cuadro "Guernica"?', answers: '["Pablo Picasso","Picasso"]' },
  { question_id: 'es-p1', language: 'english', reading_difficulty: 'easy', reading_length: 'short',
    question_text: 'Who painted "Guernica"?', answers: '["Pablo Picasso","Picasso"]' },

  { question_id: 'pt-h1', language: 'portuguese', reading_difficulty: 'easy', reading_length: 'short',
    question_text: 'Qual é a capital de Portugal?', answers: '["Lisboa"]' },
  { question_id: 'pt-h1', language: 'english', reading_difficulty: 'easy', reading_length: 'short',
    question_text: 'What is the capital of Portugal?', answers: '["Lisbon"]' },

  // es-j1: spanish and english deliberately ask about DIFFERENT countries so
  // a crossed join is unmistakable, not just differently-worded.
  { question_id: 'es-j1', language: 'spanish', reading_difficulty: 'medium', reading_length: 'short',
    question_text: '¿Cuál es la capital de Francia?', answers: '["París"]' },
  { question_id: 'es-j1', language: 'english', reading_difficulty: 'medium', reading_length: 'short',
    question_text: 'What is the capital of Germany?', answers: '["Berlin"]' },

  // es-noeng1: spanish only, no 'english' row at all.
  { question_id: 'es-noeng1', language: 'spanish', reading_difficulty: 'hard', reading_length: 'long',
    question_text: '¿Qué instrumento tocaba Julio Iglesias antes de ser cantante?', answers: '["la guitarra"]' },
];

const SEED_GUESS_BLANK_QUESTIONS = [
  { id: 'es-b1',      category: 'animal', domains: null, difficulty: 'medium' },
  { id: 'es-b2',      category: 'object', domains: null, difficulty: 'medium' },
  { id: 'pt-b1',      category: 'animal', domains: null, difficulty: 'easy' },
  { id: 'es-j-b1',    category: 'animal', domains: null, difficulty: 'medium' },
  { id: 'es-b-noeng', category: 'animal', domains: null, difficulty: 'hard' },
];

const SEED_GUESS_BLANK_TRANSLATIONS = [
  { question_id: 'es-b1', language: 'spanish',
    clues: '["Vivo en la selva y me gustan los plátanos.","Tengo brazos largos y trepo a los árboles."]', answer: 'el mono' },
  { question_id: 'es-b1', language: 'english',
    clues: '["I live in the jungle and I like bananas.","I have long arms and I climb trees."]', answer: 'the monkey' },

  { question_id: 'es-b2', language: 'spanish',
    clues: '["Me usas todos los días para ver la hora."]', answer: 'el reloj' },
  { question_id: 'es-b2', language: 'english',
    clues: '["You use me every day to see the time."]', answer: 'the clock' },

  { question_id: 'pt-b1', language: 'portuguese',
    clues: '["Sou um animal pequeno.","Eu digo \\"miau\\"."]', answer: 'o gato' },
  { question_id: 'pt-b1', language: 'english',
    clues: '["I\'m a small animal.","I say \\"meow\\"."]', answer: 'the cat' },

  // es-j-b1: spanish and english describe DIFFERENT animals so a crossed
  // join is unmistakable.
  { question_id: 'es-j-b1', language: 'spanish',
    clues: '["Vivo en el mar y tengo ocho brazos."]', answer: 'el pulpo' },
  { question_id: 'es-j-b1', language: 'english',
    clues: '["I live in the ocean and I have eight arms."]', answer: 'the octopus' },

  // es-b-noeng: spanish only, no 'english' row at all.
  { question_id: 'es-b-noeng', language: 'spanish',
    clues: '["Soy un pájaro que no puede volar y vivo en la Antártida."]', answer: 'el pingüino' },
];

function seedContentTables(db) {
  const insertTriviaQuestion = db.prepare(`
    INSERT INTO trivia_questions (id, category, domains, difficulty, answer_type)
    VALUES (:id, :category, :domains, :difficulty, :answer_type)
  `);
  const insertTriviaTranslation = db.prepare(`
    INSERT INTO trivia_translations (question_id, language, reading_difficulty, reading_length, question_text, answers)
    VALUES (:question_id, :language, :reading_difficulty, :reading_length, :question_text, :answers)
  `);
  const insertGuessBlankQuestion = db.prepare(`
    INSERT INTO guess_blank_questions (id, category, domains, difficulty)
    VALUES (:id, :category, :domains, :difficulty)
  `);
  const insertGuessBlankTranslation = db.prepare(`
    INSERT INTO guess_blank_translations (question_id, language, clues, answer)
    VALUES (:question_id, :language, :clues, :answer)
  `);
  for (const q of SEED_TRIVIA_QUESTIONS) insertTriviaQuestion.run(q);
  for (const t of SEED_TRIVIA_TRANSLATIONS) insertTriviaTranslation.run(t);
  for (const q of SEED_GUESS_BLANK_QUESTIONS) insertGuessBlankQuestion.run(q);
  for (const t of SEED_GUESS_BLANK_TRANSLATIONS) insertGuessBlankTranslation.run(t);
}

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seedContentTables(db);

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
