/**
 * filter-header.ts — the On/Off and chain controls every filter box carries.
 *
 * Both live in the header, outside the collapsible body, because a collapsed
 * filter still has to say whether it is doing anything and which modes it
 * applies to. Each button is its own indicator — there is no separate light to
 * fall out of step with the control.
 *
 * The three states a chain button shows:
 *
 *   linked, with company   this mode and at least one other share a setting
 *   linked, alone          chained, but every other mode has been unchained,
 *                          so it is sharing with nobody. Worth distinguishing:
 *                          the button is on but nothing is being kept in step.
 *   unlinked               this mode has its own setting
 *
 * One binder for all of them, so the Lists, Class and Domain boxes cannot drift
 * apart in how they behave.
 */

import { SCOPE_LABELS } from './filter-scope.ts';
import {
  isChained, chainedCount, toggleChain, type Bucket, type FilterId,
} from './filter-state.ts';
import { Settings } from '../settings.ts';

export interface FilterHeaderConfig {
  id: FilterId;
  /** Element ids of the two buttons and the transient note. */
  activeBtnId: string;
  chainBtnId:  string;
  noteId:      string;
  /** Read and write the filter's own on/off flag. */
  isActive:    () => boolean;
  setActive:   (on: boolean) => void;
  /** Move this filter's payload between buckets — see filter-state.toggleChain. */
  copyState:   (from: Bucket, to: Bucket) => void;
  /** Re-read state and repaint everything the filter owns. */
  onChange:    () => void;
}

const NOTE_MS = 4000;

/** Repaint both buttons from stored state. Safe to call as often as you like. */
export function syncFilterHeader(cfg: FilterHeaderConfig): void {
  const active = cfg.isActive();

  const activeBtn = document.getElementById(cfg.activeBtnId);
  if (activeBtn) {
    activeBtn.classList.toggle('filter-active-btn--on', active);
    activeBtn.setAttribute('aria-pressed', String(active));
    activeBtn.title = active
      ? 'This filter is on — click to switch it off without losing your selections'
      : 'This filter is off — click to switch it back on';
    const label = activeBtn.querySelector('.filter-active-label');
    if (label) label.textContent = active ? 'On' : 'Off';
  }

  const chainBtn = document.getElementById(cfg.chainBtnId);
  if (chainBtn) {
    // Nothing to toggle once linking is off app-wide — isChained() already
    // reads as unchained everywhere, so hiding the button matches what it
    // would say anyway rather than leaving a dead control on screen.
    chainBtn.hidden = !Settings.getFilterLinkingEnabled();
    const chained = isChained(cfg.id);
    const others  = chainedCount(cfg.id) - 1;
    chainBtn.classList.toggle('filter-chain-btn--on', chained);
    chainBtn.classList.toggle('filter-chain-btn--alone', chained && others === 0);
    chainBtn.setAttribute('aria-pressed', String(chained));
    chainBtn.textContent = chained ? '🔗' : '⛓️‍💥';
    chainBtn.title = !chained
      ? 'Not linked — this mode has its own setting. Click to link it, and the linked modes will adopt it.'
      : others > 0
        ? `Linked with ${others} other mode${others === 1 ? '' : 's'} — they all share this setting. Click to unlink this mode.`
        : 'Linked, but every other mode is unlinked, so nothing is being kept in step. Click to unlink this one too.';
  }

  // A filter that is off says so on the box itself, not just on the button.
  const box = document.getElementById(cfg.activeBtnId)?.closest<HTMLElement>('.filter-box, .list-filter-wrap, .domain-filter-wrap, .class-filter-wrap');
  box?.classList.toggle('filter-box--inactive', !active);
}

function showNote(noteId: string, text: string): void {
  const note = document.getElementById(noteId);
  if (!note) return;
  note.textContent = text;
  note.hidden = false;
  window.setTimeout(() => { note.hidden = true; }, NOTE_MS);
}

/** Wire both buttons. Call once per filter box on app init. */
export function bindFilterHeader(cfg: FilterHeaderConfig): void {
  document.getElementById(cfg.activeBtnId)?.addEventListener('click', () => {
    cfg.setActive(!cfg.isActive());
    syncFilterHeader(cfg);
    cfg.onChange();
  });

  document.getElementById(cfg.chainBtnId)?.addEventListener('click', () => {
    const { chained, affected } = toggleChain(cfg.id, cfg.copyState);
    syncFilterHeader(cfg);
    cfg.onChange();
    showNote(cfg.noteId, chained
      ? (affected.length
          ? `Linked — ${affected.map(s => SCOPE_LABELS[s]).join(', ')} now use this too`
          : 'Linked — no other mode is linked yet, so nothing else changed')
      : 'Unlinked — this mode now keeps its own setting');
  });

  syncFilterHeader(cfg);
}
