/**
 * QuizCard — single-word quiz interaction in React Native.
 *
 * Shows a foreign-language word, accepts a typed English answer,
 * gives immediate correct/incorrect feedback, then advances.
 *
 * Props are kept intentionally minimal so this component is easy
 * to test in isolation. The parent owns the word list and index.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QuizWord {
  word:     string;   // target-language word shown to the user
  answers:  string[]; // accepted English translations
  pos?:     string;   // part of speech label (optional, shown as hint)
}

interface QuizCardProps {
  word:       QuizWord;
  index:      number;   // 1-based position for display
  total:      number;
  onCorrect:  () => void;
  onSkip:     () => void;
}

import { isCorrect as _isCorrect } from '../lib/match';

// ── Helpers ────────────────────────────────────────────────────────────────────

function isCorrect(input: string, word: QuizWord): boolean {
  return _isCorrect(input, word.answers);
}

// ── Component ──────────────────────────────────────────────────────────────────

type FeedbackState = 'idle' | 'correct' | 'wrong';

export function QuizCard({ word, index, total, onCorrect, onSkip }: QuizCardProps) {
  const [input,    setInput]    = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Shake animation for wrong answers
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Reset state when the word changes
  useEffect(() => {
    setInput('');
    setFeedback('idle');
    setRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [word.word]);

  function shake(): void {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function handleChange(text: string): void {
    setInput(text);
    setFeedback('idle');

    if (isCorrect(text, word)) {
      setFeedback('correct');
      setInput(word.answers[0]); // snap to canonical answer
      setTimeout(() => onCorrect(), 600);
    }
  }

  function handleGiveUp(): void {
    setRevealed(true);
    setFeedback('wrong');
    shake();
    setTimeout(() => onSkip(), 1200);
  }

  function handleSkip(): void {
    onSkip();
  }

  const borderColor =
    feedback === 'correct' ? COLORS.correct :
    feedback === 'wrong'   ? COLORS.danger  :
    COLORS.border;

  return (
    <View style={styles.card}>

      {/* Progress */}
      <Text style={styles.progress}>{index} / {total}</Text>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round((index / total) * 100)}%` as any }]} />
      </View>

      {/* Word */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <Text style={styles.word}>{word.word}</Text>
        {word.pos ? <Text style={styles.pos}>{word.pos}</Text> : null}
      </Animated.View>

      {/* Answer input */}
      <TextInput
        ref={inputRef}
        style={[styles.input, { borderColor }]}
        value={input}
        onChangeText={handleChange}
        placeholder="Type English translation…"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!revealed && feedback !== 'correct'}
        returnKeyType="done"
      />

      {/* Feedback line */}
      {feedback === 'correct' && (
        <Text style={[styles.feedback, { color: COLORS.correct }]}>✓ Correct!</Text>
      )}
      {feedback === 'wrong' && revealed && (
        <Text style={[styles.feedback, { color: COLORS.danger }]}>
          {word.answers[0]}
        </Text>
      )}
      {feedback === 'idle' && <Text style={styles.feedback} />}

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleSkip}
          disabled={feedback === 'correct'}
        >
          <Text style={styles.btnSecondaryText}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnDanger]}
          onPress={handleGiveUp}
          disabled={feedback !== 'idle'}
        >
          <Text style={styles.btnDangerText}>Give Up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const COLORS = {
  bg:      '#f8f9fa',
  surface: '#ffffff',
  border:  '#dee2e6',
  text:    '#212529',
  muted:   '#6c757d',
  accent:  '#4f8ef7',
  correct: '#22c55e',
  danger:  '#ef4444',
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 28,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  progress: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginBottom: 32,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  word: {
    fontSize: 38,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  pos: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 28,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    marginBottom: 10,
  },
  feedback: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 22,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.muted,
  },
  btnDanger: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  btnDangerText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.danger,
  },
});
