/**
 * register-generator.js
 *
 * Generate formal/informal register variations for Spanish words
 * Helps users understand different contexts for word usage
 */

// Register variations mapping
// Maps base word to { formal, neutral, informal, colloquial }
const registerVariations = {
  // Greetings & Social
  'hola': {
    formal: 'buenos días/tardes/noches',
    neutral: 'hola',
    informal: '¿qué tal?',
    colloquial: '¿ey!'
  },
  'adiós': {
    formal: 'hasta luego',
    neutral: 'adiós',
    informal: 'nos vemos',
    colloquial: 'chao'
  },

  // Common verbs
  'hablar': {
    formal: 'dialogar',
    neutral: 'hablar',
    informal: 'charlar',
    colloquial: 'platicar'
  },
  'comer': {
    formal: 'consumir alimentos',
    neutral: 'comer',
    informal: 'zampar',
    colloquial: 'devorarse'
  },
  'beber': {
    formal: 'consumir bebidas',
    neutral: 'beber',
    informal: 'tragar',
    colloquial: 'emborracharse (si es alcohol)'
  },
  'decir': {
    formal: 'expresar',
    neutral: 'decir',
    informal: 'contar',
    colloquial: 'soltar'
  },
  'dinero': {
    formal: 'fondos',
    neutral: 'dinero',
    informal: 'pasta',
    colloquial: 'guita, pavos'
  },
  'trabajo': {
    formal: 'ocupación',
    neutral: 'trabajo',
    informal: 'curro',
    colloquial: 'laburo'
  },
  'casa': {
    formal: 'vivienda',
    neutral: 'casa',
    informal: 'hogar',
    colloquial: 'casocha'
  },
  'amigo': {
    formal: 'colega',
    neutral: 'amigo',
    informal: 'compa',
    colloquial: 'colega, socio'
  },
  'mujer': {
    formal: 'señora',
    neutral: 'mujer',
    informal: 'chica',
    colloquial: 'tía'
  },
  'hombre': {
    formal: 'caballero',
    neutral: 'hombre',
    informal: 'tipo',
    colloquial: 'tío'
  },
  'niño': {
    formal: 'infante',
    neutral: 'niño',
    informal: 'chaval',
    colloquial: 'críos'
  },
  'chico': {
    formal: 'joven',
    neutral: 'chico',
    informal: 'chaval',
    colloquial: 'mocoso'
  },
  'coche': {
    formal: 'automóvil',
    neutral: 'coche',
    informal: 'carro',
    colloquial: 'máquina'
  },
  'teléfono': {
    formal: 'dispositivo de comunicación',
    neutral: 'teléfono',
    informal: 'móvil',
    colloquial: 'celular'
  },
  'dinero': {
    formal: 'capital',
    neutral: 'dinero',
    informal: 'pasta',
    colloquial: 'guita'
  },
  'no entender': {
    formal: 'no comprendo',
    neutral: 'no entiendo',
    informal: 'no cojo',
    colloquial: 'no pillé'
  },
  'estar bien': {
    formal: 'está en óptimas condiciones',
    neutral: 'está bien',
    informal: 'mola',
    colloquial: 'está guay'
  },
  'estar mal': {
    formal: 'está en malas condiciones',
    neutral: 'está mal',
    informal: 'es un asco',
    colloquial: 'es una mierda'
  },
  'problema': {
    formal: 'inconveniente',
    neutral: 'problema',
    informal: 'rollo',
    colloquial: 'lío'
  },
  'resolver': {
    formal: 'solucionar',
    neutral: 'resolver',
    informal: 'arreglarse',
    colloquial: 'apañarse'
  },
  'dormir': {
    formal: 'descansar',
    neutral: 'dormir',
    informal: 'echarse una siesta',
    colloquial: 'roncas'
  },
  'pedir dinero': {
    formal: 'solicitar fondos',
    neutral: 'pedir dinero',
    informal: 'pedir plata',
    colloquial: 'gorronear'
  },
  'estar cansado': {
    formal: 'encontrarse fatigado',
    neutral: 'estar cansado',
    informal: 'estar hecho polvo',
    colloquial: 'estar molido'
  },
  'no saber': {
    formal: 'desconocer',
    neutral: 'no saber',
    informal: 'ni idea',
    colloquial: 'ni puta idea'
  },
  'entender': {
    formal: 'comprender',
    neutral: 'entender',
    informal: 'coger',
    colloquial: 'pillar'
  },
  'gustar': {
    formal: 'agradar',
    neutral: 'gustar',
    informal: 'molar',
    colloquial: 'encantar'
  },
  'no gustar': {
    formal: 'desagradar',
    neutral: 'no gustar',
    informal: 'no mola',
    colloquial: 'no aguanta'
  },
  'miedo': {
    formal: 'temor',
    neutral: 'miedo',
    informal: 'susto',
    colloquial: 'pánico'
  },
  'tener miedo': {
    formal: 'sentir temor',
    neutral: 'tener miedo',
    informal: 'asustarse',
    colloquial: 'cagarse de miedo'
  },
  'dinero poco': {
    formal: 'fondos limitados',
    neutral: 'poco dinero',
    informal: 'estar en la ruina',
    colloquial: 'estar sin un duro'
  },
};

// Register descriptions for educational purposes
const registerDescriptions = {
  'formal': 'Used in professional, official, or respectful contexts. Academic writing, formal meetings, official documents.',
  'neutral': 'Standard, everyday Spanish used in most situations. Clear and universally understood.',
  'informal': 'Used with friends, family, or in casual settings. More personal and relaxed.',
  'colloquial': 'Slang or regional variations. Specific to certain Spanish-speaking regions or social groups.'
};

/**
 * Get register variations for a word
 * @param {string} word - The Spanish word
 * @returns {object} Register variations
 */
function getRegisterVariations(word) {
  if (registerVariations[word]) {
    return registerVariations[word];
  }
  return null;
}

/**
 * Enrich a word with register information
 * @param {object} word - Word object from vocabulary
 * @returns {object} Enriched word object
 */
function enrichWordWithRegister(word) {
  const enriched = { ...word };

  // Initialize linguistic if not present
  if (!enriched.linguistic) {
    enriched.linguistic = {};
  }

  // Get register variations
  const variations = getRegisterVariations(word.word);

  if (variations) {
    // Add register note
    enriched.linguistic.registers = variations;

    // If we don't have usage notes, add a register note
    if (!enriched.notes || enriched.notes === '') {
      enriched.notes = `Register variations available: ${Object.keys(variations).join(', ')}`;
    }
  }

  // Set default register if not already set
  if (!enriched.linguistic.register) {
    enriched.linguistic.register = 'neutral';
  }

  return enriched;
}

/**
 * Batch process words to add register information
 * @param {array} words - Array of word objects
 * @returns {array} Words with register enrichment
 */
function enrichWordsWithRegister(words) {
  return words.map(word => enrichWordWithRegister(word));
}

/**
 * Generate register summary for documentation
 * @returns {string} Markdown-formatted register guide
 */
function generateRegisterGuide() {
  let guide = '# Spanish Register Variations Guide\n\n';

  Object.entries(registerDescriptions).forEach(([register, description]) => {
    guide += `## ${register.charAt(0).toUpperCase() + register.slice(1)} Register\n`;
    guide += `${description}\n\n`;
  });

  guide += '## Example Words with Register Variations\n\n';

  Object.entries(registerVariations).slice(0, 10).forEach(([word, variations]) => {
    guide += `### ${word}\n`;
    Object.entries(variations).forEach(([register, variant]) => {
      guide += `- **${register}**: ${variant}\n`;
    });
    guide += '\n';
  });

  return guide;
}

export {
  getRegisterVariations,
  enrichWordWithRegister,
  enrichWordsWithRegister,
  generateRegisterGuide,
  registerVariations,
  registerDescriptions
};
