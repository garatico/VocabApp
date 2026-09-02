/**
 * bulk-import.ts — paste or drop a word list and add all of it at once.
 *
 * Accepts anything comma-, newline-, tab- or semicolon-separated, which covers
 * a pasted column from a spreadsheet, a CSV row and a hand-typed list without
 * asking the user which one they have.
 *
 * The interesting part is what happens when a token does not match exactly.
 * Two cases, and neither may silently pick for the user:
 *
 *   - Several entries share the accent-stripped form (*como* / *cómo*). The
 *     accent carries the meaning, so we always ask — even when one of them was
 *     typed exactly, though that one is pre-selected so confirming is one click.
 *   - Nothing matched, but something close exists (*hablo* → hablar, *gato* →
 *     gata). Offered as candidates rather than dropped, because a learner
 *     pasting from their own notes is usually pasting inflected forms.
 *
 * Anything still unresolved is reported back by name. An import that quietly
 * loses a third of the paste is worse than one that says which third.
 */

import { foldKey as norm } from '../../utils/match.ts';
import { getList, addToList } from '../../utils/word-lists.ts';
import type { ListsCtx } from './context.ts';
import type { VocabEntry } from './types.ts';

/** A token we could not resolve on our own, and what we think it might be. */
interface Ambiguity {
  token:      string;
  options:    VocabEntry[];
  /** Pre-selected candidate, when one of the options was typed exactly. */
  preferred?: string;
}

/** Split on commas, newlines, tabs and semicolons; trim quotes and blanks. */
export function parseBulk(text: string): string[] {
  return text
    .split(/[,\n\r\t;]+/)
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Candidate matches for a token that didn't match exactly — inflections and
 * near-spellings, e.g. "hablo"/"hablamos" → hablar, "gato" → gata.
 */
export function findVariations(token: string, vocab: VocabEntry[]): VocabEntry[] {
  const t = norm(token);
  if (t.length < 3) return [];
  const stem = t.slice(0, Math.max(3, t.length - 3));
  return vocab
    .filter(e => {
      const w = norm(e.word);
      return w !== t && (w.startsWith(stem) || t.startsWith(w.slice(0, Math.max(3, w.length - 2))));
    })
    .slice(0, 6);
}

/**
 * Ask which of several candidates the user meant.
 *
 * Resolves to one entry per `pending` row, in the same order — `null` for a
 * row left unpicked. Not a flat list of the words that got picked: two rows
 * can share an overlapping candidate list (pasting both "como" and "cómo"
 * looks up the same accent-stripped bucket, so both rows offer the same
 * [como, cómo] options) — a flat "which words were picked anywhere" set
 * couldn't tell that row apart from the other, and could silently treat an
 * untouched row as resolved just because *some other* row happened to pick
 * one of the same candidates. Positional correspondence avoids that.
 */
export function askVariations(pending: Ambiguity[]): Promise<(string | null)[]> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'ml-variation-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'ml-variation-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const title = document.createElement('div');
    title.className = 'ml-variation-title';
    title.textContent = pending.length === 1
      ? '1 word needs a choice'
      : `${pending.length} words need a choice`;

    const sub = document.createElement('div');
    sub.className = 'ml-variation-sub';
    sub.textContent = 'These weren’t exact matches. Pick the entry you meant, or skip.';

    const body = document.createElement('div');
    body.className = 'ml-variation-body';

    pending.forEach(({ token, options, preferred }) => {
      const row = document.createElement('div');
      row.className = 'ml-variation-row';

      const label = document.createElement('div');
      label.className = 'ml-variation-token';
      label.textContent = token;

      const opts = document.createElement('div');
      opts.className = 'ml-variation-options';

      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ml-variation-option';
        btn.textContent = opt.word + (opt.translation ? ` — ${opt.translation}` : '');
        btn.addEventListener('click', () => {
          const active = opts.querySelector('.ml-variation-option--picked');
          if (active === btn) {
            btn.classList.remove('ml-variation-option--picked');
            row.dataset.picked = '';
          } else {
            active?.classList.remove('ml-variation-option--picked');
            btn.classList.add('ml-variation-option--picked');
            row.dataset.picked = opt.word;
          }
        });
        if (preferred && opt.word === preferred) {
          btn.classList.add('ml-variation-option--picked');
          row.dataset.picked = opt.word;
        }
        opts.appendChild(btn);
      });

      row.append(label, opts);
      body.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'ml-variation-actions';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button'; skipBtn.className = 'ml-variation-skip';
    skipBtn.textContent = 'Skip all';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ml-variation-add';
    addBtn.textContent = 'Add selected';
    actions.append(skipBtn, addBtn);

    function close(result: (string | null)[]): void {
      backdrop.remove();
      resolve(result);
    }
    const allSkipped = (): null[] => pending.map(() => null);

    skipBtn.addEventListener('click', () => close(allSkipped()));
    addBtn.addEventListener('click', () => {
      // DOM order matches pending's — each row was appended in that same
      // forEach above — so this lines up positionally with no extra bookkeeping.
      const rows = [...body.querySelectorAll<HTMLElement>('.ml-variation-row')];
      close(rows.map(r => r.dataset.picked || null));
    });
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(allSkipped()); });

    dialog.append(title, sub, body, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
  });
}

export interface BulkImportUI {
  /** The button that reveals the panel. */
  toggle: HTMLButtonElement;
  /** The textarea, file picker and report, hidden until the toggle is used. */
  panel:  HTMLElement;
}

/**
 * Build the bulk-import controls.
 *
 * `getVocab` rather than a plain array because vocabulary loads asynchronously
 * and the panel is built before it arrives; reading it at click time is what
 * makes an import typed during loading still work.
 */
export function createBulkImport(
  ctx: ListsCtx,
  getVocab: () => VocabEntry[],
  onAdded: () => void,
): BulkImportUI {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ml-bulk-toggle';
  toggle.textContent = '⇪ Bulk import';
  toggle.title = 'Add many words at once from a pasted list or CSV file';

  const panel = document.createElement('div');
  panel.className = 'ml-bulk-panel';
  panel.hidden = true;

  const area = document.createElement('textarea');
  area.className = 'ml-bulk-input';
  area.rows = 4;
  area.placeholder = 'hablar, comer, casa\nperro\nlibro…';

  const row = document.createElement('div');
  row.className = 'ml-bulk-row';

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.csv,.txt,text/csv,text/plain';
  file.className = 'ml-bulk-file';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ml-bulk-add';
  addBtn.textContent = 'Add to list';

  const report = document.createElement('div');
  report.className = 'ml-bulk-report';

  row.append(file, addBtn);
  panel.append(area, row, report);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) area.focus();
  });

  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    chosen.text().then(text => {
      area.value = area.value ? `${area.value}\n${text}` : text;
    }).catch(() => {
      report.textContent = 'Could not read that file.';
    });
  });

  addBtn.addEventListener('click', () => {
    const tokens = parseBulk(area.value);
    if (tokens.length === 0) {
      report.textContent = 'Nothing to import — paste some words first.';
      return;
    }

    const vocab = getVocab();

    // Keyed on the accent-stripped form, so "como" finds both *como* and
    // *cómo*. Several entries can share a key — that's the ambiguity we ask
    // about rather than silently picking one.
    const byWord = new Map<string, VocabEntry[]>();
    for (const entry of vocab) {
      const key = norm(entry.word);
      const bucket = byWord.get(key);
      if (bucket) bucket.push(entry);
      else byWord.set(key, [entry]);
    }

    const existing = new Set(getList(ctx.lang, ctx.selectedList).map(w => w.toLowerCase()));
    const added: string[] = [];
    const already: string[] = [];
    const unmatched: string[] = [];
    const ambiguous: Ambiguity[] = [];

    function take(word: string): void {
      // Reachable from the ambiguity dialog, not just an exact match below —
      // a token like "como" can resolve to a word ("cómo") that's already in
      // the list. Reported as already-listed rather than silently doing
      // nothing, matching the exact-match path just below.
      if (existing.has(word.toLowerCase())) { already.push(word); return; }
      addToList(ctx.lang, ctx.selectedList, word);
      existing.add(word.toLowerCase());
      added.push(word);
    }

    for (const token of tokens) {
      const matches = byWord.get(norm(token)) ?? [];

      if (matches.length > 1) {
        const exact = matches.find(m => m.word.toLowerCase() === token.toLowerCase());
        ambiguous.push({ token, options: matches, preferred: exact?.word });
        continue;
      }

      if (matches.length === 1) {
        const only = matches[0].word;
        if (existing.has(only.toLowerCase())) already.push(token);
        else take(only);
        continue;
      }

      const options = findVariations(token, vocab);
      if (options.length > 0) ambiguous.push({ token, options });
      else                    unmatched.push(token);
    }

    function finish(): void {
      const parts = [`Added ${added.length}`];
      if (already.length)   parts.push(`${already.length} already listed`);
      if (unmatched.length) {
        const preview = unmatched.slice(0, 8).join(', ');
        parts.push(`${unmatched.length} not found (${preview}${unmatched.length > 8 ? '…' : ''})`);
      }
      report.textContent = parts.join(' · ');

      if (added.length > 0) {
        area.value = '';
        onAdded();
      }
    }

    if (ambiguous.length > 0) {
      void askVariations(ambiguous).then(picks => {
        // picks[i] answers ambiguous[i] specifically — positional, not a
        // flat "which words got picked anywhere" set (see askVariations'
        // own doc comment for why that used to under-report skipped rows
        // whenever two tokens shared an overlapping candidate list).
        picks.forEach((word, i) => {
          if (word) take(word);
          else unmatched.push(ambiguous[i].token);
        });
        finish();
      });
      return;
    }

    finish();
  });

  return { toggle, panel };
}
