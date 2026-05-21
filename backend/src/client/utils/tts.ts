/** BCP-47 language tags keyed by the short lang codes used across the app. */
const LANG_TAGS: Record<string, string> = {
  es: 'es',
  pt: 'pt',
  it: 'it',
  fr: 'fr',
};

// Preferred locale variants in priority order (more natural-sounding first).
const PREFERRED_LOCALES: Record<string, string[]> = {
  es: ['es-ES', 'es-MX', 'es-US', 'es-419', 'es'],
  pt: ['pt-PT', 'pt-BR', 'pt'],
  it: ['it-IT', 'it'],
  fr: ['fr-FR', 'fr-CA', 'fr'],
};

// Cache voices once they are available.
let voiceCache: SpeechSynthesisVoice[] | null = null;

function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) { voiceCache = voices; resolve(voices); return; }
    // Voices load asynchronously on first call in some browsers.
    speechSynthesis.addEventListener('voiceschanged', function handler() {
      speechSynthesis.removeEventListener('voiceschanged', handler);
      voiceCache = speechSynthesis.getVoices();
      resolve(voiceCache);
    });
  });
}

/** Pick the best available voice for the given short lang code (e.g. 'es'). */
function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const preferred = PREFERRED_LOCALES[lang] ?? [lang];
  const tag       = LANG_TAGS[lang] ?? lang;

  // 1. Exact match against preferred locale list (in priority order)
  for (const locale of preferred) {
    const match = voices.find(v => v.lang === locale);
    if (match) return match;
  }

  // 2. Any voice whose lang starts with the base tag
  const loose = voices.find(v => v.lang.toLowerCase().startsWith(tag.toLowerCase()));
  if (loose) return loose;

  return null;
}

/**
 * Speak `text` aloud using the best available voice for `lang`.
 * Cancels any in-progress speech first (avoids Chrome queue/idle bugs).
 */
export async function speak(text: string, lang = 'es'): Promise<void> {
  if (!('speechSynthesis' in window)) return;

  // Cancel before speaking — fixes the Chrome 15-second stall bug.
  speechSynthesis.cancel();

  const voices = voiceCache ?? await getVoices();
  const u      = new SpeechSynthesisUtterance(text);
  const voice  = pickVoice(voices, lang);

  if (voice) {
    u.voice = voice;
    u.lang  = voice.lang;
  } else {
    // No matching voice installed; set lang as a hint and hope for the best.
    u.lang = PREFERRED_LOCALES[lang]?.[0] ?? lang;
  }

  // Small delay after cancel() to avoid a Chrome timing bug where speech is dropped.
  setTimeout(() => speechSynthesis.speak(u), 50);
}
