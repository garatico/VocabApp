/**
 * eval-contract.test.ts — shaping rated AI Chat replies into EvalExample[]
 * (src/client/modes/ai-chat/eval-contract.ts).
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * session-history.test.ts. Fixture chats are written directly under
 * chat-history.ts's storage key rather than going through saveChat(), since
 * saveChat() stamps its own id/timestamp and this only needs to exercise
 * exportEvalData()'s shaping logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const { exportEvalData } = await import('../../src/client/modes/ai-chat/eval-contract.js');

beforeEach(() => store.clear());

function seedChats(chats: unknown[]): void {
  store.set('vq_chat_history', JSON.stringify(chats));
}

describe('exportEvalData', () => {
  it('returns nothing when there are no saved chats', () => {
    expect(exportEvalData()).toEqual([]);
  });

  it('skips assistant messages with no rating', () => {
    seedChats([{
      id: '1', at: 1000, lang: 'spanish', presetKey: 'explain', presetLabel: 'Explain a word',
      messages: [
        { role: 'user', content: 'perro' },
        { role: 'assistant', content: 'Dog — a common noun.' },
      ],
      // no ratings field at all
    }]);
    expect(exportEvalData()).toEqual([]);
  });

  it('includes a rated assistant message with its preceding user turn', () => {
    seedChats([{
      id: '1', at: 1000, lang: 'spanish', presetKey: 'explain', presetLabel: 'Explain a word',
      messages: [
        { role: 'user', content: 'perro' },
        { role: 'assistant', content: 'Dog — a common noun.' },
      ],
      ratings: { 1: 'good' },
    }]);

    const out = exportEvalData();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      presetKey: 'explain',
      lang: 'spanish',
      input: 'perro',
      reply: 'Dog — a common noun.',
      rating: 'good',
      at: 1000,
    });
    expect(out[0].conversationExcerpt).toEqual([
      { role: 'user', content: 'perro' },
      { role: 'assistant', content: 'Dog — a common noun.' },
    ]);
  });

  it('finds the nearest preceding user message in a multi-turn chat', () => {
    seedChats([{
      id: '1', at: 2000, lang: 'french', presetKey: 'free', presetLabel: 'Free chat',
      messages: [
        { role: 'user', content: 'Bonjour' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Comment ça va?' },
        { role: 'assistant', content: "That means 'how are you'." },
      ],
      ratings: { 3: 'bad' },
    }]);

    const out = exportEvalData();
    expect(out).toHaveLength(1);
    expect(out[0].input).toBe('Comment ça va?');
    expect(out[0].reply).toBe("That means 'how are you'.");
    expect(out[0].rating).toBe('bad');
  });

  it('emits one example per rated message, ignoring unrated ones in between', () => {
    seedChats([{
      id: '1', at: 3000, lang: 'spanish', presetKey: 'check', presetLabel: 'Check a sentence',
      messages: [
        { role: 'user', content: 'Yo soy feliz.' },
        { role: 'assistant', content: 'Correct!' },
        { role: 'user', content: 'Yo estoy feliz.' },
        { role: 'assistant', content: 'Also correct, subtle difference in meaning.' },
      ],
      ratings: { 1: 'good', 3: 'good' },
    }]);

    expect(exportEvalData()).toHaveLength(2);
  });

  it('collects across multiple saved chats', () => {
    seedChats([
      {
        id: '1', at: 1000, lang: 'spanish', presetKey: 'explain', presetLabel: 'Explain a word',
        messages: [{ role: 'user', content: 'perro' }, { role: 'assistant', content: 'Dog.' }],
        ratings: { 1: 'good' },
      },
      {
        id: '2', at: 2000, lang: 'italian', presetKey: 'explain', presetLabel: 'Explain a word',
        messages: [{ role: 'user', content: 'gatto' }, { role: 'assistant', content: 'Cat.' }],
        ratings: { 1: 'bad' },
      },
    ]);

    const out = exportEvalData();
    expect(out).toHaveLength(2);
    expect(out.map(e => e.lang)).toEqual(['spanish', 'italian']);
  });

  it('a chat with no preceding user message reports an empty input rather than throwing', () => {
    seedChats([{
      id: '1', at: 1000, lang: 'spanish', presetKey: 'free', presetLabel: 'Free chat',
      messages: [{ role: 'assistant', content: 'Hi, how can I help?' }],
      ratings: { 0: 'good' },
    }]);

    const out = exportEvalData();
    expect(out).toHaveLength(1);
    expect(out[0].input).toBe('');
  });

  it('survives a corrupt payload rather than throwing', () => {
    store.set('vq_chat_history', '{not json');
    expect(exportEvalData()).toEqual([]);
  });
});
