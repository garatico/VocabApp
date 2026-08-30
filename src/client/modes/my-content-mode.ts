/**
 * my-content-mode.ts — "My Content" tab: a lite, client-only admin panel.
 *
 * Lets a learner add their own vocabulary words, trivia questions and
 * picture-quiz pictures, all stored in this browser's localStorage via
 * data/user-content.ts — never written to the real SQLite database, and
 * never sent anywhere. This is deliberately separate from the real admin
 * panel (admin.html / src/client/admin/*, src/server/routes/admin*), which
 * is dev+localhost+auth gated and writes the actual database; nothing here
 * touches that code path.
 *
 * Every add form is multi-language: one row per app language (LANGUAGES),
 * so adding "cat" can fill in gato/chat/gatto/Katze/kat/猫 in one pass rather
 * than repeating the whole form once per language — and each row is always
 * labeled by language, so it's never ambiguous which language an entry (new
 * or already-added) belongs to. Only rows actually filled in produce an
 * entry; the rest are just left blank.
 *
 * Rebuilt fresh on every visit to the tab (see app.ts's onActivate.myContent),
 * the same way History and My Lists are — cheap, and it means an edit made
 * and then navigated away from is never shown stale.
 */

import {
  getUserWords, addUserWord, removeUserWord, type UserWord,
  getUserTriviaQuestions, addUserTriviaQuestion, removeUserTriviaQuestion,
  getPictureOverrides, setPictureOverride, removePictureOverride,
  downloadUserContent, applyUserContentImport,
} from '../data/user-content.ts';
import type { TriviaQuestion, TriviaCategory, TriviaDifficulty, ReadingDifficulty, ReadingLength, AnswerType } from '../data/trivia-questions.ts';
import { LANGUAGES, type LanguageInfo } from '../data/languages.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = el('label', 'mc-field');
  wrap.appendChild(el('span', 'mc-field-label', labelText));
  wrap.appendChild(input);
  return wrap;
}

function textInput(placeholder = '', value = ''): HTMLInputElement {
  const i = el('input', 'mc-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.value = value;
  return i;
}

function selectInput(options: readonly string[], value?: string): HTMLSelectElement {
  const s = el('select', 'mc-input');
  for (const o of options) {
    const opt = el('option', undefined, o);
    opt.value = o;
    s.appendChild(opt);
  }
  if (value) s.value = value;
  return s;
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}


/**
 * One row per app language, each labeled and holding whatever per-language
 * input(s) `makeRow` builds — the shared shape every "add" form's language
 * section uses. `currentLang` gets a highlighted row, since that's the
 * language the learner is most likely filling in first. `makeRow` returns
 * both the element to place in the row (a single input, or a wrapper `<div>`
 * around several) and whatever value the caller needs back to read the
 * row's input(s) on submit.
 */
function languageRows<T>(
  currentLang: string,
  makeRow: (info: LanguageInfo) => { el: HTMLElement; value: T },
): { rows: HTMLElement; values: Map<string, T> } {
  const rows = el('div', 'mc-lang-rows');
  const values = new Map<string, T>();
  for (const info of LANGUAGES) {
    const row = el('div', 'mc-lang-row');
    if (info.name === currentLang) row.classList.add('mc-lang-row--current');
    row.appendChild(el('span', 'mc-lang-row-label', info.label));
    const { el: inputEl, value } = makeRow(info);
    row.appendChild(inputEl);
    values.set(info.name, value);
    rows.appendChild(row);
  }
  return { rows, values };
}

export function renderMyContent(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  const wrap = el('div', 'mc-wrap');

  const header = el('div', 'mc-header');
  header.appendChild(el('h2', 'mc-title', 'My Content'));
  header.appendChild(el('p', 'mc-desc',
    'Add your own words, trivia questions and pictures — in one language or several at once. Everything here lives only in this browser — it is never uploaded, and does not touch the shared word list or trivia bank other learners see.'));

  const backupRow = el('div', 'mc-backup-row');
  const exportBtn = el('button', 'mc-btn mc-btn--secondary', 'Download my content');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => downloadUserContent());
  const importBtn = el('button', 'mc-btn mc-btn--secondary', 'Load a file…');
  importBtn.type = 'button';
  const importInput = el('input', undefined) as HTMLInputElement;
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  const importStatus = el('span', 'mc-import-status');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importStatus.textContent = applyUserContentImport(String(reader.result));
        importStatus.classList.remove('mc-import-status--error');
        renderMyContent(container, lang);
      } catch (err) {
        importStatus.textContent = err instanceof Error ? err.message : 'Could not read that file.';
        importStatus.classList.add('mc-import-status--error');
      }
    };
    reader.readAsText(file);
  });
  backupRow.append(exportBtn, importBtn, importInput, importStatus);
  header.appendChild(backupRow);
  wrap.appendChild(header);

  wrap.appendChild(buildWordsSection(lang, () => renderMyContent(container, lang)));
  wrap.appendChild(buildTriviaSection(lang, () => renderMyContent(container, lang)));
  wrap.appendChild(buildPicturesSection(lang, () => renderMyContent(container, lang)));

  container.appendChild(wrap);
}

// ── Words ────────────────────────────────────────────────────────────────────

function buildWordsSection(currentLang: string, refresh: () => void): HTMLElement {
  const section = el('section', 'mc-section');
  section.appendChild(el('h3', 'mc-section-title', 'Words'));
  section.appendChild(el('p', 'mc-section-desc',
    'Shows up at the top of Table, Picture Quiz and Conjugation-eligible word lists, right alongside the real vocabulary. Fill in one language, or several at once — e.g. gato for Spanish and chat for French, both meaning "cat".'));

  const form = el('div', 'mc-form');
  const transI = textInput('e.g. cat');
  const posI = selectInput(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']);
  const domainsI = textInput('e.g. animals, home (comma-separated)');
  const notesI = textInput('optional notes');
  form.append(
    field('Translation (English)', transI), field('Part of speech', posI),
    field('Domains', domainsI), field('Notes', notesI),
  );
  section.appendChild(form);

  const { rows, values: wordInputs } = languageRows(currentLang, info => {
    const input = textInput(`Word in ${info.label}`);
    return { el: input, value: input };
  });
  section.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add word(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    if (!transI.value.trim()) return;
    let added = 0;
    for (const [langName, input] of wordInputs) {
      const word = input.value.trim();
      if (!word) continue;
      addUserWord(langName, {
        word, translation: transI.value.trim(),
        pos: posI.value || null, domains: csv(domainsI.value), notes: notesI.value.trim(),
      });
      added++;
    }
    if (added > 0) refresh();
  });
  section.appendChild(addBtn);

  const list = el('div', 'mc-list');
  const allEntries = LANGUAGES.flatMap(info => getUserWords(info.name).map(w => ({ info, w })));
  if (allEntries.length === 0) {
    list.appendChild(el('p', 'mc-empty', 'No words added yet.'));
  } else {
    allEntries.forEach(({ info, w }) => list.appendChild(buildWordRow(info, w, refresh)));
  }
  section.appendChild(list);
  return section;
}

function buildWordRow(info: LanguageInfo, w: UserWord, refresh: () => void): HTMLElement {
  const row = el('div', 'mc-row');
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${w.word} — ${w.translation}`));
  main.appendChild(title);
  const meta: string[] = [];
  if (w.pos) meta.push(w.pos);
  if (w.domains.length) meta.push(w.domains.join(', '));
  if (meta.length) main.appendChild(el('span', 'mc-row-meta', meta.join(' · ')));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', () => { removeUserWord(info.name, w.id); refresh(); });
  row.appendChild(delBtn);
  return row;
}

// ── Trivia questions ─────────────────────────────────────────────────────────

const CATEGORIES: readonly TriviaCategory[] = ['history', 'pop-culture'];
const DIFFICULTIES: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard'];
const READING_DIFFICULTIES: readonly ReadingDifficulty[] = ['easy', 'medium', 'hard'];
const READING_LENGTHS: readonly ReadingLength[] = ['short', 'long'];
const ANSWER_TYPES: readonly AnswerType[] = ['year', 'number', 'person', 'place', 'thing'];

interface TriviaLangInputs { question: HTMLInputElement; answers: HTMLInputElement }

function buildTriviaSection(currentLang: string, refresh: () => void): HTMLElement {
  const section = el('section', 'mc-section');
  section.appendChild(el('h3', 'mc-section-title', 'Trivia Questions'));
  section.appendChild(el('p', 'mc-section-desc',
    'Added to the Trivia tab\'s question bank, and included in its Difficulty/Reading/Domain filters. Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.'));

  const form = el('div', 'mc-form');
  const qEnI = textInput('Question in English');
  const ansEnI = textInput('Accepted English answers, comma-separated');
  const categoryI = selectInput(CATEGORIES);
  const difficultyI = selectInput(DIFFICULTIES);
  const readingDiffI = selectInput(READING_DIFFICULTIES);
  const readingLenI = selectInput(READING_LENGTHS);
  const answerTypeI = selectInput(ANSWER_TYPES);
  const domainsI = textInput('e.g. history, geography (comma-separated)');
  form.append(
    field('Question (English)', qEnI), field('Accepted answers (English)', ansEnI),
    field('Category', categoryI), field('Trivia difficulty', difficultyI),
    field('Reading difficulty', readingDiffI), field('Reading length', readingLenI),
    field('Answer type', answerTypeI), field('Domains', domainsI),
  );
  section.appendChild(form);

  const { rows, values: triviaInputs } = languageRows<TriviaLangInputs>(currentLang, info => {
    const question = textInput(`Question in ${info.label}`);
    const answers = textInput('Accepted answers, comma-separated');
    const wrap = el('div', 'mc-lang-row-inputs');
    wrap.append(question, answers);
    return { el: wrap, value: { question, answers } };
  });
  section.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add question(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    let added = 0;
    for (const [langName, { question, answers }] of triviaInputs) {
      const questionTarget = question.value.trim();
      const answersTarget = csv(answers.value);
      if (!questionTarget || answersTarget.length === 0) continue;
      const q: Omit<TriviaQuestion, 'id'> = {
        category: categoryI.value as TriviaCategory,
        difficulty: difficultyI.value as TriviaDifficulty,
        readingDifficulty: readingDiffI.value as ReadingDifficulty,
        readingLength: readingLenI.value as ReadingLength,
        answerType: answerTypeI.value as AnswerType,
        domains: csv(domainsI.value),
        questionTarget,
        questionEn: qEnI.value.trim() || questionTarget,
        answersTarget,
        answersEn: csv(ansEnI.value).length ? csv(ansEnI.value) : answersTarget,
      };
      addUserTriviaQuestion(langName, q);
      added++;
    }
    if (added > 0) refresh();
  });
  section.appendChild(addBtn);

  const list = el('div', 'mc-list');
  const allQuestions = LANGUAGES.flatMap(info => getUserTriviaQuestions(info.name).map(q => ({ info, q })));
  if (allQuestions.length === 0) {
    list.appendChild(el('p', 'mc-empty', 'No trivia questions added yet.'));
  } else {
    allQuestions.forEach(({ info, q }) => list.appendChild(buildTriviaRow(info, q, refresh)));
  }
  section.appendChild(list);
  return section;
}

function buildTriviaRow(info: LanguageInfo, q: TriviaQuestion, refresh: () => void): HTMLElement {
  const row = el('div', 'mc-row');
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.questionTarget}`));
  main.appendChild(title);
  main.appendChild(el('span', 'mc-row-meta',
    `${q.difficulty} · reading ${q.readingDifficulty}/${q.readingLength} · ${q.answerType} · answer: ${q.answersTarget[0]}`));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', () => { removeUserTriviaQuestion(info.name, q.id); refresh(); });
  row.appendChild(delBtn);
  return row;
}

// ── Pictures ─────────────────────────────────────────────────────────────────

function buildPicturesSection(currentLang: string, refresh: () => void): HTMLElement {
  const section = el('section', 'mc-section');
  section.appendChild(el('h3', 'mc-section-title', 'Pictures'));
  section.appendChild(el('p', 'mc-section-desc',
    'Overrides Picture Quiz\'s visual for a specific word — works for real vocabulary words and words you added above. One picture can cover several languages at once: give the exact word it\'s for in each language below (e.g. gato for Spanish, gatto for Italian). Paste an image URL, or pick a file from your device (kept as part of this entry, not uploaded anywhere).'));

  const form = el('div', 'mc-form');
  const urlI = textInput('Image URL (or pick a file below)');
  const fileI = el('input', 'mc-input') as HTMLInputElement;
  fileI.type = 'file';
  fileI.accept = 'image/*';
  fileI.addEventListener('change', () => {
    const file = fileI.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { urlI.value = String(reader.result); };
    reader.readAsDataURL(file);
  });
  form.append(field('Image URL', urlI), field('...or upload a file', fileI));
  section.appendChild(form);

  const { rows, values: wordInputs } = languageRows(currentLang, info => {
    const input = textInput(`Word in ${info.label}`);
    return { el: input, value: input };
  });
  section.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Set picture(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    if (!urlI.value.trim()) return;
    let added = 0;
    for (const [langName, input] of wordInputs) {
      const word = input.value.trim();
      if (!word) continue;
      setPictureOverride(langName, word, urlI.value.trim());
      added++;
    }
    if (added > 0) refresh();
  });
  section.appendChild(addBtn);

  const list = el('div', 'mc-list');
  const allOverrides = LANGUAGES.flatMap(info =>
    Object.entries(getPictureOverrides(info.name)).map(([word, url]) => ({ info, word, url })));
  if (allOverrides.length === 0) {
    list.appendChild(el('p', 'mc-empty', 'No picture overrides yet.'));
  } else {
    allOverrides.forEach(({ info, word, url }) => list.appendChild(buildPictureRow(info, word, url, refresh)));
  }
  section.appendChild(list);
  return section;
}

function buildPictureRow(info: LanguageInfo, word: string, url: string, refresh: () => void): HTMLElement {
  const row = el('div', 'mc-row');
  const thumb = el('img', 'mc-thumb') as HTMLImageElement;
  thumb.src = url;
  thumb.alt = word;
  row.appendChild(thumb);
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${word}`));
  main.appendChild(title);
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', () => { removePictureOverride(info.name, word); refresh(); });
  row.appendChild(delBtn);
  return row;
}
