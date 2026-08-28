/**
 * ai-chat-mode.ts — local AI chat (dev + desktop only, see app.ts's chat-tab
 * gate and mode-tabs.css's `.chat-tab` media query).
 *
 * This is a template: the UI, message state and task-preset scaffolding are
 * real, but `MockEngine` below stands in for an actual on-device model. Swap
 * it for a WebLLM- or transformers.js-backed `ChatEngine` — same three
 * methods, model weights fetched into the browser cache on `load()` — and
 * the rest of this file doesn't change. Kept as a fixed menu of task presets
 * rather than a bare chatbox on purpose: a small model stays reliable when
 * it's filling in a template you wrote (explain this word, give example
 * sentences) and drifts in open-ended conversation.
 */

import { LANGUAGES } from '../data/languages.ts';

// ── Engine seam ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface ChatEngine {
  status(): EngineStatus;
  load(onProgress: (pct: number, note: string) => void): Promise<void>;
  send(messages: ChatMessage[], onToken: (delta: string) => void): Promise<void>;
}

/**
 * Stands in for a real local model so the tab is fully clickable without a
 * multi-hundred-MB download. Fakes a load progress bar, then echoes a
 * canned reply per task preset so the UI (streaming text, message list,
 * scroll behavior) is exercisable end to end.
 */
class MockEngine implements ChatEngine {
  private _status: EngineStatus = 'unloaded';

  status(): EngineStatus {
    return this._status;
  }

  async load(onProgress: (pct: number, note: string) => void): Promise<void> {
    this._status = 'loading';
    const steps = ['Fetching model weights…', 'Loading into memory…', 'Warming up…'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 350));
      onProgress(Math.round(((i + 1) / steps.length) * 100), steps[i]);
    }
    this._status = 'ready';
  }

  async send(messages: ChatMessage[], onToken: (delta: string) => void): Promise<void> {
    const last = messages[messages.length - 1]?.content ?? '';
    const reply = `(mock reply — no model loaded yet)\n\nYou asked: "${last}". `
      + 'Wire a real ChatEngine (WebLLM/transformers.js) into ai-chat-mode.ts '
      + 'to replace this placeholder.';
    for (const word of reply.split(' ')) {
      await new Promise(r => setTimeout(r, 18));
      onToken(word + ' ');
    }
  }
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
  free: {
    label: 'Free chat',
    systemPrompt: lang => `You are a helpful ${lang} language-learning assistant.`,
    placeholder: 'Ask anything…',
  },
};

// ── Render ────────────────────────────────────────────────────────────────

const engine: ChatEngine = new MockEngine();

export function renderAiChat(container: HTMLElement, lang = 'spanish'): void {
  container.innerHTML = '';

  let currentLang = lang;
  let currentPreset = 'explain';
  let messages: ChatMessage[] = [];

  const wrap = document.createElement('div');
  wrap.className = 'chat-wrap';

  // ── Header: status + load button + language ─────────────────────────────
  const header = document.createElement('div');
  header.className = 'chat-header';

  const title = document.createElement('div');
  title.className = 'chat-title';
  title.innerHTML = '<strong>AI Chat</strong><span class="chat-subtitle">'
    + 'Runs entirely on this device — nothing you type leaves your computer.</span>';

  const langSel = document.createElement('select');
  langSel.className = 'chat-lang-select';
  LANGUAGES.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.name; opt.textContent = l.label; opt.selected = l.name === currentLang;
    langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => { currentLang = langSel.value; });

  const statusPill = document.createElement('span');
  statusPill.className = 'chat-status-pill';

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'chat-load-btn';

  header.append(title, langSel, statusPill, loadBtn);

  // ── Task presets ──────────────────────────────────────────────────────
  const presetRow = document.createElement('div');
  presetRow.className = 'chat-preset-row';
  Object.entries(TASK_PRESETS).forEach(([key, preset]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip chat-preset-chip' + (key === currentPreset ? ' active' : '');
    chip.textContent = preset.label;
    chip.addEventListener('click', () => {
      currentPreset = key;
      messages = [];
      renderMessages();
      input.placeholder = preset.placeholder;
      presetRow.querySelectorAll('.chat-preset-chip').forEach(el => el.classList.remove('active'));
      chip.classList.add('active');
    });
    presetRow.appendChild(chip);
  });

  // ── Message list ──────────────────────────────────────────────────────
  const messageList = document.createElement('div');
  messageList.className = 'chat-messages';

  const emptyState = document.createElement('div');
  emptyState.className = 'chat-empty';
  emptyState.textContent = 'Load the model to start chatting.';

  function renderMessages(): void {
    messageList.innerHTML = '';
    if (messages.length === 0) {
      messageList.appendChild(emptyState);
      return;
    }
    messages.forEach(m => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-bubble--${m.role}`;
      bubble.textContent = m.content;
      messageList.appendChild(bubble);
    });
    messageList.scrollTop = messageList.scrollHeight;
  }

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
    const history = messages.slice();
    const draft: ChatMessage = { role: 'assistant', content: '' };
    messages.push(draft);
    input.disabled = true;
    sendBtn.disabled = true;
    try {
      await engine.send(history, delta => {
        draft.content += delta;
        renderMessages();
      });
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
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
    statusPill.textContent = { unloaded: 'Not loaded', loading: 'Loading…', ready: 'Ready', error: 'Error' }[status];
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
      // MockEngine never rejects; a real engine's load() failure (no WebGPU,
      // network error mid-download) lands here.
    }
    syncStatusUI();
    if (engine.status() === 'ready') input.focus();
  });

  wrap.append(header, presetRow, messageList, inputRow);
  container.appendChild(wrap);

  renderMessages();
  syncStatusUI();
}
