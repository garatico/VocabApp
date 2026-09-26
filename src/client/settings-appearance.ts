import { LANGUAGES, flagUrl } from './data/languages.ts';
import { createFlagImg } from './ui/flag-icon.ts';
import { GENDER_COLOR_DEFS, ML_COLOR_DEFS, PERSON_COLOR_DEFS, POS_COLOR_DEFS, Settings, TABLE_COLOR_DEFS, TENSE_COLOR_DEFS, applyGenderColors, applyLangColors, applyMlColors, applyPosColors, applyTableColors, applyTenseColors, set } from './settings.ts';

/**
 * settings-appearance.ts — the Settings screen's colour and language-appearance
 * pickers (language flags/colours, tense, person, part-of-speech, table and
 * gender colours). Applying a colour is settings.ts's; this builds the rows.
 */

export function buildLangAppearanceRows(): void {
  const list = document.getElementById('settingLangColors');
  if (!list) return;
  list.innerHTML = '';

  for (const lang of LANGUAGES) {
    const row     = document.createElement('div');
    row.className = 'lang-appearance-row';

    const name       = document.createElement('span');
    name.className   = 'lang-appearance-name';
    name.textContent = lang.label;

    const flagPreview = createFlagImg(Settings.getLangFlag(lang.name), lang.label);

    const flagSelect      = document.createElement('select');
    flagSelect.className  = 'lang-appearance-flag';
    flagSelect.dataset.lang = lang.name;
    flagSelect.title      = `Flag shown for ${lang.label} in Flag mode`;
    const currentFlag = Settings.getLangFlag(lang.name);
    for (const opt of lang.flagOptions) {
      const o       = document.createElement('option');
      o.value       = opt.country;
      o.textContent = opt.label;
      o.selected    = opt.country === currentFlag;
      flagSelect.appendChild(o);
    }
    flagSelect.addEventListener('change', () => {
      set('lang_flag_' + lang.name, flagSelect.value);
      flagPreview.src = flagUrl(flagSelect.value);
    });

    const colorLabel      = document.createElement('label');
    colorLabel.className  = 'lang-appearance-color';
    colorLabel.title      = `Cell color for ${lang.label} in Color mode`;
    const colorInput      = document.createElement('input');
    colorInput.type       = 'color';
    colorInput.dataset.lang = lang.name;
    colorInput.value = Settings.getLangColor(lang.name)
      ?? rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(lang.colorVar));
    colorInput.addEventListener('input', () => {
      set('lang_color_' + lang.name, colorInput.value);
      applyLangColors();
    });
    colorLabel.appendChild(colorInput);

    row.append(name, flagPreview, flagSelect, colorLabel);
    list.appendChild(row);
  }
}

/**
 * `<input type="color">` requires a #rrggbb value; the CSS default is
 * already hex, but read via getComputedStyle it can come back as
 * `rgb(r, g, b)` depending on the browser. Falls back to a neutral grey
 * if parsing fails for any reason rather than leaving the input blank.
 */
function rgbToHex(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const m = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#cccccc';
  const [, r, g, b] = m;
  return '#' + [r, g, b].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

/**
 * Tense/person colors store only a hue (0-360) — conjugation.css derives
 * saturation and lightness itself, varying them by state (hover/active) and
 * theme, so storing a full color would fight those variations. `<input
 * type="color">` only speaks full hex, so a swatch is rendered at a fixed,
 * representative saturation/lightness (45%/45%, matching the un-selected
 * chip's own hsl() call in conjugation.css) and any hex the user picks is
 * converted back down to just its hue on input.
 */
function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.45, l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60  ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
              [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToHue(hex: string): number {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  h *= 60;
  return Math.round(h < 0 ? h + 360 : h);
}

/**
 * One row per tense (or per pronoun slot) — a label and a color swatch —
 * built from TENSE_COLOR_DEFS/PERSON_COLOR_DEFS rather than hand-written,
 * same reasoning as buildLangAppearanceRows above.
 */
export function buildConjColorRows(): void {
  const tenseList = document.getElementById('settingTenseColors');
  if (tenseList) {
    tenseList.innerHTML = '';
    for (const [key, label, defaultHue] of TENSE_COLOR_DEFS) {
      tenseList.appendChild(buildColorSwatchRow(
        label, Settings.getTenseHue(key) ?? defaultHue,
        hue => { set('tense_hue_' + key, String(hue)); applyTenseColors(); },
      ));
    }
  }
  const personList = document.getElementById('settingPersonColors');
  if (personList) {
    personList.innerHTML = '';
    for (const [i, label, defaultHue] of PERSON_COLOR_DEFS) {
      personList.appendChild(buildColorSwatchRow(
        label, Settings.getPersonHue(i) ?? defaultHue,
        hue => { set('person_hue_' + i, String(hue)); applyTenseColors(); },
      ));
    }
  }
}

/** One row per part of speech — built from POS_COLOR_DEFS, same shape as
 *  buildConjColorRows above. */
export function buildPosColorRows(): void {
  const list = document.getElementById('settingPosColors');
  if (!list) return;
  list.innerHTML = '';
  for (const [key, label, defaultHue] of POS_COLOR_DEFS) {
    list.appendChild(buildColorSwatchRow(
      label, Settings.getPosHue(key) ?? defaultHue,
      hue => { set('pos_hue_' + key, String(hue)); applyPosColors(); },
    ));
  }
}

function buildColorSwatchRow(label: string, currentHue: number, onPick: (hue: number) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'conj-color-row';
  const name = document.createElement('span');
  name.className   = 'conj-color-name';
  name.textContent = label;
  const input = document.createElement('input');
  input.type  = 'color';
  input.value = hueToHex(currentHue);
  input.addEventListener('input', () => onPick(hexToHue(input.value)));
  row.append(name, input);
  return row;
}

/**
 * One row per Table mode state — built from TABLE_COLOR_DEFS, same layout
 * as buildColorSwatchRow above. Unlike that one, this stores and reads a
 * full #rrggbb color directly rather than a hue: `<input type="color">`
 * already speaks hex natively, and table.css's states are specific colors a
 * learner would want to set precisely, not hue-only categories the way
 * tenses are — no hueToHex/hexToHue round-trip needed at all.
 */
export function buildTableColorRows(): void {
  const list = document.getElementById('settingTableColors');
  if (!list) return;
  list.innerHTML = '';
  for (const [key, label, fallbackVar] of TABLE_COLOR_DEFS) {
    // No override stored — show whatever the active theme actually
    // resolves the fallback token to, not a hardcoded guess, so switching
    // themes with no override set always shows the truthful current color.
    const current = Settings.getTableColor(key)
      ?? rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(fallbackVar));
    list.appendChild(buildHexColorSwatchRow(label, current, hex => {
      set('table_color_' + key, hex);
      applyTableColors();
    }));
  }
}

/**
 * One row per gender — built from GENDER_COLOR_DEFS, same layout/reasoning
 * as buildTableColorRows above.
 */
export function buildGenderColorRows(): void {
  const list = document.getElementById('settingGenderColors');
  if (!list) return;
  list.innerHTML = '';
  for (const [key, label, fallbackVar] of GENDER_COLOR_DEFS) {
    const current = Settings.getGenderColor(key)
      ?? rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(fallbackVar));
    list.appendChild(buildHexColorSwatchRow(label, current, hex => {
      set('gender_color_' + key, hex);
      applyGenderColors();
    }));
  }
}

/** One row per My Lists sidebar accent — same layout and reasoning as buildGenderColorRows. */
export function buildMlColorRows(): void {
  const list = document.getElementById('settingMlColors');
  if (!list) return;
  list.innerHTML = '';
  for (const [key, label, accentVar] of ML_COLOR_DEFS) {
    const current = Settings.getMlColor(key)
      ?? rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(accentVar));
    list.appendChild(buildHexColorSwatchRow(label, current, hex => {
      set('list_color_' + key, hex);
      applyMlColors();
    }));
  }
}

function buildHexColorSwatchRow(label: string, currentHex: string, onPick: (hex: string) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'conj-color-row';
  const name = document.createElement('span');
  name.className   = 'conj-color-name';
  name.textContent = label;
  const input = document.createElement('input');
  input.type  = 'color';
  input.value = currentHex;
  input.addEventListener('input', () => onPick(input.value));
  row.append(name, input);
  return row;
}
