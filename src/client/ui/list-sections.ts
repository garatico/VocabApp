/**
 * list-sections.ts — the collapsible, colour-coded "Single-Language Lists" / "Cross-Language Lists"
 * blocks shared by every place that offers a list to add words to: My Lists' Move/Copy popover and
 * Table mode's add-to-list pickers. Each kind wears its sidebar colour (the section classes live in
 * my-lists.css), and a section folded in one stays folded in the others for the rest of the session.
 */

export type ListSectionKind = 'single' | 'multi';

const collapsedSections = new Set<ListSectionKind>();

/**
 * A titled section holding `rows`. Clicking the title folds it; `onToggle` runs afterwards, for a
 * popover that needs to re-position itself because its height just changed.
 */
export function buildListSection(
  kind: ListSectionKind, title: string, rows: HTMLElement[], onToggle?: () => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = `ml-move-section ml-move-section--${kind}`;
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'ml-move-section-head';
  const caret = document.createElement('span');
  caret.className = 'ml-section-caret';
  caret.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = title;
  head.append(caret, label);
  const body = document.createElement('div');
  body.className = 'ml-move-section-body';
  rows.forEach(r => body.appendChild(r));
  const sync = (): void => {
    const collapsed = collapsedSections.has(kind);
    caret.textContent = collapsed ? '\u25B8' : '\u25BE';
    head.setAttribute('aria-expanded', String(!collapsed));
    body.hidden = collapsed;
  };
  head.addEventListener('click', e => {
    e.stopPropagation();
    if (collapsedSections.has(kind)) collapsedSections.delete(kind); else collapsedSections.add(kind);
    sync();
    onToggle?.();
  });
  sync();
  section.append(head, body);
  return section;
}
