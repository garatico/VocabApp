/**
 * eval-contract.ts — what "good" means for each AI Chat task preset, and the
 * shape a rated exchange takes once exported.
 *
 * Mirrors the two-sided-agreement style of server/lib/data-requirements.ts:
 * that file states what this app needs from a vocabulary database, separate
 * from whatever pipeline happens to produce one today, so the two can drift
 * and still say so. This is the same idea pointed at a future fine-tuned
 * model instead of a database — the rubric below is a target a training
 * effort (in its own separate repo, whenever that starts) builds toward,
 * independent of whatever WebLLMEngine's current base model produces. It is
 * deliberately not a description of what the model does now.
 *
 * The other half — actually collecting examples of "good" and "bad" — is
 * exportEvalData() below, fed by the 👍/👎 rating UI in ai-chat-mode.ts and
 * persisted alongside each SavedChat (see chat-history.ts's `ratings` field).
 */
import { getSavedChats, type Rating } from './chat-history.ts';
import type { ChatMessage } from '../ai-chat-mode.ts';

/**
 * One sentence per preset: not exhaustive grading criteria, just the thing
 * that most often separates a good reply from a bad one for that task —
 * the failure mode worth watching for.
 */
export const PRESET_RUBRICS: Record<string, string> = {
  explain: 'Correct meaning, correct part of speech, and one nuance a learner would '
    + 'actually miss — not a dictionary-entry restatement. Short.',
  examples: 'Exactly 3 example sentences, each grammatically correct in the target '
    + 'language, each paired with an accurate English translation.',
  quiz: 'One question at a time, waits for an answer before continuing, and correctly '
    + 'judges whether the answer given was right.',
  check: 'Catches every real error in the sentence without inventing false ones; the '
    + 'corrected sentence is actually correct; the translation is in real English, not '
    + 'another target-language sentence.',
  free: 'Corrects a genuine mistake instead of agreeing with it; answers a translation '
    + 'request in English, not more of the target language.',
};

export interface EvalExample {
  presetKey:            string;
  lang:                 string;
  /** The user message that prompted the rated reply. */
  input:                string;
  /** The rated assistant reply itself. */
  reply:                string;
  rating:                Rating;
  /** Full turn context up to and including the rated reply, for a training
   *  pipeline that wants more than the single input/reply pair. */
  conversationExcerpt:  ChatMessage[];
  at:                    number;
}

/**
 * Every rated assistant message across every saved chat, shaped to the
 * contract above. An assistant message nobody rated contributes nothing —
 * there's no such thing as an implicit rating.
 */
export function exportEvalData(): EvalExample[] {
  const out: EvalExample[] = [];

  for (const chat of getSavedChats()) {
    const ratings = chat.ratings ?? {};
    chat.messages.forEach((m, i) => {
      if (m.role !== 'assistant') return;
      const rating = ratings[i];
      if (!rating) return;

      const precedingUser = [...chat.messages.slice(0, i)].reverse()
        .find(x => x.role === 'user');

      out.push({
        presetKey: chat.presetKey,
        lang: chat.lang,
        input: precedingUser?.content ?? '',
        reply: m.content,
        rating,
        conversationExcerpt: chat.messages.slice(0, i + 1),
        at: chat.at,
      });
    });
  }

  return out;
}
