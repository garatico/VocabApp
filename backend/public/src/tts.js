// BCP-47 language tags keyed by the short codes used in langMap
const LANG_TAGS = {
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
  fr: 'fr-FR',
};

export function speak(text, lang = 'es') {
  if (!('speechSynthesis' in window)) return;
  const u  = new SpeechSynthesisUtterance(text);
  u.lang   = LANG_TAGS[lang] ?? 'es-ES';
  speechSynthesis.speak(u);
}
