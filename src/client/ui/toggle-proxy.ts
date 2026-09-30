/**
 * toggle-proxy.ts — a compact stand-in for a row of toggle buttons.
 *
 * The controls bar's chip rows (Quiz Style, Direction, Words' size mode) are the app's real controls:
 * every saved setting, Testing Profile, resume point and keyboard path reads and writes them through
 * their buttons and their `.active` class. Replacing them would mean touching all of that. Instead the
 * row stays in the page, hidden, as the source of truth, and a `<select>` or a click-to-cycle button
 * stands in for it: choosing on the proxy clicks the matching hidden button (so the existing handlers
 * run exactly as if it had been clicked), and anything that changes the row from elsewhere — a restored
 * setting, a profile being applied, a translated label — is mirrored back onto the proxy.
 */

interface Choice { value: string; label: string; title: string; cc: string; button: HTMLButtonElement }

/** Which attribute names a button's value: `data-style`, `data-direction`, `data-mode`. */
function choicesOf(toggle: HTMLElement, valueAttr: string): Choice[] {
  return [...toggle.querySelectorAll<HTMLButtonElement>('button')].map(button => ({
    value: button.dataset[valueAttr] ?? '',
    label: (button.textContent ?? '').trim(),
    title: button.title,
    cc: button.dataset['cc'] ?? '',
    button,
  })).filter(c => c.value !== '');
}

const activeOf = (choices: Choice[]): Choice | undefined =>
  choices.find(c => c.button.classList.contains('active')) ?? choices[0];

/** Re-runs `sync` whenever the hidden row changes: the active button, a label, the buttons themselves. */
function watch(toggle: HTMLElement, sync: () => void): void {
  new MutationObserver(sync).observe(toggle, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'title'],
  });
  sync();
}

/** A `<select>` whose options are the toggle's buttons. */
export function proxyToggleAsSelect(toggle: HTMLElement | null, select: HTMLSelectElement | null, valueAttr: string): void {
  if (!toggle || !select) return;
  toggle.classList.add('ctl-proxied');
  const sync = (): void => {
    const choices = choicesOf(toggle, valueAttr);
    const same = select.options.length === choices.length
      && choices.every((c, i) => select.options[i].value === c.value && select.options[i].textContent === c.label);
    if (!same) {
      select.replaceChildren(...choices.map(c => {
        const o = document.createElement('option');
        o.value = c.value; o.textContent = c.label; o.title = c.title;
        if (c.cc) o.dataset['cc'] = c.cc;
        return o;
      }));
    }
    const active = activeOf(choices);
    if (active) {
      select.value = active.value;
      if (active.cc) select.dataset['cc'] = active.cc; else delete select.dataset['cc'];   // colours the closed select too
    }
  };
  select.addEventListener('change', () => {
    choicesOf(toggle, valueAttr).find(c => c.value === select.value)?.button.click();
  });
  watch(toggle, sync);
}

/** A button that shows the toggle's current choice and moves to the next one each time it is clicked. */
export function proxyToggleAsCycle(toggle: HTMLElement | null, button: HTMLButtonElement | null, valueAttr: string, name: string): void {
  if (!toggle || !button) return;
  toggle.classList.add('ctl-proxied');
  const sync = (): void => {
    const active = activeOf(choicesOf(toggle, valueAttr));
    if (!active) return;
    button.textContent = `${active.label} ↻`;
    if (active.cc) button.dataset['cc'] = active.cc; else delete button.dataset['cc'];
    button.setAttribute('aria-label', `${name}: ${active.label}. Activate to change.`);
    button.title = active.title || `${name}: click to change`;
  };
  button.addEventListener('click', () => {
    const choices = choicesOf(toggle, valueAttr);
    if (choices.length < 2) return;
    const at = choices.findIndex(c => c === activeOf(choices));
    choices[(at + 1) % choices.length].button.click();
  });
  watch(toggle, sync);
}
