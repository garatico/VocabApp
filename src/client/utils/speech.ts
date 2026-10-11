/**
 * speech.ts — say a word aloud with the device's own voices (Web Speech API).
 *
 * Nothing is downloaded or sent anywhere: the browser / OS / Android WebView supplies the voices, so
 * what is available varies by device. The one thing this insists on is the *right language*: a Spanish
 * word is never handed to the device's default English voice (which would read "casa" as "kay-sa").
 * If no voice for the language is installed it says so, once, rather than speaking it wrongly.
 *
 * Voice choice, best first:
 *   1. a voice whose locale is the learner's chosen regional flag for the language — Spanish with the
 *      Mexico flag prefers es-MX, Portuguese with Brazil pt-BR, Chinese with Taiwan zh-TW …
 *   2. any voice in the language (es-ES, es-US, es-MX …), preferring one that works offline
 *   3. none — nothing is spoken and the caller is told.
 */
import { languageInfo } from '../data/languages.ts';
import { Settings } from '../settings.ts';

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** `es_MX` and `es-mx` both mean es-MX; Android reports the underscore form. */
export const normaliseLocale = (tag: string): string => tag.replace(/_/g, '-').toLowerCase();

/** The BCP-47 locale the learner's settings ask for: the language's ISO code plus its regional flag. */
export function localeFor(langName: string): string {
  const info = languageInfo(langName);
  return `${info.iso}-${Settings.getLangFlag(langName).toUpperCase()}`;
}

interface VoiceLike { lang: string; localService?: boolean; default?: boolean; name?: string }

/** Pure, so it can be tested without a browser: the best voice for `locale` among `voices`, or null. */
export function pickVoice<T extends VoiceLike>(locale: string, voices: readonly T[]): T | null {
  const want = normaliseLocale(locale);
  const iso = want.split('-')[0];
  const inLanguage = voices.filter(v => normaliseLocale(v.lang).split('-')[0] === iso);
  if (!inLanguage.length) return null;

  const rank = (v: T): number => {
    const exact = normaliseLocale(v.lang) === want ? 0 : 4;
    const offline = v.localService ? 0 : 2;
    const preferred = v.default ? 0 : 1;
    return exact + offline + preferred;
  };
  return [...inLanguage].sort((a, b) => rank(a) - rank(b))[0];
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Voices load asynchronously in Chrome and the Android WebView; wait for them, but not forever. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  voicesPromise ??= new Promise(resolve => {
    const done = (): void => { synth.removeEventListener('voiceschanged', done); resolve(synth.getVoices()); };
    synth.addEventListener('voiceschanged', done);
    window.setTimeout(done, 1500);
  });
  return voicesPromise;
}

const warned = new Set<string>();

export interface SpeakResult { spoken: boolean; reason?: 'unsupported' | 'no-voice' | 'empty' }

/** Says `text` in `langName`. Resolves once it has started (or been refused); never throws. */
export async function speak(langName: string, text: string): Promise<SpeakResult> {
  if (!speechSupported()) return { spoken: false, reason: 'unsupported' };
  const spoken = text.trim();
  if (!spoken) return { spoken: false, reason: 'empty' };

  const voices = await loadVoices();
  const voice = pickVoice(localeFor(langName), voices);
  if (!voice) return { spoken: false, reason: 'no-voice' };

  const synth = window.speechSynthesis;
  synth.cancel();                                   // a second tap restarts rather than queueing
  const u = new SpeechSynthesisUtterance(spoken);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;                                     // a touch slower than conversation: this is for learning
  synth.speak(u);
  return { spoken: true };
}

/** For callers that want the one-time "no voice installed" notice: true the first time per language. */
export function shouldWarnNoVoice(langName: string): boolean {
  if (warned.has(langName)) return false;
  warned.add(langName);
  return true;
}
