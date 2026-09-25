import { readString, writeString, readJson, writeJson, isStringArray } from '../../utils/storage.ts';
import { el } from './shared.ts';

/**
 * my-content/layout.ts — the tab's chrome: collapsible sections, the
 * Words / Trivia / Guess the Blank / Pictures tab bar, and subsections.
 */

// ── Collapsible sections ─────────────────────────────────────────────────────
//
// Words/Trivia/Pictures each run long — collapsing whichever aren't in use
// right now is the difference between one screenful and several. Collapse
// state persists per section key (not tied to renderMyContent's own rebuild)
// so it survives the tab's cheap rebuild-everything-on-every-change pattern;
// sections start expanded, same as before this existed, and stay however a
// learner last left them.
//
// The Words section itself nests two of these — "Add a new word" and "Edit
// an existing word" (buildSubsection) — one visual step down from a
// top-level section (buildSection): a <div>/<h4> instead of a <section>/<h3>,
// sharing every key in the same COLLAPSED_SECTIONS_KEY set as long as each
// caller picks its own unique key ('words-add'/'words-edit' vs. 'words').

const COLLAPSED_SECTIONS_KEY = 'vq_mycontent_collapsed';

export function getCollapsedSections(): Set<string> {
  return new Set(readJson<string[]>(COLLAPSED_SECTIONS_KEY, [], isStringArray));
}

export function setCollapsedSections(keys: Set<string>): void {
  writeJson(COLLAPSED_SECTIONS_KEY, [...keys]);
}

interface CollapsibleClasses {
  wrap: string; header: string; chevron: string; title: string; body: string; desc: string; collapsedModifier: string;
}

/**
 * Shared toggle/persistence behind buildSection and buildSubsection below —
 * only the tag names, heading level and class names differ between a
 * top-level section and one nested inside it, so the collapse mechanics
 * (and the storage key both read from) can't drift apart between the two.
 *
 * Wraps `body` in a clickable header (title + chevron) that shows or hides
 * it in place — deliberately not a rebuild, so a search in progress or a
 * half-filled form inside `body` survives collapsing the wrapper around it.
 */
function buildCollapsible(
  wrapTag: 'section' | 'div', titleTag: 'h3' | 'h4', classes: CollapsibleClasses,
  key: string, title: string, description: string, body: HTMLElement,
): HTMLElement {
  const wrap = document.createElement(wrapTag);
  wrap.className = classes.wrap;

  const header = el('div', classes.header);
  header.setAttribute('role', 'button');
  header.tabIndex = 0;
  header.append(el('span', classes.chevron, '▾'), el(titleTag, classes.title, title));

  const bodyWrap = el('div', classes.body);
  bodyWrap.append(el('p', classes.desc, description), body);

  function applyState(collapsed: boolean): void {
    bodyWrap.hidden = collapsed;
    wrap.classList.toggle(classes.collapsedModifier, collapsed);
    header.setAttribute('aria-expanded', String(!collapsed));
  }
  applyState(getCollapsedSections().has(key));

  function toggle(): void {
    const collapsed = !bodyWrap.hidden;
    applyState(collapsed);
    const keys = getCollapsedSections();
    if (collapsed) keys.add(key); else keys.delete(key);
    setCollapsedSections(keys);
  }
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  wrap.append(header, bodyWrap);
  return wrap;
}

// ── Content-type tabs: Words / Trivia / Guess the Blank / Pictures ─────────
//
// One of these four is shown at a time, switched the same way the app's own
// top-level mode-tabs work — not the independently-collapsible accordion
// this used to be (buildSection, above buildSubsection below, still does
// that for nested "Add"/"Edit" blocks within a tab). All four panels are
// built up front and only ever hidden/shown, never rebuilt on a tab switch,
// so a search in progress or a half-filled form in a tab that isn't showing
// right now survives clicking over to another and back — same reasoning as
// buildCollapsible's own "toggle in place, don't rebuild" comment below.

const ACTIVE_TAB_KEY = 'vq_mycontent_activetab';

type MCTabKey = 'words' | 'trivia' | 'guessBlank' | 'pictures';
const MC_TAB_KEYS: readonly MCTabKey[] = ['words', 'trivia', 'guessBlank', 'pictures'];

function isMCTabKey(v: string | null): v is MCTabKey {
  return v !== null && (MC_TAB_KEYS as readonly string[]).includes(v);
}

export function getActiveTab(): MCTabKey {
  const stored = readString(ACTIVE_TAB_KEY);
  return isMCTabKey(stored) ? stored : 'words';
}

export function setActiveTab(tab: MCTabKey): void {
  writeString(ACTIVE_TAB_KEY, tab);
}

interface MCTabDef {
  key:         MCTabKey;
  title:       string;
  description: string;
  body:        HTMLElement;
}

export function buildContentTabs(tabs: MCTabDef[], initialActive: MCTabKey): HTMLElement {
  const wrap   = el('div', 'mc-tabs-outer');
  const tabBar = el('div', 'mc-tabs');
  tabBar.setAttribute('role', 'tablist');
  const panelsWrap = el('div', 'mc-tabs-wrap');

  const panels  = new Map<MCTabKey, HTMLElement>();
  const buttons = new Map<MCTabKey, HTMLButtonElement>();

  function activate(key: MCTabKey): void {
    panels.forEach((panel, k) => { panel.hidden = k !== key; });
    buttons.forEach((btn, k) => {
      btn.classList.toggle('active', k === key);
      btn.setAttribute('aria-selected', String(k === key));
    });
    setActiveTab(key);
  }

  for (const { key, title, description, body } of tabs) {
    const btn = el('button', 'mc-tab-btn', title) as HTMLButtonElement;
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => activate(key));
    buttons.set(key, btn);
    tabBar.appendChild(btn);

    const panel = el('div', 'mc-tab-panel');
    panel.append(el('p', 'mc-tab-desc', description), body);
    panels.set(key, panel);
    panelsWrap.appendChild(panel);
  }

  wrap.append(tabBar, panelsWrap);
  activate(panels.has(initialActive) ? initialActive : tabs[0].key);
  return wrap;
}

export function buildSubsection(key: string, title: string, description: string, body: HTMLElement): HTMLElement {
  return buildCollapsible('div', 'h4', {
    wrap: 'mc-subsection', header: 'mc-subsection-header', chevron: 'mc-subsection-chevron',
    title: 'mc-subsection-title', body: 'mc-subsection-body', desc: 'mc-subsection-desc',
    collapsedModifier: 'mc-subsection--collapsed',
  }, key, title, description, body);
}
