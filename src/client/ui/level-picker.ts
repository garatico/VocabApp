/**
 * level-picker.ts — "where are you starting?", shown on the very first visit.
 *
 * Lives inside the welcome card (#onboardingCard). Choosing a level sets the
 * Words controls (see utils/level-plan.ts) and dismisses the card; skipping
 * leaves the defaults. It applies a plan by clicking the real controls rather
 * than writing settings directly, so their own handlers persist the choice and
 * rebuild the word pool exactly as if the learner had set them by hand.
 */

import { LEVELS, bandStates, levelById, type LevelPlan } from '../utils/level-plan.ts';
import { readString, writeString } from '../utils/storage.ts';
import { showToast } from './toast.ts';

const LEVEL_KEY = 's_starting_level';

/** Drive the Words controls to match `plan`. Exported for tests. */
export function applyPlan(plan: LevelPlan, doc: Document = document): void {
  const poolBtn = doc.querySelector<HTMLElement>(`#poolModeToggle [data-pool="${plan.pool}"]`);
  poolBtn?.click();

  if (plan.pool === 'topn') {
    const sel = doc.getElementById('sizeSelect') as HTMLSelectElement | null;
    if (sel) {
      sel.value = plan.size;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }

  // The chips are independent toggles, so click only those that differ.
  const wanted = bandStates(plan);
  doc.querySelectorAll<HTMLElement>('#bandChips .pos-chip').forEach(chip => {
    const band = chip.dataset['band'] as keyof typeof wanted | undefined;
    if (band && chip.classList.contains('active') !== wanted[band]) chip.click();
  });
}

/** Build the button row into `host`, calling `onChosen` after a level is applied. */
export function renderLevelChoices(host: HTMLElement, onChosen: () => void): void {
  host.textContent = '';
  const group = document.createElement('div');
  group.className = 'onboarding-levels';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Where are you starting?');

  for (const level of LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'onboarding-level';
    btn.dataset['level'] = level.id;

    const label = document.createElement('span');
    label.className = 'onboarding-level-label';
    label.textContent = level.label;
    const blurb = document.createElement('span');
    blurb.className = 'onboarding-level-blurb';
    blurb.textContent = level.blurb;
    btn.append(label, blurb);

    btn.addEventListener('click', () => {
      applyPlan(level.plan);
      writeString(LEVEL_KEY, level.id);
      showToast(`Set up for “${level.label}”. Press Start Quiz when you're ready.`, 'success', 4500);
      onChosen();
    });
    group.appendChild(btn);
  }
  host.appendChild(group);
}

/** The level chosen earlier, if any. */
export function chosenLevel(): string | null {
  const id = readString(LEVEL_KEY);
  return id && levelById(id) ? id : null;
}
