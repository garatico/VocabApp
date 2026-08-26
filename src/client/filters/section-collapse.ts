/**
 * section-collapse.ts
 *
 * Show/hide toggles for the filter sections (Part of Speech, Lists, Domains).
 *
 * Markup contract — a button carrying `data-collapse="<id of body element>"`:
 *
 *   <button class="filter-collapse-btn" data-collapse="domainFilterBody"
 *           aria-expanded="true" aria-controls="domainFilterBody">
 *     <span class="filter-collapse-arrow">▾</span>
 *     <span class="filter-section-label">Domains</span>
 *   </button>
 *   <div id="domainFilterBody" class="filter-body">…</div>
 *
 * The arrow points down when open and rotates to point at the label when
 * closed (CSS handles the rotation off `aria-expanded`). State is remembered
 * per section.
 */

import { readString, writeString } from '../utils/storage.ts';

const KEY_PREFIX = 's_section_open_';

function apply(btn: HTMLElement, body: HTMLElement, open: boolean): void {
  btn.setAttribute('aria-expanded', String(open));
  body.classList.toggle('filter-body--collapsed', !open);
}

/**
 * The boxed section a collapse button belongs to — click-anywhere-to-toggle
 * applies here. Deliberately excludes .settings-section: those sections are
 * full of description text and whitespace between rows (not just a few
 * checkboxes like the filter boxes below), so the same behavior there meant
 * clicking near a setting could collapse the whole section out from under it.
 * Settings sections still toggle via their own header button.
 */
const BLOCK_SELECTOR = '#classFilter, #listFilter, #domainFilterWrap, .filter-box';

/** Controls inside a section that must keep their own click behaviour. */
const INTERACTIVE = 'button, input, select, textarea, a, label';

export function initSectionCollapse(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-collapse]').forEach(btn => {
    const targetId = btn.dataset.collapse;
    if (!targetId) return;
    const body = document.getElementById(targetId);
    if (!body) return;

    // Restore — sections start collapsed so the controls bar stays compact on
    // first load; once you open one, that choice sticks. A section can opt
    // into starting open instead via data-default-open (Tense & Forms, the
    // one filter that defines what Conjugation mode is even drilling).
    const saved = readString(KEY_PREFIX + targetId);
    const defaultOpen = btn.dataset.defaultOpen === 'true';
    apply(btn, body, saved === null ? defaultOpen : saved === 'true');

    function toggle(): void {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      apply(btn, body as HTMLElement, open);
      writeString(KEY_PREFIX + (targetId as string), String(open));
    }

    btn.addEventListener('click', toggle);

    // The whole panel is a toggle target — any blank space in the grey box
    // counts, but never the controls inside it.
    const block = btn.closest<HTMLElement>(BLOCK_SELECTOR);
    if (block) {
      block.classList.add('filter-block--toggleable');
      block.addEventListener('click', e => {
        const el = e.target as Element;
        if (btn.contains(el)) return;               // the header handles itself
        if (el.closest(INTERACTIVE)) return;        // a real control was clicked
        toggle();
      });
    }
  });
}
