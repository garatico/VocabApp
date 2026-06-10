/**
 * tests/svg-loader.test.js
 *
 * Unit tests for getSvgUrl in svg-loader.js.
 *
 * getSvgUrl does two things:
 *   1. Looks up the word in the CONCEPTS map to get a concept key.
 *   2. Checks whether the corresponding SVG file exists on disk.
 *
 * We mock fs.existsSync so tests don't depend on data/svgs/ being present.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { getSvgUrl } from '../src/server/lib/svg-loader.js';

let existsSyncSpy;

beforeEach(() => {
  existsSyncSpy = vi.spyOn(fs, 'existsSync');
});

afterEach(() => {
  existsSyncSpy.mockRestore();
});

// ── Known words with file present ────────────────────────────────────────────

describe('known word, SVG file present', () => {
  it('returns the correct URL for a Spanish word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('spanish', 'perro')).toBe('/svgs/dog.svg');
  });

  it('returns the correct URL for a Portuguese word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('portuguese', 'gato')).toBe('/svgs/cat.svg');
  });

  it('returns the correct URL for an Italian word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('italian', 'acqua')).toBe('/svgs/water.svg');
  });

  it('returns the correct URL for a French word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('french', 'chien')).toBe('/svgs/dog.svg');
  });

  it('handles multi-word synonyms for the same concept (cachorro = dog in spanish)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('spanish', 'cachorro')).toBe('/svgs/dog.svg');
  });

  it('casa maps to house', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('spanish', 'casa')).toBe('/svgs/house.svg');
  });
});

// ── Known concept, file absent ───────────────────────────────────────────────

describe('known word, SVG file absent', () => {
  it('returns null when the file does not exist on disk', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getSvgUrl('spanish', 'perro')).toBeNull();
  });
});

// ── Unknown words ────────────────────────────────────────────────────────────

describe('unknown word', () => {
  it('returns null for a word not in the CONCEPTS map', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true); // file would exist
    expect(getSvgUrl('spanish', 'computadora')).toBeNull();
  });

  it('returns null for a word in the right language but wrong entry (typo)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('spanish', 'perros')).toBeNull(); // plural not in map
  });

  it('returns null for a word from an unsupported language', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('klingon', 'perro')).toBeNull();
  });
});

// ── Null / empty guard inputs ────────────────────────────────────────────────

describe('null and empty inputs', () => {
  it('returns null when language is null', () => {
    expect(getSvgUrl(null, 'perro')).toBeNull();
  });

  it('returns null when word is null', () => {
    expect(getSvgUrl('spanish', null)).toBeNull();
  });

  it('returns null when both arguments are null', () => {
    expect(getSvgUrl(null, null)).toBeNull();
  });

  it('returns null when word is empty string', () => {
    expect(getSvgUrl('spanish', '')).toBeNull();
  });

  it('returns null when language is empty string', () => {
    expect(getSvgUrl('', 'perro')).toBeNull();
  });
});

// ── Case handling ────────────────────────────────────────────────────────────

describe('language case normalisation', () => {
  it('accepts uppercase language name', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('Spanish', 'perro')).toBe('/svgs/dog.svg');
  });

  it('accepts mixed-case language name', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getSvgUrl('FRENCH', 'chien')).toBe('/svgs/dog.svg');
  });
});
