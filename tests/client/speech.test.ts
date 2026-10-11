// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pickVoice, normaliseLocale, localeFor, speak } from '../../src/client/utils/speech.ts';

const v = (lang: string, extra: Record<string, unknown> = {}) => ({ lang, name: lang, localService: true, default: false, ...extra });

describe('normaliseLocale', () => {
  it('treats es_MX, es-mx and es-MX as the same locale', () => {
    expect(normaliseLocale('es_MX')).toBe('es-mx');
    expect(normaliseLocale('es-MX')).toBe('es-mx');
  });
});

describe('pickVoice: always the right language', () => {
  const voices = [v('en-US', { default: true }), v('es-ES'), v('es-MX'), v('fr-FR'), v('zh-CN'), v('zh-TW'), v('pt-BR'), v('ja-JP')];

  it('prefers the exact regional voice', () => {
    expect(pickVoice('es-MX', voices)?.lang).toBe('es-MX');
    expect(pickVoice('zh-TW', voices)?.lang).toBe('zh-TW');
    expect(pickVoice('pt-BR', voices)?.lang).toBe('pt-BR');
  });

  it('falls back to another voice in the same language, never to a different language', () => {
    expect(pickVoice('es-AR', voices)?.lang.startsWith('es')).toBe(true);
    expect(pickVoice('fr-CA', voices)?.lang).toBe('fr-FR');
  });

  it('returns null rather than the default English voice when the language has none', () => {
    expect(pickVoice('de-DE', voices)).toBeNull();
    expect(pickVoice('nl-NL', [v('en-US', { default: true })])).toBeNull();
  });

  it('accepts the underscore form some Android voices report', () => {
    expect(pickVoice('es-MX', [v('es_MX'), v('es_ES')])?.lang).toBe('es_MX');
  });

  it('prefers a voice that works offline among equals', () => {
    const online = v('es-ES', { localService: false, name: 'online' });
    const offline = v('es-ES', { localService: true, name: 'offline' });
    expect(pickVoice('es-ES', [online, offline])?.name).toBe('offline');
  });
});

describe('localeFor', () => {
  beforeEach(() => localStorage.clear());

  it('is the language plus its default flag, and follows the learner\'s regional flag', () => {
    expect(localeFor('spanish')).toBe('es-ES');
    expect(localeFor('japanese')).toBe('ja-JP');
    localStorage.setItem('s_lang_flag_spanish', 'mx');
    expect(localeFor('spanish')).toBe('es-MX');
    localStorage.setItem('s_lang_flag_portuguese', 'br');
    expect(localeFor('portuguese')).toBe('pt-BR');
  });
});

describe('speak', () => {
  beforeEach(() => localStorage.clear());

  it('does nothing without speech synthesis', async () => {
    const r = await speak('spanish', 'casa');
    expect(r).toEqual({ spoken: false, reason: 'unsupported' });
  });

  it('speaks with the matching voice, and not at all when there is none', async () => {
    const spoken: { text: string; voice: unknown; lang: string }[] = [];
    class Utter { text: string; voice: unknown = null; lang = ''; rate = 1; constructor(t: string) { this.text = t; } }
    const voices = [{ lang: 'en-US', default: true, localService: true }, { lang: 'es-ES', default: false, localService: true }];
    vi.stubGlobal('SpeechSynthesisUtterance', Utter);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        cancel: () => {},
        speak: (u: Utter) => spoken.push({ text: u.text, voice: u.voice, lang: u.lang }),
        addEventListener: () => {}, removeEventListener: () => {},
      },
    });

    expect(await speak('spanish', 'casa')).toEqual({ spoken: true });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('es-ES');
    expect(spoken[0].voice).toBe(voices[1]);

    expect(await speak('german', 'Haus')).toEqual({ spoken: false, reason: 'no-voice' });
    expect(spoken).toHaveLength(1);                    // nothing was said in the wrong language

    expect(await speak('spanish', '   ')).toEqual({ spoken: false, reason: 'empty' });
    vi.unstubAllGlobals();
  });
});
