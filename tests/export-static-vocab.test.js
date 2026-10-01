/**
 * tests/export-static-vocab.test.js
 *
 * scripts/export-static-vocab.ts builds the ONLY vocabulary data a packaged
 * Tauri/Capacitor build ever sees — there is no Express server in that build
 * (see vocab-source.ts's isPackagedApp fallback), so this file is entirely
 * unexercised by public.test.js, which only ever calls the live route. A
 * bug here would ship into every desktop/mobile build while every existing
 * test stayed green.
 *
 * buildLanguagePayload() is the pure, testable half of that script (see its
 * own doc comment) — main()'s file-writing/process.exit/manifest logic is
 * left untested here since it's a thin, low-risk wrapper around it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, teardownTestApp } from './helpers/app.js';
import { expandWord } from '../src/shared/vocab/compact-word.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLanguagePayload, buildJsonl, OWNED_FILE, stampServiceWorker } from '../scripts/export-static-vocab.js';

let db;

beforeAll(() => {
  ({ db } = buildTestApp());
});

afterAll(() => {
  teardownTestApp(db);
});

describe('buildLanguagePayload (static export)', () => {
  it('matches the shape /api/vocab/:language sends (same envelope fields)', () => {
    const payload = buildLanguagePayload('spanish');
    expect(payload).toHaveProperty('language', 'spanish');
    expect(payload).toHaveProperty('count', payload.data.length);
    expect(payload.metadata).toHaveProperty('source', 'static-export');
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeGreaterThan(0);
  });

  it('carries the exact same per-word data loadVocabFile produces — the whole point of reusing it', () => {
    // Not a copy or a re-derivation: byte-for-byte the same words the API
    // would serve for this language, straight from the one conjugation
    // engine (see this script's own header comment on why a second,
    // Python-side implementation would be the wrong fix).
    const payload = buildLanguagePayload('spanish');
    const hablar  = payload.data.find(w => w.word === 'hablar');
    expect(hablar.linguistic).toHaveProperty('conjugations');
    expect(hablar.linguistic.conjugations.present).toEqual(
      expect.arrayContaining(['hablo', 'hablas']),
    );
  });

  it('omits null-valued fields the same way the live API does (payload-size fix applies to both)', () => {
    const payload = buildLanguagePayload('spanish');
    const bonito  = payload.data.find(w => w.word === 'bonito');
    expect(bonito).not.toHaveProperty('svg_url');
    expect(bonito.linguistic).not.toHaveProperty('conjugations');
    expect(bonito.linguistic).not.toHaveProperty('gender');
  });

  it('produces valid JSON with no circular references or unserializable values', () => {
    const payload = buildLanguagePayload('spanish');
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('throws a clear error for a language with no rows, same as the API 404s', () => {
    expect(() => buildLanguagePayload('klingon')).toThrow(/Language not found/);
  });
});

describe('buildJsonl (static web build)', () => {
  it('is one parseable word per line that expands back to exactly as the whole-language payload', () => {
    const whole = buildLanguagePayload('spanish');
    const { jsonl, count } = buildJsonl('spanish');
    const lines = jsonl.split(String.fromCharCode(10));
    expect(lines.pop()).toBe('');                       // trailing newline, nothing after it
    expect(count).toBe(whole.count);
    expect(lines.map(l => expandWord(JSON.parse(l)))).toEqual(whole.data);
  });
});

describe('static export file ownership and service-worker stamp', () => {
  it('only treats the export\'s own file names as deletable', () => {
    for (const name of ['spanish.jsonl', 'index.json', 'vocab-spanish.json', 'asset-manifest.json']) {
      expect(OWNED_FILE.test(name)).toBe(true);
    }
    // Things that live in a repo's data/ and must never be removed by a mistyped --static path.
    for (const name of ['vocabulary.db', 'vocabulary.pre-kaikki_2026-09-30.db', 'images', 'emoji', 'notes.txt', '.env']) {
      expect(OWNED_FILE.test(name)).toBe(false);
    }
  });

  it('appends a data hash to the service worker version, and replaces it on a re-run instead of stacking', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-sw-'));
    try {
      const sw = path.join(dir, 'sw.js');
      fs.writeFileSync(sw, "const CACHE_VERSION = 'abc123def4';\n");
      stampServiceWorker(dir, '1111111111');
      expect(fs.readFileSync(sw, 'utf8')).toContain("'abc123def4-d1111111111'");
      stampServiceWorker(dir, '2222222222');
      expect(fs.readFileSync(sw, 'utf8')).toContain("'abc123def4-d2222222222'");
      expect(fs.readFileSync(sw, 'utf8')).not.toContain('d1111111111');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing when there is no service worker', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-sw-'));
    try {
      expect(() => stampServiceWorker(dir, '1111111111')).not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
