import {
  P, Settings, applyGenderColors, applyLangColors, applyMlColors, applyPosColors, applyTableColors, applyTenseColors,
} from './settings.ts';
import {
  buildConjColorRows, buildGenderColorRows, buildLangAppearanceRows, buildMlColorRows, buildPosColorRows, buildTableColorRows,
} from './settings-appearance.ts';
import { getGoals, type GoalType } from './utils/streak.ts';
import { keys, readString, remove, writeString } from './utils/storage.ts';

/**
 * settings-extras.ts — the parts of the Settings screen that "changed from default" cannot read off the
 * markup: the colour pickers, the daily-goal rows and the timed-quiz minutes box.
 *
 * settings-search.ts compares every ordinary row with the state its buttons and dropdowns shipped in.
 * These have no such baseline (a colour is either overridden in storage or it isn't; a goal is a number
 * in a data key), so each is described here by what its default is and how to put it back — and how to
 * put it back to whatever it is *now*, which is what Undo needs.
 */

// ── Colour groups ─────────────────────────────────────────────────────────

/** Each colour group's body id, and the s_ storage families it overrides. */
export const COLOUR_GROUPS: ReadonlyArray<{ body: string; prefixes: readonly string[] }> = [
  { body: 'settingsGroupMlColors',      prefixes: ['list_color_'] },
  { body: 'settingsGroupTableColors',   prefixes: ['table_color_'] },
  { body: 'settingsGroupGenderColors',  prefixes: ['gender_color_'] },
  { body: 'settingsGroupTenseColors',   prefixes: ['tense_hue_'] },
  { body: 'settingsGroupFormColors',    prefixes: ['person_hue_'] },
  { body: 'settingsGroupPosColors',     prefixes: ['pos_hue_'] },
  { body: 'settingsGroupLangAppearance', prefixes: ['lang_color_', 'lang_flag_'] },
];

function storedKeys(body: string): string[] {
  const group = COLOUR_GROUPS.find(g => g.body === body);
  if (!group) return [];
  return keys().filter(k => group.prefixes.some(p => k.startsWith(P + p)));
}

export function isColourGroup(body: string): boolean {
  return COLOUR_GROUPS.some(g => g.body === body);
}

/** True while any colour in the group is overridden. */
export function colourGroupChanged(body: string): boolean {
  return storedKeys(body).length > 0;
}

/** Repaint every colour picker and re-apply every colour, from storage. */
export function repaintColours(): void {
  applyLangColors(); applyTenseColors(); applyPosColors(); applyTableColors(); applyGenderColors(); applyMlColors();
  buildLangAppearanceRows(); buildConjColorRows(); buildPosColorRows(); buildTableColorRows(); buildGenderColorRows(); buildMlColorRows();
}

export function resetColourGroup(body: string): void {
  storedKeys(body).forEach(remove);
  repaintColours();
}

/** A closure that puts the group's colours back to what they are now. */
export function captureColourGroup(body: string): () => void {
  const snap = Object.fromEntries(storedKeys(body).map(k => [k, readString(k) ?? '']));
  return () => {
    storedKeys(body).forEach(remove);
    Object.entries(snap).forEach(([k, v]) => writeString(k, v));
    repaintColours();
  };
}

// ── Daily goals ───────────────────────────────────────────────────────────

const GOAL_TYPES: readonly GoalType[] = ['words', 'minutes', 'streak'];

/** Which goal a row edits (`data-goal-row`), or null for any other row. */
export function goalTypeOf(row: HTMLElement): GoalType | null {
  const t = row.dataset.goalRow as GoalType | undefined;
  return t && GOAL_TYPES.includes(t) ? t : null;
}

/** A goal's default is "off". Goals are per scope; this reads the global one. */
export function goalChanged(type: GoalType): boolean {
  return getGoals()[type] !== 0;
}

/** Choose a goal value through the row's own preset buttons / custom box, so its handler saves it. */
function chooseGoal(type: GoalType, target: number): void {
  const preset = document.querySelector<HTMLElement>(`[data-goal-presets="${type}"] .sort-order-btn[data-goal="${target}"]`);
  if (preset) { preset.click(); return; }
  const custom = document.querySelector<HTMLInputElement>(`[data-goal-custom="${type}"]`);
  if (!custom) return;
  custom.value = String(target);
  custom.dispatchEvent(new Event('change', { bubbles: true }));
}

export function resetGoal(type: GoalType): void {
  chooseGoal(type, 0);
}

export function captureGoal(type: GoalType): () => void {
  const target = getGoals()[type];
  return () => chooseGoal(type, target);
}

// ── Timed-quiz minutes ────────────────────────────────────────────────────

// Read through the Settings getter rather than naming the storage key here: it owns the key and the default.
const MINUTES_DEFAULT = 10;

export function holdsTimedMinutes(row: HTMLElement): boolean {
  return row.querySelector('#settingTimedQuizMinutes') !== null;
}

export function timedMinutesChanged(): boolean {
  return Settings.getTimedQuizMinutes() !== MINUTES_DEFAULT;
}

function setMinutes(value: string): void {
  const input = document.getElementById('settingTimedQuizMinutes') as HTMLInputElement | null;
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function resetTimedMinutes(): void {
  setMinutes(String(MINUTES_DEFAULT));
}

export function captureTimedMinutes(): () => void {
  const value = String(Settings.getTimedQuizMinutes());
  return () => setMinutes(value);
}
