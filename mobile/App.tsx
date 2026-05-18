import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QuizCard, QuizWord } from './components/QuizCard';

// ── Sample words (replace with real API data later) ────────────────────────────

const SAMPLE_WORDS: QuizWord[] = [
  { word: 'hablar',    answers: ['to speak', 'speak'],          pos: 'verb' },
  { word: 'comer',     answers: ['to eat', 'eat'],              pos: 'verb' },
  { word: 'casa',      answers: ['house', 'home'],              pos: 'noun' },
  { word: 'tiempo',    answers: ['time', 'weather'],            pos: 'noun' },
  { word: 'grande',    answers: ['big', 'large', 'great'],      pos: 'adjective' },
  { word: 'correr',    answers: ['to run', 'run'],              pos: 'verb' },
  { word: 'libro',     answers: ['book'],                       pos: 'noun' },
  { word: 'siempre',   answers: ['always'],                     pos: 'adverb' },
  { word: 'conocer',   answers: ['to know', 'to meet'],         pos: 'verb' },
  { word: 'bonito',    answers: ['pretty', 'beautiful', 'nice'], pos: 'adjective' },
];

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [words,   setWords]   = useState<QuizWord[]>(SAMPLE_WORDS);
  const [index,   setIndex]   = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done,    setDone]    = useState(false);

  function advance(): void {
    if (index + 1 >= words.length) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
    }
  }

  function handleCorrect(): void {
    setCorrect(c => c + 1);
    advance();
  }

  function handleSkip(): void {
    advance();
  }

  function restart(): void {
    // Shuffle for replay
    const shuffled = [...SAMPLE_WORDS].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setIndex(0);
    setCorrect(0);
    setDone(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>Quick Vocab</Text>
        <Text style={styles.lang}>🇪🇸  Spanish</Text>
      </View>

      <View style={styles.body}>
        {done ? (
          <View style={styles.summary}>
            <Text style={styles.summaryEmoji}>
              {correct === words.length ? '🎉' : correct >= words.length * 0.7 ? '👍' : '💪'}
            </Text>
            <Text style={styles.summaryScore}>
              {correct} / {words.length}
            </Text>
            <Text style={styles.summaryPct}>
              {Math.round((correct / words.length) * 100)}% correct
            </Text>
            <TouchableOpacity style={styles.restartBtn} onPress={restart}>
              <Text style={styles.restartBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <QuizCard
            word={words[index]}
            index={index + 1}
            total={words.length}
            onCorrect={handleCorrect}
            onSkip={handleSkip}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212529',
    letterSpacing: -0.5,
  },
  lang: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  summary: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  summaryEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  summaryScore: {
    fontSize: 48,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  summaryPct: {
    fontSize: 18,
    color: '#6c757d',
    marginBottom: 40,
  },
  restartBtn: {
    backgroundColor: '#4f8ef7',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  restartBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
