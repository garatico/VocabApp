/**
 * example-generator.js
 *
 * Template-based example sentence generation
 * Creates usage examples for Spanish vocabulary words
 */

// Example sentence templates organized by part of speech
const exampleTemplates = {
  // Noun templates
  'noun': [
    'El {{word}} está en la mesa.',
    'Tengo un {{word}} nuevo.',
    'No veo el {{word}}.',
    'El {{word}} es importante.',
    'Compré un {{word}} ayer.',
    '¿Dónde está el {{word}}?',
    'Este {{word}} es mejor.',
    'El {{word}} no funciona.',
    'Necesito un {{word}} para...',
    'El {{word}} que vi fue hermoso.',
  ],

  // Verb templates
  'verb': [
    'Yo {{word}} cada día.',
    'Ellos {{word}} ayer.',
    'Nosotros {{word}} juntos.',
    'Ella {{word}} con entusiasmo.',
    '¿Quieres {{word}} conmigo?',
    'Tengo que {{word}} ahora.',
    'Empecé a {{word}} hace poco.',
    'Siempre {{word}} en la mañana.',
    'No puedo {{word}} eso.',
    'Debo {{word}} más rápido.',
  ],

  // Adjective templates
  'adjective': [
    'El {{word}} {{gender_default:o}} es muy bonito.',
    'Esta casa es {{word}}.',
    'No es {{word}}, es lo opuesto.',
    'Me gusta lo {{word}}.',
    'Es {{word}} comparado con otros.',
    'Se ve muy {{word}}.',
    '¿Es {{word}} o no?',
    'Algo {{word}} pasó hoy.',
    'Lo {{word}} es mejor.',
    'Encontré algo {{word}}.',
  ],

  // Preposition templates
  'preposition': [
    'La mesa está {{word}} la silla.',
    'Caminamos {{word}} el parque.',
    'Viajamos {{word}} Barcelona.',
    'Estoy {{word}} casa.',
    'Habló {{word}} nosotros.',
    'El libro está {{word}} el escritorio.',
    'Saltó {{word}} el río.',
    'Trabajo {{word}} lunes.',
    'Dormí {{word}} las nueve.',
    'Es necesario {{word}} la salud.',
  ],

  // Adverb templates
  'adverb': [
    'Hablamos {{word}}.',
    'Corrió {{word}} hacia la puerta.',
    'Casi {{word}} me olvido.',
    'Trabajó {{word}} todo el día.',
    '{{word}} es muy importante.',
    'Actuó {{word}} en la situación.',
    'Lo hizo {{word}} sin problemas.',
    'Llegó {{word}} a tiempo.',
    'Habla {{word}} con claridad.',
    'Respondió {{word}} a la pregunta.',
  ]
};

// Part-of-speech-specific example patterns
const posSpecificPatterns = {
  'common_nouns': [
    'Vi un {{word}} en el parque.',
    'El {{word}} que compraste es de buena calidad.',
    'Hay muchos {{word}} aquí.',
    'Necesitamos {{word}} para la actividad.',
    'El {{word}} tiene un color bonito.',
  ],

  'proper_nouns': [
    '{{word}} es un lugar hermoso.',
    'Viajé a {{word}} el año pasado.',
    '{{word}} está lejos de aquí.',
  ],

  'countable_nouns': [
    'Hay tres {{word}} en el escritorio.',
    'Compré dos {{word}} en el mercado.',
    'Me prestó cinco {{word}}.',
  ],

  'uncountable_nouns': [
    'Necesito más {{word}}.',
    'Hay mucho {{word}} aquí.',
    'El {{word}} es esencial.',
  ],

  'transitive_verbs': [
    'Él {{word}} un libro ayer.',
    'Ellos {{word}} la puerta con cuidado.',
    '¿Puedes {{word}} esto?',
  ],

  'intransitive_verbs': [
    'El gato {{word}} en el tejado.',
    'Nosotros {{word}} en el parque.',
    'Ella {{word}} toda la noche.',
  ],

  'reflexive_verbs': [
    'Yo {{word}} cada mañana.',
    'Ellos {{word}} antes de dormir.',
    'Ella {{word}} en el espejo.',
  ],

  'regular_adjectives': [
    'El día está {{word}}.',
    'Tiene un color {{word}}.',
    'Es muy {{word}} ese regalo.',
  ],

  'comparative_adjectives': [
    'Este es más {{word}} que aquel.',
    'Ella es menos {{word}} que él.',
    'Mi casa es tan {{word}} como la tuya.',
  ],

  'superlative_adjectives': [
    'Es el más {{word}} de la clase.',
    'Esa es la menos {{word}}.',
    'El mejor {{word}} está aquí.',
  ]
};

/**
 * Get example templates for a word based on POS
 * @param {string} pos - Part of speech
 * @returns {array} Array of example templates
 */
function getExampleTemplates(pos) {
  // Map common POS to templates
  const posMap = {
    'noun': 'noun',
    'sustantivo': 'noun',
    'verb': 'verb',
    'verbo': 'verb',
    'adjective': 'adjective',
    'adjetivo': 'adjective',
    'adverb': 'adverb',
    'adverbio': 'adverb',
    'preposition': 'preposition',
    'preposición': 'preposition',
    'conjunction': 'verb', // fallback
    'article': 'noun', // fallback
    'pronoun': 'noun', // fallback
  };

  const normalizedPos = posMap[pos.toLowerCase()] || 'noun';
  return exampleTemplates[normalizedPos] || exampleTemplates['noun'];
}

/**
 * Generate example sentences for a word
 * @param {string} word - The Spanish word
 * @param {string} pos - Part of speech
 * @returns {array} Array of example sentences
 */
function generateExamples(word, pos = 'noun') {
  const templates = getExampleTemplates(pos);

  // Select 2-3 random templates
  const selectedTemplates = [];
  const shuffled = [...templates].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(3, shuffled.length); i++) {
    selectedTemplates.push(shuffled[i]);
  }

  // Replace {{word}} placeholder with actual word
  return selectedTemplates.map(template => {
    return template.replace(/\{\{word\}\}/g, word)
                   .replace(/\{\{gender_default:o\}\}/g, 'o'); // Default to masculine
  });
}

/**
 * Enrich a word with examples
 * @param {object} word - Word object from vocabulary
 * @returns {object} Enriched word object
 */
function enrichWordWithExamples(word) {
  const enriched = { ...word };

  // Generate examples if missing
  if (!enriched.examples || enriched.examples.length === 0) {
    const pos = word.pos || 'noun';
    enriched.examples = generateExamples(word.word, pos);
  }

  return enriched;
}

/**
 * Batch process words to add examples
 * @param {array} words - Array of word objects
 * @returns {array} Words with example enrichment
 */
function enrichWordsWithExamples(words) {
  return words.map(word => enrichWordWithExamples(word));
}

/**
 * Generate usage note based on word characteristics
 * @param {object} word - Word object
 * @returns {string} Usage note
 */
function generateUsageNote(word) {
  let note = '';

  const pos = word.pos || 'noun';
  const difficulty = word.difficulty || 1;

  // Basic usage guidance
  if (pos === 'verb') {
    if (word.linguistic?.reflexive) {
      note = `This is a reflexive verb, meaning it's used with reflexive pronouns (me, te, se, nos, os, se). Example: "Se despierta temprano."`;
    } else {
      note = `This is a regular ${pos}. Use it in context with nouns and subjects.`;
    }
  } else if (pos === 'adjective') {
    note = `This adjective is used to describe ${word.linguistic?.gender || 'masculine and feminine'} nouns.`;
  } else if (pos === 'preposition') {
    note = `This preposition is used to indicate relationships between words. Often follows specific verbs.`;
  } else {
    note = `This is a ${pos.toLowerCase()}. Context-dependent usage.`;
  }

  // Add difficulty note
  if (difficulty === 1) {
    note += ` Essential for beginners.`;
  } else if (difficulty <= 2) {
    note += ` Common in early learning.`;
  }

  return note;
}

/**
 * Generate complete enrichment for a word
 * @param {object} word - Word object from vocabulary
 * @returns {object} Fully enriched word object
 */
function enrichWordComplete(word) {
  let enriched = enrichWordWithExamples(word);

  // Add usage note if missing
  if (!enriched.notes || enriched.notes === '') {
    enriched.notes = generateUsageNote(enriched);
  }

  return enriched;
}

export {
  generateExamples,
  getExampleTemplates,
  enrichWordWithExamples,
  enrichWordsWithExamples,
  enrichWordComplete,
  generateUsageNote,
  exampleTemplates,
  posSpecificPatterns
};
