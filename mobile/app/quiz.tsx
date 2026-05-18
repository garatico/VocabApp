/**
 * Quiz screen — loads words from the API then runs the single-word quiz.
 * Receives `lang` and `size` as route params from the home screen.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { QuizCard }                             from '../components/QuizCard';
import { fetchWords }                           from '../lib/api';
import { getAnswers }                           from '../lib/types';
import type { Word, Language }                  from '../lib/types';

// ── Word prep ──────────────────────────────────────────────────────────────────

function prepareWords(raw: Word[], size: string): Word[] {
  const sorted = raw.slice().sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  const n = size === 'max' ? Infinity : Number(size) || 1000;
  const sliced = isFinite(n) ? sorted.slice(0, n) : sorted;
  // Shuffle
  for (let i = sliced.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sliced[i], sliced[j]] = [sliced[j], sliced[i]];
  }
  return sliced;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'error' | 'quiz' | 'done';

export default function QuizScreen() {
  const { lang = 'spanish', size = '1000' } = useLocalSearchParams<{
    lang: Language;
    size: string;
  }>();

  const [state,   setState]   = useState<ScreenState>('loading');
  const [words,   setWords]   = useState<Word[]>([]);
  const [index,   setIndex]   = useState(0);
  const [correct, setCorrect] = useState(0);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setIndex(0);
    setCorrect(0);
    try {
      const raw = await fetchWords(lang);
      setWords(prepareWords(raw, size));
      setState('quiz');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  }, [lang, size]);

  useEffect(() => { load(); }, [load]);

  function handleCorrect() {
    setCorrect(c => c + 1);
    advance();
  }

  function handleSkip() {
    advance();
  }

  function advance() {
    if (index + 1 >= words.length) {
      setState('done');
    } else {
      setIndex(i => i + 1);
    }
  }

  const pct = words.length > 0 ? Math.round((correct / words.length) * 100) : 0;
  const title = lang.charAt(0).toUpperCase() + lang.slice(1);

  return (
    <>
      <Stack.Screen options={{ title }} />

      <View style={styles.container}>

        {/* ── Loading ─────────────────────────────────────── */}
        {state === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>Loading words…</Text>
          </View>
        )}

        {/* ── Error ───────────────────────────────────────── */}
        {state === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Quiz ────────────────────────────────────────── */}
        {state === 'quiz' && words.length > 0 && (
          <QuizCard
            word={{
              word:    words[index].word,
              answers: getAnswers(words[index]),
              pos:     words[index].pos ?? undefined,
            }}
            index={index + 1}
            total={words.length}
            onCorrect={handleCorrect}
            onSkip={handleSkip}
          />
        )}

        {/* ── Summary ─────────────────────────────────────── */}
        {state === 'done' && (
          <View style={styles.summary}>
            <Text style={styles.summaryEmoji}>
              {pct === 100 ? '🎉' : pct >= 70 ? '👍' : '💪'}
            </Text>
            <Text style={styles.summaryScore}>{correct} / {words.length}</Text>
            <Text style={styles.summaryPct}>{pct}% correct</Text>

            <View style={styles.summaryBtns}>
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={load}>
                <Text style={styles.btnOutlineText}>Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => router.back()}>
                <Text style={styles.btnPrimaryText}>Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const C = {
  bg:     '#f8f9fa',
  text:   '#212529',
  muted:  '#6c757d',
  border: '#dee2e6',
  accent: '#4f8ef7',
  white:  '#ffffff',
  danger: '#ef4444',
};

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
    justifyContent:  'center',
  },
  center: {
    alignItems: 'center',
    padding:    32,
    gap:        16,
  },
  loadingText: {
    fontSize: 16,
    color:    C.muted,
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorText: {
    fontSize:  15,
    color:     C.danger,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 32,
    paddingVertical:   12,
    borderRadius:      10,
    marginTop:         8,
  },
  retryBtnText: {
    color:      C.white,
    fontSize:   16,
    fontWeight: '600',
  },
  summary: {
    alignItems: 'center',
    padding:    40,
    gap:        8,
  },
  summaryEmoji: {
    fontSize:     64,
    marginBottom: 8,
  },
  summaryScore: {
    fontSize:   44,
    fontWeight: '700',
    color:      C.text,
  },
  summaryPct: {
    fontSize:     18,
    color:        C.muted,
    marginBottom: 32,
  },
  summaryBtns: {
    flexDirection: 'row',
    gap:           12,
    width:         '100%',
  },
  btn: {
    flex:           1,
    paddingVertical: 14,
    borderRadius:   12,
    alignItems:     'center',
  },
  btnOutline: {
    borderWidth:  1.5,
    borderColor:  C.accent,
  },
  btnOutlineText: {
    color:      C.accent,
    fontSize:   16,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: C.accent,
  },
  btnPrimaryText: {
    color:      C.white,
    fontSize:   16,
    fontWeight: '600',
  },
});
