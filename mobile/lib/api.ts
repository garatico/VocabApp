/**
 * API layer — fetches vocabulary from the Express backend.
 *
 * DEV NOTE: On a physical device, replace API_BASE with your machine's
 * LAN IP address (e.g. http://192.168.1.42:3000).
 * On a simulator/emulator, localhost works fine.
 * Alternatively, run `npx expo start --tunnel` to use ngrok automatically.
 */

import type { Word } from './types';

export const API_BASE = __DEV__
  ? 'http://localhost:3000'
  : 'https://your-production-url.com'; // TODO: set production URL

export async function fetchWords(lang: string): Promise<Word[]> {
  const res = await fetch(`${API_BASE}/api/vocab/${lang}`);
  if (!res.ok) throw new Error(`Failed to fetch words: ${res.status}`);
  const data = await res.json();
  // API returns { success, language, count, metadata, data: Word[] }
  return Array.isArray(data) ? data : (data.data ?? []);
}
