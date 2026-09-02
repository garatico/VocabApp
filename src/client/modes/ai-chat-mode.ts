/**
 * ai-chat-mode.ts — local AI chat (dev + desktop only, see app.ts's chat-tab
 * gate and mode-tabs.css's `.chat-tab` media query).
 *
 * The UI lives here; what actually generates replies is behind the
 * ChatEngine seam below and lives in ./ai-chat/ — WebLLMEngine (real,
 * WebGPU-backed) when the browser supports it, MockEngine (no model, no
 * download) otherwise, so the tab still demos its own UI on a machine that
 * can't run a real model. Kept as a fixed menu of task presets rather than
 * a bare chatbox on purpose: a small model stays reliable when it's filling
 * in a template you wrote (explain this word, give example sentences) and
 * drifts in open-ended conversation.
 */

import { LANGUAGES } from '../data/languages.ts';
import { MockEngine } from './ai-chat/mock-engine.ts';
import { WebLLMEngine, hasWebGPU } from './ai-chat/webllm-engine.ts';
import { getSavedChats, saveChat, deleteChat, type SavedChat, type Rating } from './ai-chat/chat-history.ts';
import { exportEvalData } from './ai-chat/eval-contract.ts';
import { cachedVocabMap, fetchVocab } from './my-lists/vocab-cache.ts';
import type { VocabEntry } from './my-lists/types.ts';

// ── Engine seam ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface ChatEngine {
  status(): EngineStatus;
  /** Why status() is 'error', for display — null once/unless it ever is. */
  errorMessage(): string | null;
  load(onProgress: (pct: number, note: string) => void): Promise<void>;
  send(messages: ChatMessage[], onToken: (delta: string) => void): Promise<void>;
}

// ── Task presets ─────────────────────────────────────────────────────────────

interface TaskPreset {
  label:        string;
  systemPrompt: (lang: string) => string;
  placeholder:  string;
}

const TASK_PRESETS: Record<string, TaskPreset> = {
  explain: {
    label: 'Explain a word',
    systemPrompt: lang => `You are a concise ${lang} vocabulary tutor. Explain the word the `
      + 'user gives you: meaning, part of speech, and one nuance a learner would miss. Keep it short.',
    placeholder: 'Type a word to explain…',
  },
  examples: {
    label: 'Example sentences',
    systemPrompt: lang => `You are a ${lang} vocabulary tutor. Given a word, write 3 short example `
      + 'sentences in the target language, each followed by its English translation.',
    placeholder: 'Type a word for example sentences…',
  },
  quiz: {
    label: 'Quiz me',
    systemPrompt: lang => `You are a ${lang} vocabulary quizmaster. Ask the user one question at a `
      + 'time (translate a word, conjugate a verb, fill a blank), wait for their answer, then say '
      + 'correct/incorrect and ask the next one.',
    placeholder: 'Say "start" to begin…',
  },
  check: {
    label: 'Check a sentence',
    systemPrompt: lang => `You are a careful ${lang} grammar checker. The user will give you a `
      + `sentence in ${lang}. Do not assume it is correct — check spelling, accents, and word `
      + `choice. State clearly whether it is correct; if not, give the corrected sentence. Then `
      + 'give an English translation of the corrected sentence, written in actual English words, '
      + `not in ${lang}.`,
    placeholder: 'Paste a sentence to check…',
  },
  free: {
    label: 'Free chat',
    systemPrompt: lang => `You are a careful, honest ${lang} language-learning assistant. If the `
      + `user writes something in ${lang} with a mistake, point it out and give the correction — `
      + "don't agree it's correct when it isn't. When asked for an English translation, answer in "
      + `actual English, not another ${lang} sentence. Keep answers short and direct.`,
    placeholder: 'Ask anything…',
  },
};

/**
 * Presets that get grounded in the app's own dictionary — one word in, a
 * question about that specific word. `quiz` and `free` don't: a quiz
 * question isn't "look up this exact word", and grounding every free-chat
 * message on a word-shaped guess would misfire more often than it helps.
 */
const GROUNDED_PRESETS = new Set(['explain', 'examples']);

/**
 * Real dictionary data for `word`, formatted as reference text appended to
 * the message actually sent to the model — never shown in the chat bubble
 * itself (see groundedHistory()). Lets the model answer from this app's own
 * data instead of its parametric memory, which is exactly where a 1.5B
 * model's wrong-but-confident answers (see the "Qué dia est hoy" mistake)
 * come from: it has no data to be wrong *about* here.
 */
function groundingNote(entry: VocabEntry): string {
  const lines = [`Reference data for "${entry.word}" from this app's own dictionary — use this, don't guess:`];
  lines.push(`Translation: ${entry.translation || '(none on file)'}`);
  if (entry.pos) lines.push(`Part of speech: ${entry.pos}`);
  if (entry.glosses.length) lines.push(`Meaning notes: ${entry.glosses.join('; ')}`);
  if (entry.examples.length) lines.push(`Known example sentence(s): ${entry.examples.slice(0, 2).join(' | ')}`);
  return lines.join('\n');
}

/**
 * Returns `history` unchanged unless the current preset is grounded and its
 * last message's exact text matches a word this app already has data for —
 * in which case that message (only in the copy sent to the engine, not the
 * displayed one) gets the dictionary entry appended. A miss (typo, phrase
 * instead of a single word, word not in this language's dataset) just falls
 * back to the model's own knowledge, same as before this existed.
 */
async function groundedHistory(lang: string, preset: string, history: ChatMessage[]): Promise<ChatMessage[]> {
  if (!GROUNDED_PRESETS.has(preset)) return history;
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') return history;

  await fetchVocab(lang); // no-op once already cached for this language
  const map = cachedVocabMap(lang);
  const word = last.content.trim();
  const entry = map?.get(word) ?? map?.get(word.toLowerCase());
  if (!entry) return history;

  const grounded: ChatMessage = { ...last, content: `${last.content}\n\n${groundingNote(entry)}` };
  return [...history.slice(0, -1), grounded];
}

// ── Render ────────────────────────────────────────────────────────────────

// Picked once at module load, not per-render — navigator.gpu doesn't change
// mid-session, and re-picking on every tab visit would drop a model already
// loaded into WebLLMEngine's worker.
const usingRealEngine = hasWebGPU();
const engine: ChatEngine = usingRealEngine ? new WebLLMEngine() : new MockEngine();

export function renderAiChat(container: HTMLElement, lang = 'spanish'): void {
  container.innerHTML = '';

  let currentLang = lang;
  let currentPreset = 'explain';
  let messages: ChatMessage[] = [];
  /** Keyed the same way SavedChat.ratings is: by index into the
   *  system-excluded message list, i.e. `messages.length - 1` fewer than
   *  this array's own index once a system message exists at index 0 — see
   *  toStoredIndex() below, used everywhere a rating is read or written. */
  let ratings: Record<number, Rating> = {};

  /** `messages`' own index -> the index it will have in storage, where the
   *  system message (present once the conversation has actually started, at
   *  index 0) doesn't count. Ratings are only ever set on assistant turns,
   *  which never appear before a system message exists, so this is exact,
   *  not an approximation. */
  function toStoredIndex(liveIndex: number): number {
    return liveIndex - (messages[0]?.role === 'system' ? 1 : 0);
  }

  const wrap = document.createElement('div');
  wrap.className = 'chat-wrap';

  // ── Header: status + load button + language ─────────────────────────────
  const header = document.createElement('div');
  header.className = 'chat-header';

  const title = document.createElement('div');
  title.className = 'chat-title';
  const subtitle = usingRealEngine
    ? 'Runs entirely on this device — nothing you type leaves your computer.'
    : 'Demo mode — this browser has no WebGPU, so replies are canned, not from a real model.';
  title.innerHTML = `<strong>AI Chat</strong><span class="chat-subtitle">${subtitle}</span>`;

  const langSel = document.createElement('select');
  langSel.className = 'chat-lang-select';
  LANGUAGES.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.name; opt.textContent = l.label; opt.selected = l.name === currentLang;
    langSel.appendChild(opt);
  });
  // Same treatment switching a task preset already gets, and for the same
  // reason: the language is baked into the system prompt at the *start* of
  // a conversation (see send() below) and into every grounding lookup after
  // that — changing it mid-chat used to just flip `currentLang` in place,
  // leaving the system prompt (and the reply already in progress) talking
  // about the old language while groundedHistory() started looking words up
  // in the new one's dictionary instead. Archiving and starting fresh keeps
  // a conversation internally consistent with whichever language it claims
  // to be in, the same way switching presets already does.
  langSel.addEventListener('change', () => {
    if (langSel.value === currentLang) return;
    archiveCurrentChat();
    currentLang = langSel.value;
    renderMessages();
    if (!historyPanel.hidden) renderHistoryPanel();
  });

  const statusPill = document.createElement('span');
  statusPill.className = 'chat-status-pill';

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'chat-load-btn';

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.className = 'chat-history-btn';
  historyBtn.textContent = 'History';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'chat-clear-btn';
  clearBtn.textContent = 'Clear';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'chat-export-btn';
  exportBtn.textContent = 'Export eval data';
  exportBtn.title = 'Download every 👍/👎-rated reply as JSON — see eval-contract.ts';

  header.append(title, langSel, statusPill, loadBtn, historyBtn, exportBtn, clearBtn);

  // ── Task presets ──────────────────────────────────────────────────────
  const presetRow = document.createElement('div');
  presetRow.className = 'chat-preset-row';
  Object.entries(TASK_PRESETS).forEach(([key, preset]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip chat-preset-chip' + (key === currentPreset ? ' active' : '');
    chip.textContent = preset.label;
    chip.addEventListener('click', () => {
      if (key === currentPreset) return;
      archiveCurrentChat();
      currentPreset = key;
      messages = [];
      renderMessages();
      input.placeholder = preset.placeholder;
      presetRow.querySelectorAll('.chat-preset-chip').forEach(el => el.classList.remove('active'));
      chip.classList.add('active');
    });
    presetRow.appendChild(chip);
  });

  // ── History panel ─────────────────────────────────────────────────────
  const historyPanel = document.createElement('div');
  historyPanel.className = 'chat-history-panel';
  historyPanel.hidden = true;

  function renderHistoryPanel(): void {
    historyPanel.innerHTML = '';
    const saved = getSavedChats();
    if (saved.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-history-empty';
      empty.textContent = 'No saved conversations yet — Clear (or switching tasks) saves the current one here.';
      historyPanel.appendChild(empty);
      return;
    }
    saved.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'chat-history-item';

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'chat-history-item-info';
      const firstUserMsg = chat.messages.find(m => m.role === 'user')?.content ?? '';
      const preview = firstUserMsg.length > 60 ? firstUserMsg.slice(0, 60) + '…' : firstUserMsg;
      const when = new Date(chat.at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      // textContent, not innerHTML — preview comes from what the user typed
      // into a chat message, so it's untrusted the same way any saved text is.
      const meta = document.createElement('span');
      meta.className = 'chat-history-item-meta';
      meta.textContent = `${chat.presetLabel} · ${chat.lang} · ${when}`;
      const previewEl = document.createElement('span');
      previewEl.className = 'chat-history-item-preview';
      previewEl.textContent = preview || '(empty)';
      info.append(meta, previewEl);
      info.addEventListener('click', () => loadSavedChat(chat));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'chat-history-delete';
      delBtn.setAttribute('aria-label', 'Delete this conversation');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        deleteChat(chat.id);
        renderHistoryPanel();
      });

      item.append(info, delBtn);
      historyPanel.appendChild(item);
    });
  }

  historyBtn.addEventListener('click', () => {
    historyPanel.hidden = !historyPanel.hidden;
    if (!historyPanel.hidden) renderHistoryPanel();
  });

  function loadSavedChat(chat: SavedChat): void {
    archiveCurrentChat();
    currentLang = chat.lang;
    langSel.value = chat.lang;
    currentPreset = chat.presetKey in TASK_PRESETS ? chat.presetKey : 'free';
    input.placeholder = TASK_PRESETS[currentPreset].placeholder;
    presetRow.querySelectorAll<HTMLButtonElement>('.chat-preset-chip').forEach(el => {
      el.classList.toggle('active', el.textContent === TASK_PRESETS[currentPreset].label);
    });
    messages = [
      { role: 'system', content: TASK_PRESETS[currentPreset].systemPrompt(currentLang) },
      ...chat.messages,
    ];
    ratings = { ...(chat.ratings ?? {}) };
    renderMessages();
    historyPanel.hidden = true;
  }

  // ── Message list ──────────────────────────────────────────────────────
  const messageList = document.createElement('div');
  messageList.className = 'chat-messages';

  const emptyState = document.createElement('div');
  emptyState.className = 'chat-empty';
  emptyState.textContent = 'Load the model to start chatting.';

  let isGenerating = false;

  function renderMessages(): void {
    messageList.innerHTML = '';
    if (messages.length === 0) {
      messageList.appendChild(emptyState);
      return;
    }
    messages.forEach((m, i) => {
      if (m.role === 'system') return;
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-bubble--${m.role}`;
      const isLiveDraft = isGenerating && i === messages.length - 1 && m.role === 'assistant';
      if (isLiveDraft && m.content === '') {
        bubble.classList.add('chat-bubble--pending');
        bubble.innerHTML = '<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>';
      } else {
        if (isLiveDraft) bubble.classList.add('chat-bubble--generating');
        bubble.textContent = m.content;
      }
      messageList.appendChild(bubble);

      // Rating — only a finished assistant reply, never the user's own turn
      // or a still-streaming draft, since there's nothing to judge yet.
      if (m.role === 'assistant' && !isLiveDraft) {
        const storedIdx = toStoredIndex(i);
        const current = ratings[storedIdx];

        const rateRow = document.createElement('div');
        rateRow.className = 'chat-rate-row';
        (['good', 'bad'] as const).forEach(kind => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'chat-rate-btn' + (current === kind ? ' active' : '');
          btn.setAttribute('aria-label', kind === 'good' ? 'Good reply' : 'Bad reply');
          btn.textContent = kind === 'good' ? '👍' : '👎';
          btn.addEventListener('click', () => {
            // Click the active one again to clear it — a rating is a
            // judgment call, not a fact, so it should be as easy to retract
            // as to make.
            if (ratings[storedIdx] === kind) delete ratings[storedIdx];
            else ratings[storedIdx] = kind;
            renderMessages();
          });
          rateRow.appendChild(btn);
        });
        messageList.appendChild(rateRow);
      }
    });
    messageList.scrollTop = messageList.scrollHeight;
  }

  /** Saves the in-progress conversation to History if it has any real
   *  content, then clears the board — shared by Clear, switching a task
   *  preset, and loading a different saved chat, so none of those silently
   *  drop work in progress. */
  function archiveCurrentChat(): void {
    const hasContent = messages.some(m => m.role !== 'system' && m.content.trim() !== '');
    if (hasContent) {
      saveChat({
        lang:        currentLang,
        presetKey:   currentPreset,
        presetLabel: TASK_PRESETS[currentPreset].label,
        messages:    messages.filter(m => m.role !== 'system'),
        ratings:     ratings,
      });
    }
    messages = [];
    ratings = {};
  }

  clearBtn.addEventListener('click', () => {
    archiveCurrentChat();
    renderMessages();
    if (!historyPanel.hidden) renderHistoryPanel();
  });

  // Reads only what's already saved — Clear/switching a task archives the
  // in-progress conversation first, so exporting mid-conversation without
  // clearing just misses whatever hasn't been archived yet. Same download
  // mechanics as admin-db.ts's exportCsv, minus its server round-trip —
  // this data already lives in localStorage.
  exportBtn.addEventListener('click', () => {
    const data = exportEvalData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `ai-chat-eval-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  // ── Input row ─────────────────────────────────────────────────────────
  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const input = document.createElement('textarea');
  input.className = 'chat-input';
  input.rows = 2;
  input.placeholder = TASK_PRESETS[currentPreset].placeholder;
  input.disabled = true;

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'chat-send-btn';
  sendBtn.textContent = 'Send';
  sendBtn.disabled = true;

  async function send(): Promise<void> {
    const text = input.value.trim();
    if (!text || engine.status() !== 'ready') return;

    input.value = '';
    if (messages.length === 0) {
      messages.push({ role: 'system', content: TASK_PRESETS[currentPreset].systemPrompt(currentLang) });
    }
    messages.push({ role: 'user', content: text });
    renderMessages();

    // Snapshot before the draft goes in — the engine needs the conversation
    // up to and including the user's message, not the empty reply-in-progress.
    const snapshot = messages.slice();
    const draft: ChatMessage = { role: 'assistant', content: '' };
    messages.push(draft);
    isGenerating = true;
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Generating…';
    renderMessages(); // paint the typing indicator immediately, before the first token
    try {
      // Dictionary lookup (usually cached, occasionally one API call) — done
      // after the indicator's already showing so it doesn't add a visible
      // pause before the "Generating…" state appears.
      const history = await groundedHistory(currentLang, currentPreset, snapshot);
      await engine.send(history, delta => {
        draft.content += delta;
        renderMessages();
      });
    } finally {
      isGenerating = false;
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      renderMessages(); // drop the pending/generating styling now that it's done
      input.focus();
    }
  }

  sendBtn.addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });

  inputRow.append(input, sendBtn);

  // ── Load model ────────────────────────────────────────────────────────
  function syncStatusUI(): void {
    const status = engine.status();
    const labels = { unloaded: 'Not loaded', loading: 'Loading…', ready: 'Ready', error: 'Error' };
    statusPill.textContent = status === 'error' && engine.errorMessage()
      ? `Error: ${engine.errorMessage()}`
      : labels[status];
    statusPill.title = status === 'error' ? (engine.errorMessage() ?? '') : '';
    statusPill.className = `chat-status-pill chat-status-pill--${status}`;
    loadBtn.textContent = status === 'ready' ? 'Reload model' : 'Load model';
    loadBtn.disabled = status === 'loading';
    input.disabled = status !== 'ready';
    sendBtn.disabled = status !== 'ready';
  }

  loadBtn.addEventListener('click', async () => {
    syncStatusUI();
    try {
      await engine.load((pct, note) => {
        statusPill.textContent = `${note} (${pct}%)`;
        statusPill.className = 'chat-status-pill chat-status-pill--loading';
      });
    } catch {
      // MockEngine never rejects; WebLLMEngine's load() failure (network
      // error mid-download, unsupported GPU) already set status/errorMessage
      // — syncStatusUI() below reads them, nothing more to do here.
    }
    syncStatusUI();
    if (engine.status() === 'ready') input.focus();
  });

  wrap.append(header, presetRow, historyPanel, messageList, inputRow);
  container.appendChild(wrap);

  renderMessages();
  syncStatusUI();
}
