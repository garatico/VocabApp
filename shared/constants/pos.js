/**
 * Valid Parts of Speech
 */

export const POS_VALUES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'interjection',
  'particle',
  'determiner'
];

export const POS_LABELS = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  pronoun: 'Pronoun',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  article: 'Article',
  interjection: 'Interjection',
  particle: 'Particle',
  determiner: 'Determiner'
};

export const isValidPOS = (pos) => POS_VALUES.includes(pos);

export default {
  POS_VALUES,
  POS_LABELS,
  isValidPOS
};
