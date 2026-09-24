/**
 * admin-editor.ts
 *
 * Word Editor tab. The editor itself — filter bar, paged word list, edit form
 * — is the shared component in src/client/ui/word-editor/, which My Content
 * uses too. This file is the Admin panel's side of it: an adapter that reads
 * and writes the master vocabulary through the admin data client, plus the
 * Word Editor / Table View toggle and the page-size setting.
 */

import { showStatus } from './admin-api.js';
import { getAdminDataClient } from './admin-data-client.js';
import { logger } from '../utils/logger.js';
import { langFlagImg } from './admin-languages.js';
import { readString, writeString } from '../utils/storage.ts';
import { createWordEditor } from '../ui/word-editor/word-editor.ts';
import { debounce } from '../ui/word-editor/util.ts';
import type { WordData, WordEditorAdapter, WordPage } from '../ui/word-editor/types.ts';

// The admin data client speaks the server's Word type; the editor speaks
// WordData. They describe the same record (that is what the old editor
// read and wrote), so this is a cast, not a conversion.
const adapter: WordEditorAdapter = {
  getMeta: () => getAdminDataClient().getMeta(),
  fetchPage: async query => (await getAdminDataClient().getVocabPage(query)) as unknown as WordPage,
  createWord: async (key, lang, data) =>
    (await getAdminDataClient().createWord(key, lang, data as never)).word as unknown as WordData,
  updateWord: async (key, lang, data) =>
    (await getAdminDataClient().updateWord(key, lang, data as never)).word as unknown as WordData,
  notify: showStatus,
};

// Word Editor / Table View toggle — one row-at-a-time editor and one
// spreadsheet-style bulk grid over the same words, shown and hidden by
// admin.ts. One copy lives in each sub-view's own filter bar (this one and
// Table View's); admin.ts keeps their active state in sync.
const viewToggle = document.createElement('div');
viewToggle.className = 'sort-order-toggle words-view-toggle';
viewToggle.setAttribute('data-words-view-toggle', '');
viewToggle.innerHTML = `
  <button type="button" class="sort-order-btn active" data-view="editor">✏️ Word Editor</button>
  <button type="button" class="sort-order-btn" data-view="table">▦ Table View</button>
`;

const editor = createWordEditor({ adapter, langFlag: lang => langFlagImg(lang), filterBarExtra: viewToggle });

// Mounted at import time, not inside initEditor(): admin.ts looks up the
// view toggle above the moment it loads, and that has to already exist.
const mount = document.getElementById('wordEditorMount');
if (mount) editor.mount(mount);

// ── Meta: real POS/domain/language values from the database ─────────────────

export async function loadMeta(): Promise<void> {
  try {
    editor.applyMeta(await adapter.getMeta());
  } catch (err) {
    logger.warn('Could not load meta options:', err instanceof Error ? err.message : String(err));
  }
}

/** Whether the open word (or an in-progress "+ New") has unsaved edits —
 *  admin.ts reads this before letting the Word Editor / Table View toggle
 *  switch away. */
export function isFormDirty(): boolean {
  return editor.isDirty();
}

/** admin.ts's discard half of "save or discard before switching". */
export function discardFormChanges(): void {
  editor.discard();
}

// ── Init ─────────────────────────────────────────────────────────────────────

const WORD_PAGE_SIZE_KEY = 'admin_word_list_page_size';
const DEFAULT_WORD_LIST_PAGE_SIZE = 50;

export function initEditor(): void {
  // Settings tab's "Word Editor Page Size" — restore whatever was picked last
  // session, same convenience Table View's own page size gets.
  const settingsWordPageSize = document.getElementById('settingsWordPageSize') as HTMLInputElement;
  const saved = parseInt(readString(WORD_PAGE_SIZE_KEY) ?? '', 10);
  const initial = Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_WORD_LIST_PAGE_SIZE;
  settingsWordPageSize.value = String(initial);
  editor.setPageSize(initial);

  const onPageSizeChange = debounce(() => {
    const n = parseInt(settingsWordPageSize.value, 10);
    const size = Number.isFinite(n) && n > 0 ? Math.min(n, 200) : DEFAULT_WORD_LIST_PAGE_SIZE;
    writeString(WORD_PAGE_SIZE_KEY, String(size));
    editor.setPageSize(size);
  }, 400);
  settingsWordPageSize.addEventListener('input', onPageSizeChange);
}
