import { Settings, type UILanguage } from '../settings.ts';
import { logger } from '../utils/logger.ts';

/**
 * i18n/index.ts — translates the app's own interface chrome.
 *
 * English lives only in index.html — there is no `en.ts` dictionary. A
 * lookup miss (English selected, or a key with no Spanish entry) falls back
 * to the DOM's own original text, captured into a `data-i18n-orig*` attribute
 * the first time each element is translated, so re-running this after
 * switching back to English restores the exact original markup rather than
 * needing a page reload.
 *
 * Dictionaries are separate chunks, fetched only when their language is
 * selected — an English user never downloads the Spanish one (~54 KB). Startup
 * and a language switch (app.ts) call `ensureDictionary()` and translate when it
 * resolves. It is not started at module load: settings.ts sits in an import
 * cycle with this file, so `Settings` is not yet defined then. `t()` stays
 * synchronous and falls back to English until the chunk lands.
 */
const DICTS: Partial<Record<UILanguage, Record<string, string>>> = {};
const LOADERS: Partial<Record<UILanguage, () => Promise<Record<string, string>>>> = {
  spanish: () => import('./es.ts').then(m => m.es),
};
const loading = new Map<UILanguage, Promise<boolean>>();

/** Pause before the one automatic retry of a failed dictionary chunk. */
const DICTIONARY_RETRY_MS = 1500;

/**
 * Resolves true once the current UI language's dictionary is loaded (immediately
 * for English), false if it could not be — after one automatic retry. A failure
 * is not remembered, so the next call (another language switch) tries again;
 * the caller decides how to tell the user. The usual cause is a chunk whose
 * hashed name is gone: a tab left open across a deploy.
 */
export function ensureDictionary(): Promise<boolean> {
  const lang = Settings.getUILanguage();
  const load = LOADERS[lang];
  if (!load || DICTS[lang]) return Promise.resolve(true);
  let pending = loading.get(lang);
  if (!pending) {
    const attempt = (): Promise<Record<string, string>> =>
      load().catch(() => new Promise<Record<string, string>>((resolve, reject) => {
        setTimeout(() => load().then(resolve, reject), DICTIONARY_RETRY_MS);
      }));
    pending = attempt()
      .then(dict => { DICTS[lang] = dict; return true; })
      .catch(err => { logger.error(`could not load the ${lang} interface text:`, err); return false; })
      .finally(() => { loading.delete(lang); });
    loading.set(lang, pending);
  }
  return pending;
}

function lookup(key: string): string | undefined {
  const lang = Settings.getUILanguage();
  if (lang === 'english') return undefined;
  return DICTS[lang]?.[key];
}

/**
 * Translate a string built in JS rather than sitting in index.html as
 * static markup — a dynamically-generated label, tooltip or option text
 * that has no DOM element to hang a data-i18n attribute on ahead of time.
 * Falls back to `fallback` (the English original, passed at the call site)
 * on any miss, exactly like applyTranslations()'s attribute-based path.
 */
export function t(key: string, fallback: string): string {
  return lookup(key) ?? fallback;
}

function withOriginal(el: HTMLElement, attr: string, current: () => string): string {
  const cacheAttr = 'i18nOrig' + attr[0].toUpperCase() + attr.slice(1);
  const cached = el.dataset[cacheAttr];
  if (cached !== undefined) return cached;
  const orig = current();
  el.dataset[cacheAttr] = orig;
  return orig;
}

/**
 * Walk `root` and apply the current UI language to every tagged element.
 * Call once on startup and again whenever Settings.getUILanguage() changes
 * (see settings.ts's setOnUILanguageChange hook) — safe to call repeatedly
 * and on a subtree, since My Lists/Profiles panels rebuild their own DOM
 * after this module's initial pass.
 */
export function applyTranslations(root: ParentNode = document): void {
  // Screen readers pick their pronunciation voice from <html lang>; without
  // this a Spanish interface was read out with English phonetics.
  if (root === document) {
    document.documentElement.lang = Settings.getUILanguage() === 'spanish' ? 'es' : 'en';
  }

  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n ?? '';
    const orig = withOriginal(el, 'text', () => el.textContent ?? '');
    el.textContent = lookup(key) ?? orig;
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml ?? '';
    const orig = withOriginal(el, 'html', () => el.innerHTML);
    // Safe: both the fallback and every dictionary value are hardcoded
    // strings this app ships, never data from the page or a user.
    el.innerHTML = lookup(key) ?? orig;
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle ?? '';
    const orig = withOriginal(el, 'title', () => el.getAttribute('title') ?? '');
    el.setAttribute('title', lookup(key) ?? orig);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder ?? '';
    const orig = withOriginal(el, 'placeholder', () => (el as HTMLInputElement).placeholder ?? '');
    (el as HTMLInputElement).placeholder = lookup(key) ?? orig;
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel ?? '';
    const orig = withOriginal(el, 'ariaLabel', () => el.getAttribute('aria-label') ?? '');
    el.setAttribute('aria-label', lookup(key) ?? orig);
  });
}
