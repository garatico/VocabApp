/**
 * tests/audio-loader.test.js
 *
 * Unit tests for getAudioUrl in audio-loader.js.
 *
 * Unlike svg-loader (a concept map plus an existence check), this is purely
 * a slugify-then-existence-check — every word is its own file, one per
 * language, so there's no lookup table to test, just the URL shape and the
 * disk check. We mock fs.existsSync so tests don't depend on data/audio/
 * actually being populated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { getAudioUrl } from '../src/server/lib/audio-loader.js';

let existsSyncSpy;

beforeEach(() => {
  existsSyncSpy = vi.spyOn(fs, 'existsSync');
});

afterEach(() => {
  existsSyncSpy.mockRestore();
});

describe('file present', () => {
  it('returns the URL for a simple word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'perro')).toBe('/audio/spanish/perro.wav');
  });

  it('keeps accents in the slug rather than stripping them', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'días')).toBe('/audio/spanish/días.wav');
  });

  it('lowercases the word and the language', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('Spanish', 'Perro')).toBe('/audio/spanish/perro.wav');
  });

  it('replaces spaces with underscores for a multi-word entry', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'buenos días')).toBe('/audio/spanish/buenos_días.wav');
  });

  it('drops punctuation the way the pipeline\'s slugify does', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', '¿qué?')).toBe('/audio/spanish/qué.wav');
  });
});

describe('Windows reserved device names', () => {
  // CON, PRN, AUX, NUL, COM1-9, LPT1-9 resolve to a device, not a file, for
  // plain Win32 file APIs — "con" is a common Spanish preposition, and
  // `git add` on the generated file failed with a bare "No such file or
  // directory" until this was handled. Must match audio.py's own fix.
  it('appends a trailing underscore to a bare reserved name', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'con')).toBe('/audio/spanish/con_.wav');
  });

  it('is case-insensitive', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'CON')).toBe('/audio/spanish/con_.wav');
  });

  it('does not touch a word that merely contains a reserved name as a substring', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(getAudioUrl('spanish', 'contra')).toBe('/audio/spanish/contra.wav');
  });
});

describe('file absent', () => {
  it('returns null when no audio file exists yet for this word', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getAudioUrl('spanish', 'perro')).toBeNull();
  });
});

describe('null and empty inputs', () => {
  it('returns null when language is null', () => {
    expect(getAudioUrl(null, 'perro')).toBeNull();
  });

  it('returns null when word is null', () => {
    expect(getAudioUrl('spanish', null)).toBeNull();
  });

  it('returns null when word is an empty string', () => {
    expect(getAudioUrl('spanish', '')).toBeNull();
  });

  it('returns null when language is an empty string', () => {
    expect(getAudioUrl('', 'perro')).toBeNull();
  });
});
