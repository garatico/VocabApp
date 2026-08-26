/**
 * conjugation/card-match-mode.ts — a memory-match game over conjugated forms.
 *
 * Two pairing styles (picked via #conjMatchStyleGroup in the controls bar):
 *
 *   pronoun    — one verb and tense per round; match each of its six
 *                pronouns to the form it takes.
 *   infinitive — several verbs per round (one fixed tense/pronoun slot);
 *                match each infinitive to its conjugated form. Tests telling
 *                verbs apart, not the pronoun paradigm.
 *
 * Cards stay face-up the whole time — unlike an image memory game, the point
 * here is recognizing which two things belong together, not remembering
 * where you last saw them. Click one card in each column; a correct pair
 * locks green (reusing trivia.css's .tv-option classes — the same boxed,
 * clickable-cell look Trivia's multiple choice uses), a wrong pair flashes
 * red and clears the selection. A round is done once every pair in it is
 * matched; Give Up ends the whole session and counts whatever's left as
 * missed.
 */
import type { Word } from '../../types.js';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import { activeTenses, activeRegularities, unionTenseDefs, activePronounIndices } from './controls.js';
import {
  isOwnInfinitive, hasAnyForms, regularityOf, isSingleForm, verbKey, hiddenPronounSlots,
} from './index.js';
import { shuffle } from '../../utils/shuffle.js';
import {
  orderWords, WORD_ORDER_LABELS, saveSession, recordOutcome, type WordOrder,
} from '../../utils/session-history.js';
import { readString, writeString } from '../../utils/storage.js';
import { createStopwatch } from '../../ui/stopwatch.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';

export type ConjMatchPairing = 'pronoun' | 'infinitive';

export interface ConjCardMatchOptions {
  words:      Word[];
  container:  HTMLElement;
  lang?:      string;
  extraLangs?: string[];
  pairing:    ConjMatchPairing;
}

interface Pair {
  id:       string;
  left:     string;
  right:    string;
  verb:     Word;
  verbLang: string;
}
interface Round { pairs: Pair[]; }

/** Verbs per round in 'infinitive' pairing — small enough to scan, big enough to be a game. */
const INFINITIVE_BATCH_SIZE = 5;

export function renderConjCardMatch({
  words,
  container,
  lang = 'spanish',
  extraLangs = [],
  pairing,
}: ConjCardMatchOptions): void {
  container.innerHTML = '';
  clearSummary('conjugation');

  const primaryLang = lang.split('+')[0];

  const regs     = activeRegularities();
  const everyReg = regs.length >= 4;
  const verbEntries = words.filter(w => w.pos === 'verb' && isOwnInfinitive(w));
  const rawVerbs = verbEntries.filter(hasAnyForms);
  const allVerbs = everyReg
    ? rawVerbs
    : rawVerbs.filter(w => {
        const cls = w.linguistic?.conjugation_class ?? null;
        return cls == null || regs.includes(regularityOf(cls).key);
      });

  if (allVerbs.length === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No verbs available for Card Match.</p>
      <p class="conj-empty-hint">Check the Tense &amp; Forms and Regularity filters, then hit Start Quiz again.</p>
    </div>`;
    return;
  }

  const tenseDefs = unionTenseDefs(primaryLang, extraLangs);
  function selectedTenses(): string[] {
    const picked = activeTenses().filter(k => tenseDefs.some(d => d.key === k));
    return picked.length ? picked : [tenseDefs[0].key];
  }

  let verbOrder: WordOrder =
    (readString('vq_conj_match_order') as WordOrder | null) ?? 'rank';

  function buildRounds(): Round[] {
    // Shuffle means "mix it up" — for a match game that means the verb order
    // *and* which pairs land in a round together, not just verb sequence
    // (every other Order choice only ever changes that).
    const trueShuffle = verbOrder === 'shuffle';
    const ordered = trueShuffle
      ? shuffle(allVerbs)
      : orderWords(allVerbs, verbOrder, w => w.language ?? lang);
    const tenses = selectedTenses();
    const activePronouns = activePronounIndices();
    const rounds: Round[] = [];

    if (pairing === 'pronoun') {
      if (trueShuffle) {
        // Bucketed by pronoun slot (0 = "yo", 1 = "tú", …), each bucket
        // shuffled on its own, then a round takes at most one pair *per
        // bucket* — index r of every bucket becomes round r. That still
        // mixes several different verbs and tenses into one round (each
        // bucket shuffles independently), but a round can never contain two
        // pairs for the same pronoun the way naively chunking one big
        // shuffled pool could — that was the actual bug: "yo" and "yo"
        // sitting in the same round is trial and error, not matching.
        const buckets: Pair[][] = Array.from({ length: 6 }, () => []);
        ordered.forEach(verb => {
          const verbLang = verb.language ?? lang;
          const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
          const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t) && !isSingleForm(t));
          tensesForVerb.forEach(tenseKey => {
            const forms = (verb.linguistic?.conjugations as Record<string, unknown> | null)?.[tenseKey];
            if (!Array.isArray(forms)) return;
            const noForm = hiddenPronounSlots(tenseKey);
            (PRONOUNS[verbLang] ?? PRONOUNS.spanish).forEach((p, i) => {
              if (!activePronouns.has(i) || noForm.has(i)) return;
              const right = (forms[i] as string | undefined) ?? '';
              if (!right.trim()) return;
              buckets[i].push({ id: `${verbKey(verb.word, verbLang)}:${tenseKey}:${i}`, left: p, right, verb, verbLang });
            });
          });
        });
        const shuffledBuckets = buckets.map(b => shuffle(b));
        const roundCount = Math.max(...shuffledBuckets.map(b => b.length), 0);
        for (let r = 0; r < roundCount; r++) {
          const pairs = shuffledBuckets.map(b => b[r]).filter((p): p is Pair => p !== undefined);
          if (pairs.length >= 2) rounds.push({ pairs });
        }
      } else {
        ordered.forEach(verb => {
          const verbLang = verb.language ?? lang;
          const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
          // Single-form tenses (gerund, participle) have no pronoun to pair
          // against — nothing to match there.
          const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t) && !isSingleForm(t));
          tensesForVerb.forEach(tenseKey => {
            const forms = (verb.linguistic?.conjugations as Record<string, unknown> | null)?.[tenseKey];
            if (!Array.isArray(forms)) return;
            const noForm = hiddenPronounSlots(tenseKey);
            const pronouns = PRONOUNS[verbLang] ?? PRONOUNS.spanish;
            const pairs: Pair[] = pronouns
              .map((p, i) => ({
                id: `${verbKey(verb.word, verbLang)}:${tenseKey}:${i}`,
                left: p, right: (forms[i] as string | undefined) ?? '',
                verb, verbLang,
              }))
              .filter((pair, i) => activePronouns.has(i) && !noForm.has(i) && pair.right.trim() !== '');
            if (pairs.length >= 2) rounds.push({ pairs });
          });
        });
      }
    } else {
      // 'infinitive' — one form per verb per round. Normally one fixed tense
      // (the first selected) for every verb; Shuffle instead picks a random
      // one of the selected tenses per verb, so the round mixes tenses along
      // with the verbs it already mixes. A single-form tense's own value is
      // the form; a pronoun tense uses its first slot, for a consistent
      // single answer per verb regardless of language.
      const fixedTenseKey = tenses[0];
      for (let i = 0; i < ordered.length; i += INFINITIVE_BATCH_SIZE) {
        const batch = ordered.slice(i, i + INFINITIVE_BATCH_SIZE);
        const pairs: Pair[] = [];
        batch.forEach(verb => {
          const verbLang = verb.language ?? lang;
          const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
          const validTenses = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
          const tenseKey = trueShuffle ? shuffle(validTenses)[0] : fixedTenseKey;
          if (!tenseKey || !verbTenseDefs.some(d => d.key === tenseKey)) return;
          const conj = verb.linguistic?.conjugations as Record<string, unknown> | null;
          const raw  = conj?.[tenseKey];
          const form = isSingleForm(tenseKey)
            ? (typeof raw === 'string' ? raw : null)
            : (Array.isArray(raw) ? ((raw[0] as string | undefined) ?? null) : null);
          if (!form || !form.trim()) return;
          pairs.push({ id: verbKey(verb.word, verbLang), left: verb.word, right: form, verb, verbLang });
        });
        if (pairs.length >= 2) rounds.push({ pairs });
      }
    }
    return rounds;
  }

  let rounds = buildRounds();
  if (rounds.length === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No matchable pairs for the current selection.</p>
      <p class="conj-empty-hint">${pairing === 'pronoun'
        ? 'Pronoun matching needs a non-single-form tense (not Gerund/Participle) selected.'
        : 'Try a different tense in Tense &amp; Forms.'}</p>
    </div>`;
    return;
  }

  const totalPairs = rounds.reduce((n, r) => n + r.pairs.length, 0);
  const matchedIds = new Set<string>();
  const missedPairs: Pair[] = [];
  let roundIdx = 0;
  let finished = false;

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'cm-wrap';

  const topRow = document.createElement('div');
  topRow.className = 'conj-order-row';
  const orderLabel = document.createElement('span');
  orderLabel.className = 'conj-order-label';
  orderLabel.textContent = 'Order';
  const orderSel = document.createElement('select');
  orderSel.className = 'conj-order-select';
  WORD_ORDER_LABELS.forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === verbOrder;
    if (value === 'shuffle') {
      o.title = pairing === 'pronoun'
        ? 'Mix pronouns from several different verbs and tenses into one round'
        : 'Mix which tense each verb uses, round to round';
    }
    orderSel.appendChild(o);
  });
  const roundLabel = document.createElement('span');
  roundLabel.className = 'cm-round-label';
  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  topRow.append(orderLabel, orderSel, roundLabel, stopwatchEl, giveUpBtn);

  const clock = createStopwatch(stopwatchEl);
  clock.start();

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progressWrap';
  const track  = document.createElement('div'); track.className  = 'progress';
  const green  = document.createElement('div'); green.className  = 'bar';
  const red    = document.createElement('div'); red.className    = 'bar-missed';
  track.append(green, red);
  const stat = document.createElement('div');
  stat.className = 'small';
  progressWrap.append(track, stat);
  const scoreEl = document.createElement('div');
  scoreEl.className = 'quiz-score';

  const feedback = document.createElement('div');
  feedback.className = 'tv-feedback cm-feedback';

  const columns = document.createElement('div');
  columns.className = 'cm-columns';
  const leftCol  = document.createElement('div'); leftCol.className  = 'cm-col';
  const rightCol = document.createElement('div'); rightCol.className = 'cm-col';
  columns.append(leftCol, rightCol);

  wrap.append(topRow, progressWrap, scoreEl, feedback, columns);
  container.appendChild(wrap);

  // ── Round rendering ──────────────────────────────────────────────────────

  interface CardRef { pair: Pair; el: HTMLButtonElement; matched: boolean; }
  let leftCards: CardRef[]  = [];
  let rightCards: CardRef[] = [];
  let selectedLeft:  CardRef | null = null;
  let selectedRight: CardRef | null = null;
  let inputLocked = false; // brief lockout while a mismatch flashes

  function renderRound(): void {
    const round = rounds[roundIdx];
    roundLabel.textContent = `Round ${roundIdx + 1} / ${rounds.length}`;
    selectedLeft = null;
    selectedRight = null;
    inputLocked = false;

    leftCol.innerHTML = '';
    rightCol.innerHTML = '';
    leftCards  = shuffle(round.pairs).map(pair => buildCard(pair, 'left'));
    rightCards = shuffle(round.pairs).map(pair => buildCard(pair, 'right'));
    leftCards.forEach(c => leftCol.appendChild(c.el));
    rightCards.forEach(c => rightCol.appendChild(c.el));
  }

  function buildCard(pair: Pair, side: 'left' | 'right'): CardRef {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tv-option cm-card';
    btn.textContent = side === 'left' ? pair.left : pair.right;
    const ref: CardRef = { pair, el: btn, matched: false };
    btn.addEventListener('click', () => onCardClick(ref, side));
    return ref;
  }

  function onCardClick(ref: CardRef, side: 'left' | 'right'): void {
    if (finished || inputLocked || ref.matched) return;
    if (side === 'left') {
      if (selectedLeft) selectedLeft.el.classList.remove('tv-option--reveal');
      selectedLeft = ref;
    } else {
      if (selectedRight) selectedRight.el.classList.remove('tv-option--reveal');
      selectedRight = ref;
    }
    ref.el.classList.add('tv-option--reveal');

    if (selectedLeft && selectedRight) tryMatch(selectedLeft, selectedRight);
  }

  function tryMatch(left: CardRef, right: CardRef): void {
    if (left.pair.id === right.pair.id) {
      left.matched = right.matched = true;
      left.el.classList.remove('tv-option--reveal');
      right.el.classList.remove('tv-option--reveal');
      left.el.classList.add('tv-option--correct');
      right.el.classList.add('tv-option--correct');
      left.el.disabled = right.el.disabled = true;
      matchedIds.add(left.pair.id);
      selectedLeft = selectedRight = null;
      updateProgress();

      if (leftCards.every(c => c.matched)) {
        setTimeout(() => {
          if (roundIdx < rounds.length - 1) { roundIdx++; renderRound(); }
          else finish();
        }, 500);
      }
    } else {
      inputLocked = true;
      left.el.classList.add('tv-option--wrong');
      right.el.classList.add('tv-option--wrong');
      flash('Not a match', 'bad');
      setTimeout(() => {
        left.el.classList.remove('tv-option--wrong', 'tv-option--reveal');
        right.el.classList.remove('tv-option--wrong', 'tv-option--reveal');
        selectedLeft = selectedRight = null;
        inputLocked = false;
      }, 700);
    }
  }

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(text: string, cls: string): void {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.className = 'tv-feedback cm-feedback ' + cls;
    feedbackTimer = setTimeout(() => { feedback.textContent = ''; feedback.className = 'tv-feedback cm-feedback'; }, 900);
  }

  // ── Order ────────────────────────────────────────────────────────────────

  orderSel.addEventListener('change', () => {
    verbOrder = orderSel.value as WordOrder;
    writeString('vq_conj_match_order', verbOrder);
    rounds = buildRounds();
    roundIdx = 0;
    matchedIds.clear();
    missedPairs.length = 0;
    finished = false;
    giveUpBtn.disabled = false;
    updateProgress();
    renderRound();
  });

  // ── Progress ─────────────────────────────────────────────────────────────

  function updateProgress(): void {
    const missed = missedPairs.length;
    const g = scorePct(matchedIds.size, totalPairs);
    const r = scorePct(missed, totalPairs);
    green.style.width = g + '%';
    red.style.left    = g + '%';
    red.style.width   = r + '%';
    stat.textContent  = totalPairs > 0 ? `${matchedIds.size + missed}/${totalPairs} Matched` : '';
    scoreEl.innerHTML = buildScorePills({
      correct: matchedIds.size, revealed: 0, missed,
      left: Math.max(0, totalPairs - matchedIds.size - missed), total: totalPairs,
    });
    giveUpBtn.disabled = totalPairs > 0 && matchedIds.size + missed === totalPairs;
  }

  // ── Session end ──────────────────────────────────────────────────────────

  function recordSession(): void {
    interface Acc { word: string; language: string; total: number; correct: number; }
    const perVerb = new Map<string, Acc>();
    function tally(pair: Pair, correct: boolean): void {
      const key = verbKey(pair.verb.word, pair.verbLang);
      const acc = perVerb.get(key) ?? { word: pair.verb.word, language: pair.verbLang, total: 0, correct: 0 };
      acc.total++;
      if (correct) acc.correct++;
      perVerb.set(key, acc);
    }
    rounds.forEach(round => round.pairs.forEach(pair => {
      tally(pair, matchedIds.has(pair.id));
    }));

    interface Bucket { correct: string[]; missed: string[]; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [] }; byLang.set(wl, b); }
      return b;
    }
    perVerb.forEach(acc => {
      bucketFor(acc.language)[acc.correct === acc.total ? 'correct' : 'missed'].push(acc.word);
    });

    const seconds = clock.elapsedSeconds();
    const langs = [...byLang.keys()];
    for (const [wl, b] of byLang) {
      recordOutcome(wl, b.missed, b.correct);
      saveSession(wl, {
        at: new Date().toISOString(),
        mode: 'conjugation',
        total: b.correct.length + b.missed.length,
        correct: b.correct.length,
        unassisted: b.correct.length,
        hints: 0,
        revealed: b.missed.length,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      });
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    clock.stop();
    giveUpBtn.disabled = true;

    // Whatever's unmatched — in this round or any round never reached —
    // counts as missed.
    rounds.forEach(round => round.pairs.forEach(pair => {
      if (!matchedIds.has(pair.id)) missedPairs.push(pair);
    }));
    leftCards.forEach(c => { if (!c.matched) c.el.disabled = true; });
    rightCards.forEach(c => { if (!c.matched) c.el.disabled = true; });

    updateProgress();
    recordSession();

    const correct = matchedIds.size;
    showSummary('conjugation',
      summaryChip('correct', `✓ ${correct} / ${totalPairs} matched`) +
      summaryChip('pct',     `${percent(correct, totalPairs)}%`),
      totalPairs > 0 && correct === totalPairs,
    );
  }

  giveUpBtn.addEventListener('click', finish);

  renderRound();
  updateProgress();
}
