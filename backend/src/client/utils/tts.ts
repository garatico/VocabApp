/** BCP-47 language tags keyed by the short codes used in langMap. */
const LANG_TAGS: Record<string, string> = {
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
  fr: 'fr-FR',
};

export function speak(text: string, lang = 'es'): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = LANG_TAGS[lang] ?? 'es-ES';
  speechSynthesis.speak(u);
}
