/**
 * chat-history.test.ts — saved AI Chat conversations, capped at
 * CHAT_HISTORY_KEEP (src/client/modes/ai-chat/chat-history.ts).
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * mastery.test.ts / user-content.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ChatMessage } from '../../src/client/modes/ai-chat-mode.js';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const { getSavedChats, saveChat, deleteChat, clearAllChats, CHAT_HISTORY_KEEP } =
  await import('../../src/client/modes/ai-chat/chat-history.js');

beforeEach(() => store.clear());

const entry = (over: Partial<Parameters<typeof saveChat>[0]> = {}) => ({
  lang: 'spanish', presetKey: 'explain', presetLabel: 'Explain a word',
  messages: [{ role: 'user', content: 'hola' }] as ChatMessage[],
  ...over,
});

describe('getSavedChats', () => {
  it('is empty when nothing has been saved', () => {
    expect(getSavedChats()).toEqual([]);
  });

  it('returns empty rather than throwing on a corrupt store', () => {
    store.set('vq_chat_history', '{not json');
    expect(getSavedChats()).toEqual([]);
  });
});

describe('saveChat', () => {
  it('assigns an id and timestamp', () => {
    saveChat(entry());
    const [saved] = getSavedChats();
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof saved.at).toBe('number');
  });

  it('keeps the rest of the entry as given', () => {
    saveChat(entry({ lang: 'french', presetKey: 'quiz', presetLabel: 'Quiz me' }));
    const [saved] = getSavedChats();
    expect(saved.lang).toBe('french');
    expect(saved.presetKey).toBe('quiz');
    expect(saved.presetLabel).toBe('Quiz me');
  });

  it('orders newest first', () => {
    saveChat(entry({ presetKey: 'first' }));
    saveChat(entry({ presetKey: 'second' }));
    expect(getSavedChats().map(c => c.presetKey)).toEqual(['second', 'first']);
  });

  it('caps the list at CHAT_HISTORY_KEEP, dropping the oldest', () => {
    for (let i = 0; i < CHAT_HISTORY_KEEP + 5; i++) saveChat(entry({ presetKey: `p${i}` }));
    const saved = getSavedChats();
    expect(saved).toHaveLength(CHAT_HISTORY_KEEP);
    // Newest survive; the earliest ones (p0..p4) were pushed off the end.
    expect(saved[0].presetKey).toBe(`p${CHAT_HISTORY_KEEP + 4}`);
    expect(saved.map(c => c.presetKey)).not.toContain('p0');
  });
});

describe('deleteChat', () => {
  it('removes only the chat with the matching id', () => {
    saveChat(entry({ presetKey: 'keep' }));
    saveChat(entry({ presetKey: 'drop' }));
    const [toDrop, toKeep] = getSavedChats();
    deleteChat(toDrop.id);
    expect(getSavedChats()).toEqual([toKeep]);
  });

  it('is a no-op for an id that does not exist', () => {
    saveChat(entry());
    expect(() => deleteChat('nope')).not.toThrow();
    expect(getSavedChats()).toHaveLength(1);
  });
});

describe('clearAllChats', () => {
  it('removes every saved chat', () => {
    saveChat(entry());
    saveChat(entry());
    clearAllChats();
    expect(getSavedChats()).toEqual([]);
  });
});
