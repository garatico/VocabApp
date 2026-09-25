import { getPictureOverrides, getPictureOverride, setPictureOverride, removePictureOverride, isImageOverride } from '../../data/user-content.ts';
import { LANGUAGES, type LanguageInfo } from '../../data/languages.ts';
import { getStockImages, getFallbackImageUrl, getFallbackSvgUrl, getFallbackEmoji } from '../../data/visual-map.ts';
import { loadWords } from '../../data/data-loader.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import type { Word } from '../../types.ts';
import { el, field, textInput } from './shared.ts';
import { buildWordSearchUI } from './word-search.ts';

/**
 * my-content/pictures.ts — choose your own picture for a word (photo, SVG or emoji).
 */

// ── Pictures ─────────────────────────────────────────────────────────────────
//
// Rather than typing a word blind and pasting a URL, this searches the
// language's real vocabulary (plus words added in the section above) for
// entries that already carry a visual — a local photo, an SVG icon or an
// emoji, via the same lookup picture-mode.ts itself uses — and lets you pick
// whichever one of those should be the *canonical* image, overriding
// picture-mode's own photo > icon > emoji priority for just that word. A
// custom URL, an uploaded file, or a pick from the bundled stock-photo
// library are still there for words with no built-in visual at all, or when
// none of the built-in options is the right picture.

interface WordVisuals { photo: string | null; svg: string | null; emoji: string | null }

function visualsFor(lang: string, w: Word): WordVisuals {
  return {
    photo: getFallbackImageUrl(lang, w.word),
    svg:   w.svg_url || getFallbackSvgUrl(lang, w.word) || null,
    emoji: w.emoji || getFallbackEmoji(lang, w.word) || null,
  };
}

function hasAnyVisual(v: WordVisuals): boolean {
  return Boolean(v.photo || v.svg || v.emoji);
}

/**
 * The bundled-photo gallery offered as one of the "custom" ways to set a
 * word's picture, alongside a pasted URL and an uploaded file — for words
 * with no built-in visual of their own, or when none of the built-in
 * options is the right one. Collapsed by default since the full gallery is
 * dozens of images long. `onPick` fires once and the caller is expected to
 * rebuild its own view — this component holds no state of its own.
 */
function buildStockImagePicker(selectedUrl: string | null, onPick: (url: string) => void): HTMLElement {
  const wrap = el('div', 'mc-stock-picker');

  const toggle = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Choose from stock images…');
  toggle.type = 'button';

  const gallery = el('div', 'mc-stock-gallery');
  gallery.hidden = true;

  for (const { url, label } of getStockImages()) {
    const item = el('button', 'mc-stock-item');
    item.type = 'button';
    if (url === selectedUrl) item.classList.add('mc-stock-item--selected');
    const thumb = el('img', 'mc-stock-thumb') as HTMLImageElement;
    thumb.src = url;
    thumb.alt = label;
    thumb.loading = 'lazy';
    item.appendChild(thumb);
    item.appendChild(el('span', 'mc-stock-label', label));
    item.addEventListener('click', () => onPick(url));
    gallery.appendChild(item);
  }

  toggle.addEventListener('click', () => {
    gallery.hidden = !gallery.hidden;
    toggle.textContent = gallery.hidden ? 'Choose from stock images…' : 'Hide stock images';
  });

  wrap.append(toggle, gallery);
  return wrap;
}

export function buildPicturesSection(currentLang: string): HTMLElement {
  const wrap = el('div', 'mc-subsections');

  // The overrides list rebuilds itself in place on every change (a pick, a
  // custom picture, a Remove) rather than going through the whole tab's
  // refresh — that would also tear down and rebuild the search panel above
  // it, closing the search and losing the query every time a word's picture
  // is set, which is exactly the moment you're most likely to want to set
  // the next one too.
  const list = el('div', 'mc-list');
  function renderOverridesList(): void {
    list.innerHTML = '';
    const allOverrides = LANGUAGES.flatMap(info =>
      Object.entries(getPictureOverrides(info.name)).map(([word, value]) => ({ info, word, value })));
    if (allOverrides.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No picture overrides yet.'));
    } else {
      allOverrides.forEach(({ info, word, value }) => list.appendChild(
        buildPictureRow(info, word, value, renderOverridesList, () => panel.openWord(info.name, word)),
      ));
    }
  }

  const panel = buildPictureSearchPanel(currentLang, renderOverridesList);
  renderOverridesList();

  wrap.appendChild(panel.wrap);
  wrap.appendChild(list);
  return wrap;
}

interface PictureEditorPanel {
  wrap: HTMLElement;
  /** Jumps straight to editing `word`'s picture — what an overrides-list
   *  row calls instead of making the learner search for the word again. */
  openWord: (lang: string, word: string) => Promise<void>;
}

/**
 * The search UI plus the detail panel for whichever word is currently
 * selected. Kept as one closure (rather than threading state through
 * renderMyContent's own refresh) because switching languages needs an async
 * vocabulary load that the rest of the tab's synchronous
 * render-on-every-change pattern has no way to await.
 */
function buildPictureSearchPanel(defaultLang: string, refresh: () => void): PictureEditorPanel {
  const wrap = el('div', 'mc-word-panel-outer');

  const detail = el('div', 'mc-word-detail');
  detail.hidden = true;

  function selectWord(lang: string, w: Word): void {
    detail.innerHTML = '';
    detail.hidden = false;

    function afterChange(): void {
      selectWord(lang, w);
      ui.refreshResults();
      refresh();
    }

    const header = el('div', 'mc-word-detail-header');
    header.appendChild(buildLangBadge([lang]));
    header.appendChild(document.createTextNode(` ${w.word} — ${w.translation}`));
    detail.appendChild(header);

    const current = getPictureOverride(lang, w.word);
    const v = visualsFor(lang, w);

    const options = el('div', 'mc-pic-options');
    function addOption(label: string, value: string | null, kind: 'img' | 'emoji'): void {
      if (!value) return;
      const btn = el('button', 'mc-pic-option');
      btn.type = 'button';
      if (kind === 'img') {
        const img = el('img', 'mc-pic-option-img') as HTMLImageElement;
        img.src = value;
        img.alt = label;
        btn.appendChild(img);
      } else {
        btn.appendChild(el('span', 'mc-pic-option-emoji', value));
      }
      btn.appendChild(el('span', 'mc-pic-option-label', label));
      if (current === value) btn.classList.add('mc-pic-option--selected');
      btn.addEventListener('click', () => { setPictureOverride(lang, w.word, value); afterChange(); });
      options.appendChild(btn);
    }
    addOption('Photo', v.photo, 'img');
    addOption('Icon',  v.svg,   'img');
    addOption('Emoji', v.emoji, 'emoji');
    if (!options.hasChildNodes()) {
      options.appendChild(el('p', 'mc-empty', 'No built-in visuals for this word — set a custom one below.'));
    }
    detail.appendChild(options);

    const custom = el('div', 'mc-pic-custom');
    const customUrlI = textInput('Custom image URL…');
    const useUrlBtn = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Use URL');
    useUrlBtn.type = 'button';
    useUrlBtn.addEventListener('click', () => {
      if (!customUrlI.value.trim()) return;
      setPictureOverride(lang, w.word, customUrlI.value.trim());
      afterChange();
    });
    const urlRow = el('div', 'mc-pic-custom-row');
    urlRow.append(customUrlI, useUrlBtn);

    const fileI = el('input', 'mc-input') as HTMLInputElement;
    fileI.type = 'file';
    fileI.accept = 'image/*';
    fileI.addEventListener('change', () => {
      const file = fileI.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { setPictureOverride(lang, w.word, String(reader.result)); afterChange(); };
      reader.readAsDataURL(file);
    });

    custom.append(
      urlRow,
      field('...or upload a file', fileI),
      buildStockImagePicker(current && isImageOverride(current) ? current : null, url => {
        setPictureOverride(lang, w.word, url);
        afterChange();
      }),
    );
    detail.appendChild(custom);

    if (current) {
      const clearBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Clear override (use automatic default)');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => { removePictureOverride(lang, w.word); afterChange(); });
      detail.appendChild(clearBtn);
    }
  }

  const ui = buildWordSearchUI({
    defaultLang,
    placeholder: 'Search for a word with a photo, icon or emoji…',
    fetchWords: loadWords,
    isEligible: (lang, w) => hasAnyVisual(visualsFor(lang, w)) || !!getPictureOverride(lang, w.word),
    isOverridden: (lang, w) => !!getPictureOverride(lang, w.word),
    onSelect: selectWord,
    onLangChange: () => { detail.innerHTML = ''; detail.hidden = true; },
  });

  wrap.append(ui.langRow, ui.wrap, detail);

  async function openWord(lang: string, word: string): Promise<void> {
    await ui.openWord(lang, word);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return { wrap, openWord };
}

/** `onOpen` reopens this word in the picture editor above — the row itself
 *  is clickable for that (see .mc-row--clickable), with Remove as the one
 *  carve-out that doesn't trigger it. */
function buildPictureRow(
  info: LanguageInfo, word: string, value: string, refresh: () => void, onOpen: () => void,
): HTMLElement {
  const row = el('div', 'mc-row mc-row--clickable');
  row.addEventListener('click', onOpen);

  if (isImageOverride(value)) {
    const thumb = el('img', 'mc-thumb') as HTMLImageElement;
    thumb.src = value;
    thumb.alt = word;
    row.appendChild(thumb);
  } else {
    row.appendChild(el('span', 'mc-thumb mc-thumb--emoji', value));
  }
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${word}`));
  main.appendChild(title);
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    removePictureOverride(info.name, word);
    refresh();
  });
  row.appendChild(delBtn);
  return row;
}
