/**
 * speak-button.ts — the 🔊 button that says a word aloud (utils/speech.ts).
 *
 * Returns null when pronunciation is switched off (the default) or the device cannot speak, rather than a
 * disabled button, so a learner who never turned it on sees nothing different anywhere.
 */
import { Settings } from '../settings.ts';
import { languageInfo } from '../data/languages.ts';
import { speak, speechSupported, shouldWarnNoVoice } from '../utils/speech.ts';
import { showToast } from './toast.ts';

export function pronunciationAvailable(): boolean {
  return Settings.getPronunciation() && speechSupported();
}

/** Say `word` in `lang`, with the one-time notice when the device has no voice for it. */
export async function sayWord(lang: string, word: string): Promise<void> {
  const r = await speak(lang, word);
  if (!r.spoken && r.reason === 'no-voice' && shouldWarnNoVoice(lang)) {
    const label = languageInfo(lang).label;
    showToast(`No ${label} voice is installed on this device, so the word can’t be spoken. Add one in your device’s text-to-speech settings.`, 'error');
  }
}

export function buildSpeakButton(lang: string, word: string, className = 'speak-btn'): HTMLButtonElement | null {
  if (!pronunciationAvailable()) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = '🔊';
  btn.title = 'Say it aloud';
  btn.setAttribute('aria-label', `Say “${word}” aloud`);
  btn.addEventListener('click', e => {
    e.stopPropagation();   // rows and word cells are clickable: this must not also open them
    void sayWord(lang, word);
  });
  return btn;
}
