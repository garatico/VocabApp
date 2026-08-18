import { applyTheme, type ThemeValue } from './ui/theme-toggle.ts';

/**
 * settings.ts — persistent quiz preferences.
 *
 * Keys use the 's_' prefix to distinguish from session state ('vq_' prefix).
 * Getters always return a typed, defaulted value; setters write to localStorage.
 */

const P = 's_';
const get = (k: string, fallback: string): string => localStorage.getItem(P + k) ?? fallback;
const set = (k: string, v: string): void => { localStorage.setItem(P + k, v); };

export type HintMode  = 'none' | 'first-letter' | 'full';
export type MatchMode = 'fuzzy' | 'strict';
export type TypoTolerance = 'off' | 'low' | 'normal' | 'high';

// Fraction of an answer's length forgiven as typos in quiz checking.
const TYPO_RATIOS: Record<TypoTolerance, number> = { off: 0, low: 0.15, normal: 0.25, high: 0.35 };
export type FontSize  = 'xs' | 'small' | 'medium' | 'large' | 'xl';

export type ConjDeselected = 'close' | 'blank' | 'grey' | 'answer';
const CONJ_DESELECTED: ConjDeselected[] = ['close', 'blank', 'grey', 'answer'];

/** Grid class for each mode. 'close' needs none — it is the base behaviour. */
export const CONJ_DESELECTED_CLASS: Record<ConjDeselected, string> = {
  close:  '',
  blank:  'conj-cards-grid--keep-blank',
  grey:   'conj-cards-grid--keep-grey',
  answer: 'conj-cards-grid--keep-answer',
};

/** Put the right modifier on the cards grid, clearing the other three. */
export function applyConjDeselectedClass(grid: Element | null, mode: ConjDeselected): void {
  if (!grid) return;
  Object.values(CONJ_DESELECTED_CLASS).forEach(c => { if (c) grid.classList.remove(c); });
  const cls = CONJ_DESELECTED_CLASS[mode];
  if (cls) grid.classList.add(cls);
}

export const Settings = {
  // ── Table ──────────────────────────────────────────────────────────────────
  getTableCols: (): number    => Math.max(1, Math.min(5, Number(get('table_cols', '2')))),
  getHintMode:  (): HintMode  => get('hint_mode',  'full')  as HintMode,

  /**
   * Words shown per page in table mode. 'all' (or any unparseable value)
   * means no pagination, represented as Infinity so callers can slice with it
   * directly.
   */
  getTablePageSize: (): number => {
    const raw = get('table_page_size', '100');
    if (raw === 'all') return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  },

  // ── All quizzes ────────────────────────────────────────────────────────────
  getMatchMode: (): MatchMode => get('match_mode', 'fuzzy') as MatchMode,
  getTypoTolerance: (): TypoTolerance => get('typo_tolerance', 'normal') as TypoTolerance,
  getTypoToleranceRatio: (): number => TYPO_RATIOS[get('typo_tolerance', 'normal') as TypoTolerance] ?? 0.25,

  // ── Appearance ────────────────────────────────────────────────────────────
  getFontSize: (): FontSize => get('font_size', 'medium') as FontSize,

  // ── Recall ─────────────────────────────────────────────────────────────────
  getRecallSeconds: (): number => {
    const v = get('recall_timer', '300');
    if (v === 'custom') {
      return (Number(get('recall_timer_custom', '5')) || 5) * 60;
    }
    return Number(v);
  },
  getHardStop: (): boolean => get('hard_stop', 'false') === 'true',

  /**
   * Recall: accept a word the moment it is typed, or wait for Enter.
   *
   * Auto-accept is faster but can only fire when the typed text cannot be
   * extended into a longer word, since short words like 'e' and 'la' are also
   * the openings of longer ones.
   */
  getRecallAutoEnter: (): boolean => get('recall_auto_enter', 'true') === 'true',

  // ── Conjugation ────────────────────────────────────────────────────────────

  /**
   * What a deselected pronoun leaves behind.
   *
   * Anything but 'close' keeps the cell, so dropping *vosotros* still gives a
   * 2×3 chart with every other pronoun where a learner expects to find it,
   * rather than moving *ellos* up into the *vosotros* slot.
   *
   *   close   remove the cell; the rest close up. Denser, but the chart loses
   *           its shape.
   *   blank   keep the cell and its grid lines, hide the contents.
   *   grey    keep the cell, show the pronoun and an empty disabled box, dimmed
   *           — you can still see which pronoun you dropped.
   *   answer  as grey, with the conjugation filled in. Turns a deselected
   *           pronoun into a worked example rather than a blank.
   */
  getConjDeselected: (): ConjDeselected => {
    const raw = localStorage.getItem(P + 'conj_deselected');
    if (raw && CONJ_DESELECTED.includes(raw as ConjDeselected)) return raw as ConjDeselected;
    // Migrate the boolean this replaced. It only distinguished keep from close,
    // and 'grey' is the keep variant that shows the most.
    const legacy = localStorage.getItem(P + 'conj_keep_shape');
    if (legacy === 'false') return 'close';
    return 'grey';
  },
};

// ── Font size application ─────────────────────────────────────────────────────

export function applyFontSize(size: FontSize = Settings.getFontSize()): void {
  document.documentElement.classList.remove('font-xs', 'font-sm', 'font-lg', 'font-xl');
  if (size === 'xs')    document.documentElement.classList.add('font-xs');
  if (size === 'small') document.documentElement.classList.add('font-sm');
  if (size === 'large') document.documentElement.classList.add('font-lg');
  if (size === 'xl')    document.documentElement.classList.add('font-xl');
}

const FONT_TO_RS: Record<FontSize, number> = {
  xs: 1.0, small: 1.15, medium: 1.32, large: 1.48, xl: 1.65,
};
export function getFontScaleForRecall(): number {
  return FONT_TO_RS[Settings.getFontSize()] ?? 1.32;
}

// ── Bind settings UI ─────────────────────────────────────────────────────────

function activateToggle(groupId: string, btn: HTMLButtonElement): void {
  document.querySelectorAll(`#${groupId} .sort-order-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/**
 * Notified when the words-per-page setting changes so table mode can
 * re-paginate a quiz that's already on screen.
 */
let onPageSizeChange: (() => void) | null = null;

export function setOnPageSizeChange(fn: () => void): void {
  onPageSizeChange = fn;
}

/**
 * Notified when the deselected-pronoun mode changes, so conjugation mode can
 * fill in or clear the answers that 'answer' mode shows. The class alone
 * cannot do that — it is content, not styling.
 */
let onConjDeselectedChange: (() => void) | null = null;

export function setOnConjDeselectedChange(fn: (() => void) | null): void {
  onConjDeselectedChange = fn;
}

export function bindSettings(): void {
  // Theme
  document.getElementById('settingTheme')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTheme', btn);
    const value = (btn.dataset.theme ?? 'system') as ThemeValue;
    if (value === 'system') {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', value);
    }
    applyTheme(value);
  });

  // Font size
  document.getElementById('settingFontSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingFontSize', btn);
    const size = (btn.dataset.size ?? 'medium') as FontSize;
    set('font_size', size);
    applyFontSize(size);
  });

  // Column count
  document.getElementById('settingCols')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingCols', btn);
    set('table_cols', btn.dataset.cols ?? '2');
  });

  // Words per page (table mode)
  document.getElementById('settingPageSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingPageSize', btn);
    set('table_page_size', btn.dataset.pagesize ?? '100');
    onPageSizeChange?.();
  });

  // Hint mode
  document.getElementById('settingHint')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingHint', btn);
    set('hint_mode', btn.dataset.hint ?? 'full');
  });

  // Match mode
  document.getElementById('settingMatch')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingMatch', btn);
    set('match_mode', btn.dataset.match ?? 'fuzzy');
  });

  // Typo tolerance
  document.getElementById('settingTypo')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTypo', btn);
    set('typo_tolerance', btn.dataset.typo ?? 'normal');
  });

  // Recall timer + on-timeout now live in the controls bar next to Start Quiz,
  // not in this modal — they are per-session choices, so they belong where the
  // session starts. Same storage keys, so nothing else had to change.
  const timerSel    = document.getElementById('recallTimerSelect') as HTMLSelectElement | null;
  const timerCustom = document.getElementById('recallTimerCustom') as HTMLInputElement  | null;
  timerSel?.addEventListener('change', () => {
    if (timerCustom) timerCustom.style.display = timerSel.value === 'custom' ? 'inline-block' : 'none';
    if (timerSel.value === 'custom') timerCustom?.focus();
    set('recall_timer', timerSel.value);
  });
  timerCustom?.addEventListener('input', () => set('recall_timer_custom', timerCustom.value));

  document.getElementById('recallHardStop')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('recallHardStop', btn);
    set('hard_stop', btn.dataset.stop ?? 'false');
  });

  // Recall: auto-accept vs Enter
  document.getElementById('settingRecallAutoEnter')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingRecallAutoEnter', btn);
    set('recall_auto_enter', btn.dataset.auto ?? 'true');
  });

  // Conjugation: what a deselected pronoun leaves behind
  document.getElementById('settingConjShape')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConjShape', btn);
    const mode = (btn.dataset.shape ?? 'grey') as ConjDeselected;
    set('conj_deselected', mode);
    // Applies to a quiz already on screen — it is only a display choice, so
    // there is no reason to make the learner restart to see it.
    applyConjDeselectedClass(document.querySelector('.conj-cards-grid'), mode);
    onConjDeselectedChange?.();
  });

  restoreSettingsUI();
}

function restoreSettingsUI(): void {
  // Theme
  const savedTheme = localStorage.getItem('theme') ?? 'system';
  document.querySelectorAll<HTMLElement>('#settingTheme .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === savedTheme);
  });

  // Font size
  const savedFont = get('font_size', 'medium');
  document.querySelectorAll<HTMLElement>('#settingFontSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === savedFont);
  });

  // Cols
  const savedCols = get('table_cols', '2');
  document.querySelectorAll<HTMLElement>('#settingCols .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cols === savedCols);
  });

  // Words per page
  const savedPageSize = get('table_page_size', '100');
  document.querySelectorAll<HTMLElement>('#settingPageSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pagesize === savedPageSize);
  });

  // Hint
  const savedHint = get('hint_mode', 'full');
  document.querySelectorAll<HTMLElement>('#settingHint .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.hint === savedHint);
  });

  // Match
  const savedMatch = get('match_mode', 'fuzzy');
  document.querySelectorAll<HTMLElement>('#settingMatch .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.match === savedMatch);
  });

  // Typo tolerance
  const savedTypo = get('typo_tolerance', 'normal');
  document.querySelectorAll<HTMLElement>('#settingTypo .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.typo === savedTypo);
  });

  // Timer (now in the controls bar)
  const timerSel    = document.getElementById('recallTimerSelect') as HTMLSelectElement | null;
  const timerCustom = document.getElementById('recallTimerCustom') as HTMLInputElement  | null;
  const savedTimer  = get('recall_timer', '300');
  if (timerSel) {
    const knownOption = timerSel.querySelector<HTMLOptionElement>(`option[value="${savedTimer}"]`);
    if (knownOption) {
      timerSel.value = savedTimer;
    } else {
      timerSel.value = 'custom';
      if (timerCustom) {
        timerCustom.style.display = 'inline-block';
        timerCustom.value = get('recall_timer_custom', '5');
      }
    }
  }

  // Hard stop
  const savedStop = get('hard_stop', 'false');
  document.querySelectorAll<HTMLElement>('#recallHardStop .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.stop === savedStop);
  });

  // Recall auto-enter
  const savedAuto = get('recall_auto_enter', 'true');
  document.querySelectorAll<HTMLElement>('#settingRecallAutoEnter .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.auto === savedAuto);
  });

  // Conjugation chart shape
  const savedShape = Settings.getConjDeselected();
  document.querySelectorAll<HTMLElement>('#settingConjShape .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === savedShape);
  });
}
