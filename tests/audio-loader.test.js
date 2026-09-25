/**
 * tests/audio-loader.test.js
 *
 * Unit tests for getAudioUrl in audio-loader.js.
 *
 * Unlike svg-loader (a concept map plus an existence check), this is purely
 * a slugify-then-existence-check — every word is its own file, one per
 * language, so there's no lookup table to test, just the URL shape and the
 * disk check. We mock fs.readdirSync (the loader reads one listing per language) so tests don't depend on data/audio/
 * actually being populated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { getAudioUrl, clearAudioIndex } from '../src/server/lib/audio-loader.js';

let readdirSpy;

/** The directory listing the loader will see: `present` files exist, nothing else does. */
function listing(...names) {
  vi.mocked(fs.readdirSync).mockReturnValue(names);
}

beforeEach(() => {
  clearAudioIndex();
  readdirSpy = vi.spyOn(fs, 'readdirSync');
});

afterEach(() => {
  readdirSpy.mockRestore();
});

describe('file present', () => {
  it('returns the URL for a simple word', () => {
    listing('perro.wav');
    expect(getAudioUrl('spanish', 'perro')).toBe('/audio/spanish/perro.wav');
  });

  it('keeps accents in the slug rather than stripping them', () => {
    listing('días.wav');
    expect(getAudioUrl('spanish', 'días')).toBe('/audio/spanish/días.wav');
  });

  it('lowercases the word and the language', () => {
    listing('perro.wav');
    expect(getAudioUrl('Spanish', 'Perro')).toBe('/audio/spanish/perro.wav');
  });

  it('replaces spaces with underscores for a multi-word entry', () => {
    listing('buenos_días.wav');
    expect(getAudioUrl('spanish', 'buenos días')).toBe('/audio/spanish/buenos_días.wav');
  });

  it('drops punctuation the way the pipeline\'s slugify does', () => {
    listing('qué.wav');
    expect(getAudioUrl('spanish', '¿qué?')).toBe('/audio/spanish/qué.wav');
  });
});

describe('Windows reserved device names', () => {
  // CON, PRN, AUX, NUL, COM1-9, LPT1-9 resolve to a device, not a file, for
  // plain Win32 file APIs — "con" is a common Spanish preposition, and
  // `git add` on the generated file failed with a bare "No such file or
  // directory" until this was handled. Must match audio.py's own fix.
  it('appends a trailing underscore to a bare reserved name', () => {
    listing('con_.wav');
    expect(getAudioUrl('spanish', 'con')).toBe('/audio/spanish/con_.wav');
  });

  it('is case-insensitive', () => {
    listing('con_.wav');
    expect(getAudioUrl('spanish', 'CON')).toBe('/audio/spanish/con_.wav');
  });

  it('does not touch a word that merely contains a reserved name as a substring', () => {
    listing('contra.wav');
    expect(getAudioUrl('spanish', 'contra')).toBe('/audio/spanish/contra.wav');
  });
});

describe('file absent', () => {
  it('returns null when no audio file exists yet for this word', () => {
    listing('otra.wav');
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

describe('directory listing cache', () => {
  it('reads a language directory once, not once per word', () => {
    listing('perro.wav', 'gato.wav');
    getAudioUrl('spanish', 'perro');
    getAudioUrl('spanish', 'gato');
    getAudioUrl('spanish', 'perro');
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
  });

  it('keeps languages separate', () => {
    listing('perro.wav');
    expect(getAudioUrl('spanish', 'perro')).toBe('/audio/spanish/perro.wav');
    listing('chien.wav');
    expect(getAudioUrl('french', 'perro')).toBeNull();
    expect(fs.readdirSync).toHaveBeenCalledTimes(2);
  });

  it('does not rescan on every miss — only after the cooldown', () => {
    vi.useFakeTimers();
    try {
      listing('perro.wav');
      getAudioUrl('spanish', 'perro');
      for (let i = 0; i < 50; i++) getAudioUrl('spanish', `nada${i}`);
      expect(fs.readdirSync).toHaveBeenCalledTimes(1);

      // New audio appears on disk; a miss after the cooldown notices it.
      listing('perro.wav', 'nuevo.wav');
      vi.advanceTimersByTime(6000);
      expect(getAudioUrl('spanish', 'nuevo')).toBe('/audio/spanish/nuevo.wav');
      expect(fs.readdirSync).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a missing directory means no audio, not an error', () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(getAudioUrl('spanish', 'perro')).toBeNull();
  });
});
