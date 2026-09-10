/**
 * tests/content.test.js
 *
 * Integration tests for the trivia / Guess the Blank routes:
 *   GET /api/trivia/:language
 *   GET /api/guess-blank/:language
 *
 * The underlying tables are normalized as "concept + per-language
 * translations" (trivia_questions/trivia_translations and
 * guess_blank_questions/guess_blank_translations — see
 * src/server/lib/content-loader.ts) but the API contract these routes
 * expose is unchanged: a flat, camelCase shape reconstructed via a join.
 * All four tables are OPTIONAL — the last describe block below is the one
 * that actually matters: a database that predates this feature (or hasn't
 * been migrated yet) must keep serving `{ success: true, data: [] }` rather
 * than crashing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';

let app, db;

beforeAll(() => {
  ({ app, db } = buildTestApp());
});

afterAll(() => {
  teardownTestApp(db);
});

describe('GET /api/trivia/:language', () => {
  it('returns the seeded Spanish trivia questions', async () => {
    const res = await request(app).get('/api/trivia/spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('spanish');
    // es-h1, es-p1, es-j1, es-noeng1
    expect(res.body.count).toBe(4);
    expect(res.body.data).toHaveLength(4);
  });

  it('question objects have the expected camelCase shape', async () => {
    const res = await request(app).get('/api/trivia/spanish');
    const q = res.body.data.find(q => q.id === 'es-h1');
    expect(q).toBeDefined();
    expect(q.category).toBe('history');
    expect(q.difficulty).toBe('easy');
    expect(q.readingDifficulty).toBe('easy');
    expect(q.readingLength).toBe('short');
    expect(q.answerType).toBe('year');
    expect(q.questionTarget).toBe('¿En qué año llegó Cristóbal Colón a América?');
    expect(q.questionEn).toContain('Christopher Columbus');
    expect(q.answersTarget).toEqual(['1492']);
    expect(q.answersEn).toEqual(['1492']);
    expect(q.domains).toEqual(['history']);
  });

  it('reconstructs target-language and English fields from separate translation rows without crossing them', async () => {
    const res = await request(app).get('/api/trivia/spanish');
    const q = res.body.data.find(q => q.id === 'es-j1');
    expect(q).toBeDefined();
    // Spanish and English translations deliberately ask about different
    // countries — if the join crossed the two, these would swap.
    expect(q.questionTarget).toBe('¿Cuál es la capital de Francia?');
    expect(q.answersTarget).toEqual(['París']);
    expect(q.questionEn).toBe('What is the capital of Germany?');
    expect(q.answersEn).toEqual(['Berlin']);
  });

  it('falls back to empty questionEn/answersEn for a concept with no english translation', async () => {
    const res = await request(app).get('/api/trivia/spanish');
    const q = res.body.data.find(q => q.id === 'es-noeng1');
    expect(q).toBeDefined();
    expect(q.questionTarget).toContain('Julio Iglesias');
    expect(q.questionEn).toBe('');
    expect(q.answersEn).toEqual([]);
  });

  it('returns Portuguese questions independently', async () => {
    const res = await request(app).get('/api/trivia/portuguese');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].id).toBe('pt-h1');
  });

  it('is case-insensitive (Spanish vs spanish)', async () => {
    const res = await request(app).get('/api/trivia/Spanish');
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('spanish');
    expect(res.body.count).toBe(4);
  });

  it('returns an empty array, not an error, for a language with no rows', async () => {
    const res = await request(app).get('/api/trivia/german');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('handles language === "english" as the requested language without aliasing conflicts', async () => {
    const res = await request(app).get('/api/trivia/english');
    expect(res.status).toBe(200);
    // Every concept that HAS an english translation (es-noeng1 excluded).
    expect(res.body.count).toBe(4);
    const q = res.body.data.find(q => q.id === 'es-h1');
    expect(q).toBeDefined();
    // Both joins hit the same 'english' translation row.
    expect(q.questionTarget).toBe(q.questionEn);
    expect(q.answersTarget).toEqual(q.answersEn);
    expect(q.questionTarget).toBe('In what year did Christopher Columbus arrive in the Americas?');
  });
});

describe('GET /api/guess-blank/:language', () => {
  it('returns the seeded Spanish Guess the Blank questions', async () => {
    const res = await request(app).get('/api/guess-blank/spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('spanish');
    // es-b1, es-b2, es-j-b1, es-b-noeng
    expect(res.body.count).toBe(4);
    expect(res.body.data).toHaveLength(4);
  });

  it('question objects have the expected camelCase shape', async () => {
    const res = await request(app).get('/api/guess-blank/spanish');
    const q = res.body.data.find(q => q.id === 'es-b1');
    expect(q).toBeDefined();
    expect(q.category).toBe('animal');
    expect(q.difficulty).toBe('medium');
    expect(Array.isArray(q.cluesTarget)).toBe(true);
    expect(q.cluesTarget[0]).toContain('selva');
    expect(Array.isArray(q.cluesEn)).toBe(true);
    expect(q.answerTarget).toBe('el mono');
    expect(q.answerEn).toBe('the monkey');
  });

  it('reconstructs target-language and English fields from separate translation rows without crossing them', async () => {
    const res = await request(app).get('/api/guess-blank/spanish');
    const q = res.body.data.find(q => q.id === 'es-j-b1');
    expect(q).toBeDefined();
    // Spanish and English translations deliberately describe different
    // animals — if the join crossed the two, these would swap.
    expect(q.answerTarget).toBe('el pulpo');
    expect(q.cluesTarget).toEqual(['Vivo en el mar y tengo ocho brazos.']);
    expect(q.answerEn).toBe('the octopus');
    expect(q.cluesEn).toEqual(['I live in the ocean and I have eight arms.']);
  });

  it('falls back to empty cluesEn/answerEn for a concept with no english translation', async () => {
    const res = await request(app).get('/api/guess-blank/spanish');
    const q = res.body.data.find(q => q.id === 'es-b-noeng');
    expect(q).toBeDefined();
    expect(q.answerTarget).toBe('el pingüino');
    expect(q.cluesEn).toEqual([]);
    expect(q.answerEn).toBe('');
  });

  it('returns Portuguese questions independently', async () => {
    const res = await request(app).get('/api/guess-blank/portuguese');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].id).toBe('pt-b1');
  });

  it('returns an empty array, not an error, for a language with no rows', async () => {
    const res = await request(app).get('/api/guess-blank/german');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('handles language === "english" as the requested language without aliasing conflicts', async () => {
    const res = await request(app).get('/api/guess-blank/english');
    expect(res.status).toBe(200);
    // Every concept that HAS an english translation (es-b-noeng excluded).
    expect(res.body.count).toBe(4);
    const q = res.body.data.find(q => q.id === 'es-b1');
    expect(q).toBeDefined();
    expect(q.answerTarget).toBe(q.answerEn);
    expect(q.cluesTarget).toEqual(q.cluesEn);
    expect(q.answerTarget).toBe('the monkey');
  });
});

// The contract that actually matters: an un-migrated (or pre-feature)
// database has none of the four trivia/guess-blank tables at all — that
// must be a normal, non-fatal state, not a crash. A separate app/db pair,
// built fresh and then stripped of all four tables, proves the route still
// answers cleanly rather than throwing a "no such table" SQLite error.
describe('missing trivia/guess-blank tables', () => {
  let missingApp, missingDb;

  beforeAll(() => {
    ({ app: missingApp, db: missingDb } = buildTestApp());
    missingDb.exec('DROP TABLE trivia_translations');
    missingDb.exec('DROP TABLE trivia_questions');
    missingDb.exec('DROP TABLE guess_blank_translations');
    missingDb.exec('DROP TABLE guess_blank_questions');
  });

  afterAll(() => {
    // Closes missingDb and nulls vocab-loader.ts's module-level singleton
    // (reloadDb()). Every test file's own beforeAll calls buildTestApp()
    // again before running, so there's nothing else to restore here.
    teardownTestApp(missingDb);
  });

  it('GET /api/trivia/:language still returns success with an empty array', async () => {
    const res = await request(missingApp).get('/api/trivia/spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('GET /api/guess-blank/:language still returns success with an empty array', async () => {
    const res = await request(missingApp).get('/api/guess-blank/spanish');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });
});
