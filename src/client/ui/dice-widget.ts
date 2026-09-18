/**
 * dice-widget.ts — the 🎲 button in #controlsCorner: picks a random word
 * from the current language's vocabulary and shows it in the same word-info
 * popover a word click elsewhere in the app opens (fully revealed — this
 * isn't a quiz, so there's nothing to hide).
 */

import { loadWords } from '../data/data-loader.ts';
import { shuffledIndices } from '../utils/shuffle.ts';
import { openWordInfoPopover } from '../utils/word-info-popover.ts';

function currentLang(): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
}

export function initDiceButton(): void {
  const btn = document.getElementById('diceBtn') as HTMLButtonElement | null;
  if (!btn) return;

  btn.addEventListener('click', () => {
    const lang = currentLang();
    void loadWords(lang).then(words => {
      if (words.length === 0) return;
      const word = words[shuffledIndices(words.length)[0]];
      openWordInfoPopover({ anchorEl: btn, word, lang, revealed: true });
    });
  });
}
