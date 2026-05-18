/**
 * Home screen — language and word-count selection, then Start Quiz.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { LANGUAGES, WORD_COUNTS, type Language, type WordCount } from '../lib/types';

export default function HomeScreen() {
  const [lang,  setLang]  = useState<Language>('spanish');
  const [size,  setSize]  = useState<WordCount>(1000);

  function startQuiz() {
    router.push({
      pathname: '/quiz',
      params:   { lang, size: String(size) },
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Quick Vocab' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Language ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Language</Text>
          <View style={styles.chipRow}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.value}
                style={[styles.chip, lang === l.value && styles.chipActive]}
                onPress={() => setLang(l.value)}
              >
                <Text style={styles.chipFlag}>{l.flag}</Text>
                <Text style={[styles.chipText, lang === l.value && styles.chipTextActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Word count ───────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Word count</Text>
          <View style={styles.chipRow}>
            {([...WORD_COUNTS, 'max'] as WordCount[]).map(n => (
              <TouchableOpacity
                key={String(n)}
                style={[styles.chip, styles.chipCompact, size === n && styles.chipActive]}
                onPress={() => setSize(n)}
              >
                <Text style={[styles.chipText, size === n && styles.chipTextActive]}>
                  {n === 'max' ? 'Max' : n.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Start button ─────────────────────────────────── */}
        <TouchableOpacity style={styles.startBtn} onPress={startQuiz} activeOpacity={0.85}>
          <Text style={styles.startBtnText}>Start Quiz</Text>
        </TouchableOpacity>
      </ScrollView>
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
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding:  24,
    gap:      28,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontSize:      13,
    fontWeight:    '600',
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  chip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius:   10,
    borderWidth:    1.5,
    borderColor:    C.border,
    backgroundColor: C.white,
  },
  chipCompact: {
    paddingHorizontal: 14,
  },
  chipActive: {
    borderColor:     C.accent,
    backgroundColor: C.accent,
  },
  chipFlag: {
    fontSize: 16,
  },
  chipText: {
    fontSize:   15,
    fontWeight: '500',
    color:      C.text,
  },
  chipTextActive: {
    color: C.white,
  },
  startBtn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius:    14,
    alignItems:      'center',
    marginTop:       8,
    shadowColor:     C.accent,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       4,
  },
  startBtnText: {
    color:      C.white,
    fontSize:   18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
