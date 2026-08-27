/**
 * trivia-questions.ts — general-knowledge trivia (history, pop culture),
 * hand-written per language rather than derived from the vocabulary.
 *
 * The question is always asked in the target language. `answersTarget` and
 * `answersEn` are both accepted when typing a free-text answer — the
 * learner can answer in either language, they don't have to match the
 * question's language — matched case/accent/punctuation-insensitively (see
 * trivia-mode.ts's `normalize`-based check). List every reasonable spelling
 * variant (with/without accents, first-name-only, etc.) since there's no
 * fuzzy distance check here the way Recall mode has for vocabulary.
 *
 * `answersTarget[0]` is also the canonical form multiple-choice mode shows
 * and reveals — put the most natural rendering first.
 *
 * Only Spanish has a set so far — see project notes. An empty array for any
 * other language is a real, expected state: trivia-mode.ts shows a plain
 * "no questions yet for this language" message rather than an error.
 */

export type TriviaCategory = 'history' | 'pop-culture';
export type TriviaDifficulty = 'easy' | 'medium' | 'hard';

export interface TriviaQuestion {
  id:             string;
  category:       TriviaCategory;
  difficulty:     TriviaDifficulty;
  questionTarget: string;
  questionEn:     string;
  answersTarget:  string[];
  answersEn:      string[];
}

const spanish: TriviaQuestion[] = [
  {
    id: 'es-h1',
    category: 'history',
    difficulty: 'easy',
    questionTarget: '¿En qué año llegó Cristóbal Colón a América?',
    questionEn: 'In what year did Christopher Columbus arrive in the Americas?',
    answersTarget: ['1492'],
    answersEn: ['1492'],
  },
  {
    id: 'es-h2',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿Quién escribió "Don Quijote de la Mancha"?',
    questionEn: 'Who wrote "Don Quixote"?',
    answersTarget: ['Miguel de Cervantes', 'Cervantes'],
    answersEn: ['Miguel de Cervantes', 'Cervantes'],
  },
  {
    id: 'es-h3',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿Qué imperio conquistó Hernán Cortés en México?',
    questionEn: 'Which empire did Hernán Cortés conquer in Mexico?',
    answersTarget: ['el imperio azteca', 'los aztecas', 'imperio azteca'],
    answersEn: ['the Aztec Empire', 'the Aztecs', 'Aztec Empire'],
  },
  {
    id: 'es-h4',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿Qué imperio conquistó Francisco Pizarro en Perú?',
    questionEn: 'Which empire did Francisco Pizarro conquer in Peru?',
    answersTarget: ['el imperio inca', 'los incas', 'imperio inca'],
    answersEn: ['the Inca Empire', 'the Incas', 'Inca Empire'],
  },
  {
    id: 'es-h5',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿Cómo se llamaba el dictador de España entre 1939 y 1975?',
    questionEn: "What was the name of Spain's dictator from 1939 to 1975?",
    answersTarget: ['Francisco Franco', 'Franco'],
    answersEn: ['Francisco Franco', 'Franco'],
  },
  {
    id: 'es-h6',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿En qué año terminó la Guerra Civil Española?',
    questionEn: 'In what year did the Spanish Civil War end?',
    answersTarget: ['1939'],
    answersEn: ['1939'],
  },
  {
    id: 'es-h7',
    category: 'history',
    difficulty: 'easy',
    questionTarget: '¿Cuál es la capital de España?',
    questionEn: 'What is the capital of Spain?',
    answersTarget: ['Madrid'],
    answersEn: ['Madrid'],
  },
  {
    id: 'es-h8',
    category: 'history',
    difficulty: 'medium',
    questionTarget: '¿En qué año entró en circulación el euro en España?',
    questionEn: 'In what year did the euro enter circulation in Spain?',
    answersTarget: ['2002'],
    answersEn: ['2002'],
  },
  {
    id: 'es-h9',
    category: 'history',
    difficulty: 'hard',
    questionTarget: '¿Qué explorador portugués lideró la primera expedición en circunnavegar el mundo, aunque murió antes de completarla?',
    questionEn: 'Which Portuguese explorer led the first expedition to circumnavigate the globe, though he died before it was completed?',
    answersTarget: ['Fernando de Magallanes', 'Magallanes'],
    answersEn: ['Ferdinand Magellan', 'Magellan'],
  },
  {
    id: 'es-p1',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿Quién pintó el cuadro "Guernica"?',
    questionEn: 'Who painted "Guernica"?',
    answersTarget: ['Pablo Picasso', 'Picasso'],
    answersEn: ['Pablo Picasso', 'Picasso'],
  },
  {
    id: 'es-p2',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿Quién pintó "La persistencia de la memoria" (los relojes blandos)?',
    questionEn: 'Who painted "The Persistence of Memory" (the melting clocks)?',
    answersTarget: ['Salvador Dalí', 'Dalí', 'Dali'],
    answersEn: ['Salvador Dalí', 'Dalí', 'Dali'],
  },
  {
    id: 'es-p3',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿De qué país es originaria la pintora Frida Kahlo?',
    questionEn: 'Which country was the painter Frida Kahlo from?',
    answersTarget: ['México', 'Mexico'],
    answersEn: ['Mexico'],
  },
  {
    id: 'es-p4',
    category: 'pop-culture',
    difficulty: 'hard',
    questionTarget: '¿Qué escritor colombiano escribió "Cien años de soledad"?',
    questionEn: 'Which Colombian writer wrote "One Hundred Years of Solitude"?',
    answersTarget: ['Gabriel García Márquez', 'García Márquez', 'Garcia Marquez'],
    answersEn: ['Gabriel García Márquez', 'García Márquez', 'Garcia Marquez'],
  },
  {
    id: 'es-p5',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿De qué país es originario el tango?',
    questionEn: 'Which country did the tango originate in?',
    answersTarget: ['Argentina'],
    answersEn: ['Argentina'],
  },
  {
    id: 'es-p6',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿En qué país se encuentra Machu Picchu?',
    questionEn: 'Which country is Machu Picchu in?',
    answersTarget: ['Perú', 'Peru'],
    answersEn: ['Peru'],
  },
  {
    id: 'es-p7',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿Qué futbolista argentino, apodado "El Pelusa", ganó el Mundial de 1986?',
    questionEn: 'Which Argentine footballer, nicknamed "El Pelusa", won the 1986 World Cup?',
    answersTarget: ['Diego Maradona', 'Maradona'],
    answersEn: ['Diego Maradona', 'Maradona'],
  },
  {
    id: 'es-p8',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿En qué país se originó la celebración del Día de los Muertos?',
    questionEn: 'Which country did the Day of the Dead celebration originate in?',
    answersTarget: ['México', 'Mexico'],
    answersEn: ['Mexico'],
  },
  {
    id: 'es-p9',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿Qué región de España es conocida como la cuna del flamenco?',
    questionEn: 'Which region of Spain is known as the birthplace of flamenco?',
    answersTarget: ['Andalucía', 'Andalusia'],
    answersEn: ['Andalusia', 'Andalucia'],
  },
  {
    id: 'es-p10',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿De qué país es originario el reguetón?',
    questionEn: 'Which country did reggaeton originate in?',
    answersTarget: ['Puerto Rico'],
    answersEn: ['Puerto Rico'],
  },
  {
    id: 'es-p11',
    category: 'pop-culture',
    difficulty: 'medium',
    questionTarget: '¿Qué director de cine español dirigió "Volver" y "Todo sobre mi madre"?',
    questionEn: 'Which Spanish film director directed "Volver" and "All About My Mother"?',
    answersTarget: ['Pedro Almodóvar', 'Almodóvar', 'Almodovar'],
    answersEn: ['Pedro Almodóvar', 'Almodóvar', 'Almodovar'],
  },

  // ── Easy tier — well-known, single-fact questions ──
  {
    id: 'es-e1',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Qué idioma se habla en España?',
    questionEn: 'What language is spoken in Spain?',
    answersTarget: ['español', 'castellano'],
    answersEn: ['Spanish'],
  },
  {
    id: 'es-e2',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Cuál es la moneda oficial de España?',
    questionEn: "What is Spain's official currency?",
    answersTarget: ['el euro', 'euro'],
    answersEn: ['the euro', 'euro'],
  },
  {
    id: 'es-e3',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Qué deporte se juega en el Camp Nou de Barcelona?',
    questionEn: 'What sport is played at Camp Nou in Barcelona?',
    answersTarget: ['el fútbol', 'fútbol'],
    answersEn: ['soccer', 'football'],
  },
  {
    id: 'es-e4',
    category: 'history',
    difficulty: 'easy',
    questionTarget: '¿En qué continente está España?',
    questionEn: 'What continent is Spain in?',
    answersTarget: ['Europa'],
    answersEn: ['Europe'],
  },
  {
    id: 'es-e5',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Cuál es la capital de México?',
    questionEn: 'What is the capital of Mexico?',
    answersTarget: ['Ciudad de México', 'México D.F.', 'DF'],
    answersEn: ['Mexico City'],
  },
  {
    id: 'es-e6',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Qué animal es el símbolo nacional de México, presente en su bandera?',
    questionEn: "What animal is Mexico's national symbol, shown on its flag?",
    answersTarget: ['el águila', 'águila'],
    answersEn: ['the eagle', 'eagle'],
  },
  {
    id: 'es-e7',
    category: 'pop-culture',
    difficulty: 'easy',
    questionTarget: '¿Qué mar está al lado de España, opuesto al Océano Atlántico?',
    questionEn: "What sea is next to Spain, opposite the Atlantic Ocean?",
    answersTarget: ['el Mediterráneo', 'Mediterráneo', 'mar Mediterráneo'],
    answersEn: ['the Mediterranean', 'Mediterranean Sea'],
  },
];

const TRIVIA_QUESTIONS: Record<string, TriviaQuestion[]> = {
  spanish,
  portuguese: [],
  italian:    [],
  french:     [],
  german:     [],
  dutch:      [],
};

export function getTriviaQuestions(lang: string): TriviaQuestion[] {
  return TRIVIA_QUESTIONS[lang] ?? [];
}
