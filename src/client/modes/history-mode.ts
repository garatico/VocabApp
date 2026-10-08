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

import { enhanceLanguageSelect } from '../ui/language-dropdown.ts';
import { LANGUAGES } from '../data/languages.ts';
import {
  getSessions, troubleWords, missCount, wordsPerMinute,
  type QuizMode, type SessionRecord,
} from '../utils/session-history.ts';
import { srsDueWords } from '../utils/srs.ts';
import { Settings } from '../settings.ts';
import { renderProgress } from './history-progress.ts';
import { studyWords, REVIEW_LIST_NAME } from '../utils/review-due.ts';
import { cachedVocabMap, fetchVocab } from './my-lists/vocab-cache.ts';
import {
  createList, addToList, removeFromList, getList,
  saveListFilterState, refreshFilterSelect,
} from '../utils/word-lists.ts';
import type { FilterScope } from '../filters/filter-scope.ts';
import { readString } from '../utils/storage.ts';
import { percent } from '../ui/quiz-summary.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';
import type { SessionDirection } from '../utils/session-history.ts';
import '../styles-lazy/history.css';

const MODE_LABELS: Record<QuizMode, string> = {
  table:        'Table',
  recall:       'Recall',
  doubleRecall: 'Double Recall',
  picture:      'Picture Quiz',
  trivia:       'Trivia',
  guessBlank:   'Guess the Blank',
  sentenceScramble: 'Sentence Scramble',
  // word-choice-mode.ts is parked (not wired to any tab) — this label only
  // matters if a past dev build ever recorded a session under it.
  wordChoice:   'Word Choice',
  conjugation:  'Conjugation',
};
const MODE_ORDER: QuizMode[] = ['table', 'recall', 'doubleRecall', 'picture', 'trivia', 'guessBlank', 'sentenceScramble', 'conjugation'];

// Table mode's own direction toggle labels — see #directionToggle in index.html.
const DIRECTION_LABELS: Record<SessionDirection, string> = {
  'target-en': 'Word → Meaning',
  'en-target': 'Meaning → Word',
  mixed:       'Mixed',
};

/** The list "Study these" collects trouble words into — see studyTroubleWords(). */
const TROUBLE_LIST_NAME = 'Words I Keep Missing';


// ── Views as tabs ─────────────────────────────────────────────────────────
//
// Progress / Due for Review / Words to Review / Recent Sessions are tabs in the top bar (#historyBar), one
// view at a time. They used to be four collapsible panels down one page, each remembered in
// vq_history_collapsed (no longer used — see storage-keys.ts). The tab chosen lasts for the session.

type HistoryView = 'progress' | 'review' | 'trouble' | 'sessions';
const HISTORY_VIEWS: { key: HistoryView; title: string }[] = [
  { key: 'progress', title: 'Progress' },
  { key: 'review',   title: 'Due for Review' },
  { key: 'trouble',  title: 'Words to Review' },
  { key: 'sessions', title: 'Recent Sessions' },
];
let activeHistoryView: HistoryView = 'progress';

/** A panel's own header: its title and any actions a render adds (e.g. "Study these N"). */
function buildHistoryPanelHead(_key: string, title: string, _body: HTMLElement): HTMLElement {
  const head = document.createElement('div');
  head.className = 'history-panel-head';
  const titleEl = document.createElement('h2');
  titleEl.className = 'history-panel-title';
  titleEl.textContent = title;
  head.append(titleEl);
  return head;
}

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
  langSel.id = 'historyLangSelect';
  langSel.setAttribute('aria-label', 'Language');
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
  enhanceLanguageSelect(langSel);   // flags and colours, as on every other tab; the select stays the source of truth

  const progressPanel = document.createElement('div');
  progressPanel.className = 'history-panel history-progress';
  const reviewPanel = document.createElement('div');
  reviewPanel.className = 'history-panel history-review';
  const troublePanel = document.createElement('div');
  troublePanel.className = 'history-panel history-trouble';
  const sessionsPanel = document.createElement('div');
  sessionsPanel.className = 'history-panel history-sessions';

  const panelFor: Record<HistoryView, HTMLElement> = {
    progress: progressPanel, review: reviewPanel, trouble: troublePanel, sessions: sessionsPanel,
  };
  const tabs = document.createElement('div');
  tabs.className = 'history-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'History');
  const tabButtons = HISTORY_VIEWS.map(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'history-tab-btn';
    b.id = `historyTab-${v.key}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `historyView-${v.key}`);
    b.textContent = v.title;
    b.addEventListener('click', () => showView(v.key));
    const panel = panelFor[v.key];
    panel.id = `historyView-${v.key}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    return b;
  });
  tabs.append(...tabButtons);
  // Arrow keys move between tabs, as on the main tab bar.
  tabs.addEventListener('keydown', e => {
    const i = tabButtons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const next = tabButtons[(i + (e.key === 'ArrowRight' ? 1 : tabButtons.length - 1)) % tabButtons.length];
    next.focus(); next.click();
  });
  function showView(key: HistoryView): void {
    // Due for Review is a Settings switch (Session History); while it is off there is no such view.
    const dueOn = Settings.getDueEnabled();
    if (key === 'review' && !dueOn) key = 'progress';
    activeHistoryView = key;
    HISTORY_VIEWS.forEach((v, i) => {
      const on = v.key === key;
      tabButtons[i].hidden = v.key === 'review' && !dueOn;
      tabButtons[i].classList.toggle('active', on);
      tabButtons[i].setAttribute('aria-selected', String(on));
      tabButtons[i].tabIndex = on ? 0 : -1;
      panelFor[v.key].hidden = !on;
    });
  }

  // Language and tabs go in the top bar, like My Lists' and My Content's; a page without the bar keeps them here.
  const bar = document.getElementById('historyBar');
  if (bar) bar.replaceChildren(langRow, tabs);
  else wrap.append(langRow, tabs);
  wrap.append(progressPanel, reviewPanel, troublePanel, sessionsPanel);
  container.appendChild(wrap);
  showView(activeHistoryView);

  function render(): void {
    renderProgressPanel();
    renderDueWords();
    renderTroubleWords();
    renderSessionList();
    showView(activeHistoryView);
  }

  function renderProgressPanel(): void {
    progressPanel.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'history-panel-body';
    progressPanel.append(buildHistoryPanelHead('progress', 'Progress', body), body);
    renderProgress(body, currentLang);
  }

  // ── Due for review (spaced repetition) ───────────────────────────────────

  function renderDueWords(): void {
    reviewPanel.innerHTML = '';
    if (!Settings.getDueEnabled()) return;   // its tab is hidden too (showView)

    const body = document.createElement('div');
    body.className = 'history-panel-body';
    const head = buildHistoryPanelHead('review', 'Due for Review', body);
    reviewPanel.append(head, body);

    const words = srsDueWords(currentLang);

    if (words.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Nothing due right now — words land here on their own '
        + 'review schedule as you quiz them.';
      body.appendChild(empty);
      return;
    }

    const studyBtn = document.createElement('button');
    studyBtn.type = 'button';
    studyBtn.className = 'history-study-btn';
    studyBtn.textContent = `▶ Study these ${words.length}`;
    studyBtn.title = `Add ${words.length} word${words.length === 1 ? '' : 's'} to a `
      + `"${REVIEW_LIST_NAME}" list and start a focused Table quiz on them`;
    studyBtn.addEventListener('click', e => { e.stopPropagation(); studyWords(currentLang, words); });
    head.appendChild(studyBtn);

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

      li.append(wordSpan, transSpan);
      list.appendChild(li);
    });
    body.appendChild(list);

    if (!vocabMap) {
      const fetchedFor = currentLang;
      fetchVocab(fetchedFor).then(() => {
        if (currentLang === fetchedFor) renderDueWords();
      }).catch(() => {});
    }
  }

  // ── Words to review ───────────────────────────────────────────────────────

  function renderTroubleWords(): void {
    troublePanel.innerHTML = '';

    const body = document.createElement('div');
    body.className = 'history-panel-body';
    const head = buildHistoryPanelHead('trouble', 'Words to Review', body);
    troublePanel.append(head, body);

    const words = troubleWords(currentLang);

    if (words.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Nothing here yet — a word shows up once you’ve '
        + 'missed it a couple of times across quizzes.';
      body.appendChild(empty);
      return;
    }

    const studyBtn = document.createElement('button');
    studyBtn.type = 'button';
    studyBtn.className = 'history-study-btn';
    studyBtn.textContent = `▶ Study these ${words.length}`;
    studyBtn.title = `Add ${words.length} word${words.length === 1 ? '' : 's'} to a `
      + `"${TROUBLE_LIST_NAME}" list and start a focused Table quiz on them`;
    studyBtn.addEventListener('click', e => { e.stopPropagation(); studyTroubleWords(currentLang, words); });
    head.appendChild(studyBtn);

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
    body.appendChild(list);

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
    const usableModes = new Set(['table', 'picture']);
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

    const body = document.createElement('div');
    body.className = 'history-panel-body';
    const head = buildHistoryPanelHead('sessions', 'Recent Sessions', body);
    sessionsPanel.append(head, body);

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
    body.appendChild(filterRow);

    const shown = (modeFilter ? allSessions.filter(s => s.mode === modeFilter) : allSessions)
      .slice()
      .reverse(); // newest first

    if (shown.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No sessions recorded yet — finish a quiz in this language and it will show up here.';
      body.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'history-session-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>'
      + '<th>Date</th><th>Mode</th><th>Language</th><th>Score</th><th>Accuracy</th>'
      + '<th title="Hinted, then revealed with the ?? button">Hint→Revealed</th>'
      + '<th title="Hinted, then never resolved until the whole quiz\'s Give Up">Hint→Missed</th>'
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
    body.appendChild(scroller);
  }

  function buildSessionRow(s: SessionRecord): HTMLTableRowElement {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.className = 'history-session-date';
    // No year — history is capped at Settings.getMaxSessionsKept() (100 by
    // default), recent enough that the year is never the useful part, and
    // dropping it earns back real width in a column that's already tight on
    // a phone screen.
    dateTd.textContent = new Date(s.at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    const modeTd = document.createElement('td');
    modeTd.className = 'history-session-mode';
    const modeLabel = document.createElement('span');
    modeLabel.textContent = MODE_LABELS[s.mode] ?? s.mode;
    modeTd.appendChild(modeLabel);
    // Only Table mode's direction is a per-session choice — see
    // SessionDirection's own comment. Older records saved before this field
    // existed just have nothing to show here.
    if (s.direction) {
      const dirEl = document.createElement('span');
      dirEl.className = 'history-session-direction';
      dirEl.textContent = DIRECTION_LABELS[s.direction] ?? s.direction;
      modeTd.appendChild(dirEl);
    }

    const langTd = document.createElement('td');
    // langs/lang are absent on sessions saved before this field existed;
    // an empty array falls back to buildLangBadge's neutral placeholder
    // rather than crashing on a record with no language info at all.
    langTd.appendChild(buildLangBadge(s.langs ?? (s.lang ? [s.lang] : [])));

    const scoreTd = document.createElement('td');
    scoreTd.className = 'history-session-mono';
    scoreTd.textContent = `${s.correct} / ${s.total}`;

    const pctTd = document.createElement('td');
    pctTd.className = 'history-session-mono';
    pctTd.textContent = `${percent(s.correct, s.total)}%`;

    // Table mode only — undefined for every other mode and for a session
    // recorded before this field existed, both shown the same way as
    // "nothing to report" rather than a misleading 0.
    const hintedRevealedTd = document.createElement('td');
    hintedRevealedTd.className = 'history-session-mono';
    hintedRevealedTd.textContent = s.hintedRevealed != null ? String(s.hintedRevealed) : '—';

    const hintedMissedTd = document.createElement('td');
    hintedMissedTd.className = 'history-session-mono';
    hintedMissedTd.textContent = s.hintedMissed != null ? String(s.hintedMissed) : '—';

    const secTd = document.createElement('td');
    secTd.className = 'history-session-mono';
    const mins = Math.floor(s.seconds / 60);
    const secs = s.seconds % 60;
    secTd.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const paceTd = document.createElement('td');
    paceTd.className = 'history-session-mono';
    const rate = wordsPerMinute(s.correct, s.seconds);
    paceTd.textContent = rate > 0 ? `${rate}/min` : '—';

    tr.append(dateTd, modeTd, langTd, scoreTd, pctTd, hintedRevealedTd, hintedMissedTd, secTd, paceTd);
    return tr;
  }

  render();
}
