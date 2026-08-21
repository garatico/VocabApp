/**
 * history-mode.ts — quiz history and "what to study next".
 *
 * A pure viewing surface for data session-history.ts already collects but
 * nothing ever rendered: past sessions (getSessions) and the words a
 * language keeps getting wrong (troubleWords). Two panels, own language
 * selector — mirrors My Lists sidebar's language dropdown rather than the
 * shared #langSelect, since reviewing history is decoupled from whatever
 * you're about to quiz next.
 *
 * Re-rendered fresh every time the tab is activated (see app.ts's
 * onActivate.history) rather than built once like My Lists — a session
 * finished elsewhere should show up the next time you look, not only after
 * a page reload.
 */

import { LANGUAGES } from '../data/languages.ts';
import {
  getSessions, troubleWords, missCount, wordsPerMinute,
  type QuizMode, type SessionRecord,
} from '../utils/session-history.ts';
import { cachedVocabMap, fetchVocab } from './my-lists/vocab-cache.ts';
import {
  createList, addToList, removeFromList, getList,
  saveListFilterState, refreshFilterSelect,
} from '../utils/word-lists.ts';
import type { FilterScope } from '../filters/filter-scope.ts';
import { readString } from '../utils/storage.ts';
import { percent } from '../ui/quiz-summary.ts';

const MODE_LABELS: Record<QuizMode, string> = {
  table:       'Table',
  recall:      'Recall',
  picture:     'Picture Quiz',
  single:      'Single Word',
  conjugation: 'Conjugation',
};
const MODE_ORDER: QuizMode[] = ['table', 'recall', 'picture', 'single', 'conjugation'];

/** The list "Study these" collects trouble words into — see studyTroubleWords(). */
const TROUBLE_LIST_NAME = 'Words I Keep Missing';

export function renderHistory(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  let currentLang = lang;
  let modeFilter: QuizMode | null = null;

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  // ── Language selector ────────────────────────────────────────────────────
  const langRow = document.createElement('div');
  langRow.className = 'history-lang-row';
  const langLabel = document.createElement('span');
  langLabel.className = 'ui-label';
  langLabel.textContent = 'Language';
  const langSel = document.createElement('select');
  langSel.className = 'history-lang-select';
  LANGUAGES.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.name; opt.textContent = l.label; opt.selected = l.name === currentLang;
    langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    currentLang = langSel.value;
    render();
  });
  langRow.append(langLabel, langSel);

  const troublePanel = document.createElement('div');
  troublePanel.className = 'history-panel history-trouble';
  const sessionsPanel = document.createElement('div');
  sessionsPanel.className = 'history-panel history-sessions';

  wrap.append(langRow, troublePanel, sessionsPanel);
  container.appendChild(wrap);

  function render(): void {
    renderTroubleWords();
    renderSessionList();
  }

  // ── Words to review ───────────────────────────────────────────────────────

  function renderTroubleWords(): void {
    troublePanel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'history-panel-head';
    const title = document.createElement('h3');
    title.className = 'history-panel-title';
    title.textContent = 'Words to Review';
    head.appendChild(title);

    const words = troubleWords(currentLang);

    if (words.length === 0) {
      troublePanel.appendChild(head);
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Nothing here yet — a word shows up once you’ve '
        + 'missed it a couple of times across quizzes.';
      troublePanel.appendChild(empty);
      return;
    }

    const studyBtn = document.createElement('button');
    studyBtn.type = 'button';
    studyBtn.className = 'history-study-btn';
    studyBtn.textContent = `▶ Study these ${words.length}`;
    studyBtn.title = `Add ${words.length} word${words.length === 1 ? '' : 's'} to a `
      + `"${TROUBLE_LIST_NAME}" list and start a focused Table quiz on them`;
    studyBtn.addEventListener('click', () => studyTroubleWords(currentLang, words));
    head.appendChild(studyBtn);
    troublePanel.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'history-trouble-list';
    const vocabMap = cachedVocabMap(currentLang);

    words.forEach(word => {
      const entry = vocabMap?.get(word);
      const li = document.createElement('li');
      li.className = 'history-trouble-item';

      const wordSpan = document.createElement('span');
      wordSpan.className = 'history-trouble-word';
      wordSpan.textContent = word;

      const transSpan = document.createElement('span');
      transSpan.className = 'history-trouble-trans';
      transSpan.textContent = entry?.translation ?? '';

      const missSpan = document.createElement('span');
      missSpan.className = 'history-trouble-miss';
      const n = missCount(currentLang, word);
      missSpan.textContent = `missed ${n}×`;

      li.append(wordSpan, transSpan, missSpan);
      list.appendChild(li);
    });
    troublePanel.appendChild(list);

    // Vocab loads asynchronously; if it wasn't ready yet, fill in
    // translations once it lands — but only if the language selector hasn't
    // moved on to something else in the meantime.
    if (!vocabMap) {
      const fetchedFor = currentLang;
      fetchVocab(fetchedFor).then(() => {
        if (currentLang === fetchedFor) renderTroubleWords();
      }).catch(() => {});
    }
  }

  /**
   * Fold the current trouble words into a real list — reusing the exact
   * mechanism My Lists already provides rather than inventing a second,
   * ad-hoc way to focus a quiz on an arbitrary set of words — then launch a
   * focused Table quiz on it, mirroring my-lists/panel.ts's own Quiz button.
   */
  function studyTroubleWords(forLang: string, words: string[]): void {
    createList(forLang, TROUBLE_LIST_NAME); // no-op if it already exists

    // Refresh contents rather than only adding, so a word that's no longer a
    // problem doesn't linger in the list forever.
    const current = new Set(getList(forLang, TROUBLE_LIST_NAME));
    const wanted  = new Set(words);
    current.forEach(w => { if (!wanted.has(w)) removeFromList(forLang, TROUBLE_LIST_NAME, w); });
    words.forEach(w => { if (!current.has(w)) addToList(forLang, TROUBLE_LIST_NAME, w); });

    // Quizzing from here means leaving this tab — table mode is always a
    // valid target for the shared list filter, unlike whatever the user was
    // last in (which could be Conjugation, mylists, settings or history
    // itself, none of which the list filter applies to the same way).
    const savedMode  = readString('vq_mode');
    const usableModes = new Set(['table', 'recall', 'single', 'picture']);
    const targetMode = savedMode && usableModes.has(savedMode) ? savedMode : 'table';

    saveListFilterState(
      forLang,
      { active: true, mode: 'focus', selected: [TROUBLE_LIST_NAME] },
      targetMode as FilterScope,
    );
    refreshFilterSelect(forLang);
    document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
    (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
  }

  // ── Recent sessions ──────────────────────────────────────────────────────

  function renderSessionList(): void {
    sessionsPanel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'history-panel-head';
    const title = document.createElement('h3');
    title.className = 'history-panel-title';
    title.textContent = 'Recent sessions';
    head.appendChild(title);
    sessionsPanel.appendChild(head);

    const allSessions = getSessions(currentLang);

    const filterRow = document.createElement('div');
    filterRow.className = 'history-mode-filter';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'pos-chip' + (modeFilter === null ? ' active' : '');
    allChip.textContent = `All (${allSessions.length})`;
    allChip.addEventListener('click', () => { modeFilter = null; render(); });
    filterRow.appendChild(allChip);

    MODE_ORDER.forEach(mode => {
      const n = allSessions.filter(s => s.mode === mode).length;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (modeFilter === mode ? ' active' : '');
      chip.textContent = `${MODE_LABELS[mode]} (${n})`;
      chip.addEventListener('click', () => { modeFilter = mode; render(); });
      filterRow.appendChild(chip);
    });
    sessionsPanel.appendChild(filterRow);

    const shown = (modeFilter ? allSessions.filter(s => s.mode === modeFilter) : allSessions)
      .slice()
      .reverse(); // newest first

    if (shown.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No sessions recorded yet — finish a quiz in this language and it will show up here.';
      sessionsPanel.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'history-session-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>'
      + '<th>Date</th><th>Mode</th><th>Score</th><th>Accuracy</th>'
      + '<th>Time</th><th>Pace</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    shown.forEach(s => tbody.appendChild(buildSessionRow(s)));
    table.appendChild(tbody);

    // Scrolls horizontally on its own rather than being silently clipped by
    // #historyArea's overflow:hidden — a narrow phone can't fit six columns
    // at a readable size no matter how tight the padding gets.
    const scroller = document.createElement('div');
    scroller.className = 'history-table-scroll';
    scroller.appendChild(table);
    sessionsPanel.appendChild(scroller);
  }

  function buildSessionRow(s: SessionRecord): HTMLTableRowElement {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.className = 'history-session-date';
    // No year — history is capped at 30 sessions (HISTORY_KEEP), recent
    // enough that the year is never the useful part, and dropping it earns
    // back real width in a column that's already tight on a phone screen.
    dateTd.textContent = new Date(s.at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    const modeTd = document.createElement('td');
    modeTd.textContent = MODE_LABELS[s.mode] ?? s.mode;

    const scoreTd = document.createElement('td');
    scoreTd.className = 'history-session-mono';
    scoreTd.textContent = `${s.correct} / ${s.total}`;

    const pctTd = document.createElement('td');
    pctTd.className = 'history-session-mono';
    pctTd.textContent = `${percent(s.correct, s.total)}%`;

    const secTd = document.createElement('td');
    secTd.className = 'history-session-mono';
    const mins = Math.floor(s.seconds / 60);
    const secs = s.seconds % 60;
    secTd.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const paceTd = document.createElement('td');
    paceTd.className = 'history-session-mono';
    const rate = wordsPerMinute(s.correct, s.seconds);
    paceTd.textContent = rate > 0 ? `${rate}/min` : '—';

    tr.append(dateTd, modeTd, scoreTd, pctTd, secTd, paceTd);
    return tr;
  }

  render();
}
