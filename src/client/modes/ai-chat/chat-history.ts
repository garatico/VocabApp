/**
 * chat-history.ts — recent AI Chat conversations, capped and localStorage-backed.
 *
 * Mirrors session-history.ts's shape (a capped array under one key, read/write
 * via storage.ts's guarded helpers) rather than inventing a second persistence
 * pattern. Kept smaller than HISTORY_KEEP (quiz sessions are a few numbers;
 * a chat is arbitrary text) so a handful of long conversations can't quietly
 * eat into the shared localStorage quota other features depend on.
 */
import { readJson, writeJson, remove as removeKey } from '../../utils/storage.ts';
import type { ChatMessage } from '../ai-chat-mode.ts';

export interface SavedChat {
  id:          string;
  at:          number; // epoch ms
  lang:        string;
  presetKey:   string;
  presetLabel: string;
  /** User/assistant turns only — the system prompt is reconstructed from
   *  presetKey/lang when a saved chat is reopened, not stored verbatim, so
   *  an older save still picks up any later wording change to that preset. */
  messages:    ChatMessage[];
}

const CHAT_HISTORY_KEY = 'vq_chat_history';

/** Conversations retained. Small on purpose — see file header. */
export const CHAT_HISTORY_KEEP = 20;

export function getSavedChats(): SavedChat[] {
  return readJson<SavedChat[]>(CHAT_HISTORY_KEY, [], Array.isArray);
}

/** Newest first — the order the history panel displays them in. */
export function saveChat(entry: Omit<SavedChat, 'id' | 'at'>): void {
  const prior = getSavedChats();
  const saved: SavedChat = { ...entry, id: crypto.randomUUID(), at: Date.now() };
  writeJson(CHAT_HISTORY_KEY, [saved, ...prior].slice(0, CHAT_HISTORY_KEEP));
}

export function deleteChat(id: string): void {
  writeJson(CHAT_HISTORY_KEY, getSavedChats().filter(c => c.id !== id));
}

export function clearAllChats(): void {
  removeKey(CHAT_HISTORY_KEY);
}
