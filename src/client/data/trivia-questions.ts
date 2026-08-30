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
 * Spanish has the full set; Portuguese has a smaller starter batch proving
 * the same question shape carries over to another language. An empty array
 * for any other language is a real, expected state: trivia-mode.ts shows a
 * plain "no questions yet for this language" message rather than an error.
 *
 * ## Three independent difficulty axes
 *
 * `difficulty` (how obscure the fact itself is), `readingDifficulty` (how
 * hard the question's own vocabulary/sentence structure is) and
 * `readingLength` (one short clause vs. a multi-sentence prompt) are
 * deliberately independent — a fact can be common knowledge asked in a
 * dense, multi-clause sentence, or an obscure fact asked in the plainest
 * possible words. Collapsing them into one "difficulty" knob (as the
 * original schema did) couldn't tell "the learner doesn't know this fact"
 * apart from "the learner couldn't parse the question," which are very
 * different problems for a language learner specifically.
 *
 * `domains` reuses the vocabulary word-list's own domain taxonomy (see
 * domain-filter.ts / the `domains` column in the database) wherever a
 * vocabulary domain fits a trivia fact, extended with a handful of
 * trivia-only domains vocabulary never needed: `history`, `literature`,
 * `entertainment`, `culture`.
 *
 * `answerType` classifies what *kind* of thing the answer is (a year, a
 * plain number, a person, a place, or an unclassified "thing" — an object,
 * an event, a style, a language, a currency, ...). trivia-mode.ts's
 * multiple-choice distractor selection prefers same-type distractors so a
 * "Quién...?" question's correct answer (a person) doesn't sit next to an
 * obviously-wrong-shaped option like a bare year.
 */

export type TriviaCategory       = 'history' | 'pop-culture';
export type TriviaDifficulty     = 'easy' | 'medium' | 'hard';
export type ReadingDifficulty    = 'easy' | 'medium' | 'hard';
export type ReadingLength        = 'short' | 'long';
export type AnswerType           = 'year' | 'number' | 'person' | 'place' | 'thing';

export interface TriviaQuestion {
  id:                string;
  category:          TriviaCategory;
  /** How obscure the fact itself is. */
  difficulty:        TriviaDifficulty;
  /** How hard the question's own vocabulary/sentence structure is to read. */
  readingDifficulty: ReadingDifficulty;
  /** One short clause vs. a multi-sentence prompt. */
  readingLength:     ReadingLength;
  /** Topic tags — mostly the vocabulary domain taxonomy, see file header. */
  domains:           string[];
  /** What kind of thing the answer is — drives distractor selection. */
  answerType:        AnswerType;
  questionTarget:    string;
  questionEn:        string;
  answersTarget:     string[];
  answersEn:         string[];
}

const spanish: TriviaQuestion[] = [
  {
    id: 'es-h1', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: '¿En qué año llegó Cristóbal Colón a América?',
    questionEn: 'In what year did Christopher Columbus arrive in the Americas?',
    answersTarget: ['1492'],
    answersEn: ['1492'],
  },
  {
    id: 'es-h2', category: 'history', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: '¿Quién escribió "Don Quijote de la Mancha"?',
    questionEn: 'Who wrote "Don Quixote"?',
    answersTarget: ['Miguel de Cervantes', 'Cervantes'],
    answersEn: ['Miguel de Cervantes', 'Cervantes'],
  },
  {
    id: 'es-h3', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'thing',
    questionTarget: '¿Qué imperio conquistó Hernán Cortés en México?',
    questionEn: 'Which empire did Hernán Cortés conquer in Mexico?',
    answersTarget: ['el imperio azteca', 'los aztecas', 'imperio azteca'],
    answersEn: ['the Aztec Empire', 'the Aztecs', 'Aztec Empire'],
  },
  {
    id: 'es-h4', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'thing',
    questionTarget: '¿Qué imperio conquistó Francisco Pizarro en Perú?',
    questionEn: 'Which empire did Francisco Pizarro conquer in Peru?',
    answersTarget: ['el imperio inca', 'los incas', 'imperio inca'],
    answersEn: ['the Inca Empire', 'the Incas', 'Inca Empire'],
  },
  {
    id: 'es-h5', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history', 'politics'], answerType: 'person',
    questionTarget: '¿Cómo se llamaba el dictador de España entre 1939 y 1975?',
    questionEn: "What was the name of Spain's dictator from 1939 to 1975?",
    answersTarget: ['Francisco Franco', 'Franco'],
    answersEn: ['Francisco Franco', 'Franco'],
  },
  {
    id: 'es-h6', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: '¿En qué año terminó la Guerra Civil Española?',
    questionEn: 'In what year did the Spanish Civil War end?',
    answersTarget: ['1939'],
    answersEn: ['1939'],
  },
  {
    id: 'es-h7', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Cuál es la capital de España?',
    questionEn: 'What is the capital of Spain?',
    answersTarget: ['Madrid'],
    answersEn: ['Madrid'],
  },
  {
    id: 'es-h8', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history', 'politics'], answerType: 'year',
    questionTarget: '¿En qué año entró en circulación el euro en España?',
    questionEn: 'In what year did the euro enter circulation in Spain?',
    answersTarget: ['2002'],
    answersEn: ['2002'],
  },
  {
    id: 'es-h9', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'person',
    questionTarget: '¿Qué explorador portugués lideró la primera expedición en circunnavegar el mundo, aunque murió antes de completarla?',
    questionEn: 'Which Portuguese explorer led the first expedition to circumnavigate the globe, though he died before it was completed?',
    answersTarget: ['Fernando de Magallanes', 'Magallanes'],
    answersEn: ['Ferdinand Magellan', 'Magellan'],
  },
  {
    id: 'es-p1', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['art'], answerType: 'person',
    questionTarget: '¿Quién pintó el cuadro "Guernica"?',
    questionEn: 'Who painted "Guernica"?',
    answersTarget: ['Pablo Picasso', 'Picasso'],
    answersEn: ['Pablo Picasso', 'Picasso'],
  },
  {
    id: 'es-p2', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['art'], answerType: 'person',
    questionTarget: '¿Quién pintó "La persistencia de la memoria" (los relojes blandos)?',
    questionEn: 'Who painted "The Persistence of Memory" (the melting clocks)?',
    answersTarget: ['Salvador Dalí', 'Dalí', 'Dali'],
    answersEn: ['Salvador Dalí', 'Dalí', 'Dali'],
  },
  {
    id: 'es-p3', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['art'], answerType: 'place',
    questionTarget: '¿De qué país es originaria la pintora Frida Kahlo?',
    questionEn: 'Which country was the painter Frida Kahlo from?',
    answersTarget: ['México', 'Mexico'],
    answersEn: ['Mexico'],
  },
  {
    id: 'es-p4', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: '¿Qué escritor colombiano escribió "Cien años de soledad"?',
    questionEn: 'Which Colombian writer wrote "One Hundred Years of Solitude"?',
    answersTarget: ['Gabriel García Márquez', 'García Márquez', 'Garcia Marquez'],
    answersEn: ['Gabriel García Márquez', 'García Márquez', 'Garcia Marquez'],
  },
  {
    id: 'es-p5', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['music', 'geography'], answerType: 'place',
    questionTarget: '¿De qué país es originario el tango?',
    questionEn: 'Which country did the tango originate in?',
    answersTarget: ['Argentina'],
    answersEn: ['Argentina'],
  },
  {
    id: 'es-p6', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿En qué país se encuentra Machu Picchu?',
    questionEn: 'Which country is Machu Picchu in?',
    answersTarget: ['Perú', 'Peru'],
    answersEn: ['Peru'],
  },
  {
    id: 'es-p7', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['sports'], answerType: 'person',
    questionTarget: '¿Qué futbolista argentino, apodado "El Pelusa", ganó el Mundial de 1986?',
    questionEn: 'Which Argentine footballer, nicknamed "El Pelusa", won the 1986 World Cup?',
    answersTarget: ['Diego Maradona', 'Maradona'],
    answersEn: ['Diego Maradona', 'Maradona'],
  },
  {
    id: 'es-p8', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['culture', 'history'], answerType: 'place',
    questionTarget: '¿En qué país se originó la celebración del Día de los Muertos?',
    questionEn: 'Which country did the Day of the Dead celebration originate in?',
    answersTarget: ['México', 'Mexico'],
    answersEn: ['Mexico'],
  },
  {
    id: 'es-p9', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music', 'geography'], answerType: 'place',
    questionTarget: '¿Qué región de España es conocida como la cuna del flamenco?',
    questionEn: 'Which region of Spain is known as the birthplace of flamenco?',
    answersTarget: ['Andalucía', 'Andalusia'],
    answersEn: ['Andalusia', 'Andalucia'],
  },
  {
    id: 'es-p10', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['music', 'geography'], answerType: 'place',
    questionTarget: '¿De qué país es originario el reguetón?',
    questionEn: 'Which country did reggaeton originate in?',
    answersTarget: ['Puerto Rico'],
    answersEn: ['Puerto Rico'],
  },
  {
    id: 'es-p11', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['entertainment'], answerType: 'person',
    questionTarget: '¿Qué director de cine español dirigió "Volver" y "Todo sobre mi madre"?',
    questionEn: 'Which Spanish film director directed "Volver" and "All About My Mother"?',
    answersTarget: ['Pedro Almodóvar', 'Almodóvar', 'Almodovar'],
    answersEn: ['Pedro Almodóvar', 'Almodóvar', 'Almodovar'],
  },

  // ── Easy tier — well-known, single-fact questions ──
  {
    id: 'es-e1', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'thing',
    questionTarget: '¿Qué idioma se habla en España?',
    questionEn: 'What language is spoken in Spain?',
    answersTarget: ['español', 'castellano'],
    answersEn: ['Spanish'],
  },
  {
    id: 'es-e2', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography', 'politics'], answerType: 'thing',
    questionTarget: '¿Cuál es la moneda oficial de España?',
    questionEn: "What is Spain's official currency?",
    answersTarget: ['el euro', 'euro'],
    answersEn: ['the euro', 'euro'],
  },
  {
    id: 'es-e3', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['sports'], answerType: 'thing',
    questionTarget: '¿Qué deporte se juega en el Camp Nou de Barcelona?',
    questionEn: 'What sport is played at Camp Nou in Barcelona?',
    answersTarget: ['el fútbol', 'fútbol'],
    answersEn: ['soccer', 'football'],
  },
  {
    id: 'es-e4', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿En qué continente está España?',
    questionEn: 'What continent is Spain in?',
    answersTarget: ['Europa'],
    answersEn: ['Europe'],
  },
  {
    id: 'es-e5', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Cuál es la capital de México?',
    questionEn: 'What is the capital of Mexico?',
    answersTarget: ['Ciudad de México', 'México D.F.', 'DF'],
    answersEn: ['Mexico City'],
  },
  {
    id: 'es-e6', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography', 'animals'], answerType: 'thing',
    questionTarget: '¿Qué animal es el símbolo nacional de México, presente en su bandera?',
    questionEn: "What animal is Mexico's national symbol, shown on its flag?",
    answersTarget: ['el águila', 'águila'],
    answersEn: ['the eagle', 'eagle'],
  },
  {
    id: 'es-e7', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Qué mar está al lado de España, opuesto al Océano Atlántico?',
    questionEn: 'What sea is next to Spain, opposite the Atlantic Ocean?',
    answersTarget: ['el Mediterráneo', 'Mediterráneo', 'mar Mediterráneo'],
    answersEn: ['the Mediterranean', 'Mediterranean Sea'],
  },

  // ── Second batch ──
  {
    id: 'es-h10', category: 'history', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['history'], answerType: 'person',
    questionTarget: '¿Qué reina española financió el primer viaje de Cristóbal Colón a América?',
    questionEn: "Which Spanish queen financed Christopher Columbus's first voyage to America?",
    answersTarget: ['Isabel la Católica', 'Isabel I'],
    answersEn: ['Isabella I of Castile', 'Isabella the Catholic'],
  },
  {
    id: 'es-h11', category: 'history', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: '¿En qué año murió el dictador español Francisco Franco?',
    questionEn: 'In what year did the Spanish dictator Francisco Franco die?',
    answersTarget: ['1975'],
    answersEn: ['1975'],
  },
  {
    id: 'es-h12', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'thing',
    questionTarget: '¿Qué tratado de 1494 dividió las tierras recién descubiertas entre España y Portugal?',
    questionEn: 'Which 1494 treaty divided the newly discovered lands between Spain and Portugal?',
    answersTarget: ['el Tratado de Tordesillas', 'Tordesillas', 'Tratado de Tordesillas'],
    answersEn: ['the Treaty of Tordesillas', 'Tordesillas'],
  },
  {
    id: 'es-h13', category: 'history', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history', 'politics'], answerType: 'person',
    questionTarget: '¿Qué militar venezolano es conocido como "El Libertador" por su papel en la independencia de varios países sudamericanos?',
    questionEn: 'Which Venezuelan military leader is known as "The Liberator" for his role in several South American countries\' independence?',
    answersTarget: ['Simón Bolívar', 'Bolívar'],
    answersEn: ['Simón Bolívar', 'Bolívar'],
  },
  {
    id: 'es-h14', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Cuál es la capital de Argentina?',
    questionEn: 'What is the capital of Argentina?',
    answersTarget: ['Buenos Aires'],
    answersEn: ['Buenos Aires'],
  },
  {
    id: 'es-h15', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Cuál es la capital de Perú?',
    questionEn: 'What is the capital of Peru?',
    answersTarget: ['Lima'],
    answersEn: ['Lima'],
  },
  {
    id: 'es-h16', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history', 'politics'], answerType: 'year',
    questionTarget: '¿En qué año entró España en la Unión Europea?',
    questionEn: 'In what year did Spain join the European Union?',
    answersTarget: ['1986'],
    answersEn: ['1986'],
  },
  {
    id: 'es-h17', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'person',
    questionTarget: '¿Qué explorador español fue el primer europeo en ver el océano Pacífico desde el continente americano?',
    questionEn: 'Which Spanish explorer was the first European to see the Pacific Ocean from the American continent?',
    answersTarget: ['Vasco Núñez de Balboa', 'Balboa'],
    answersEn: ['Vasco Núñez de Balboa', 'Balboa'],
  },
  {
    id: 'es-p12', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: '¿Qué dramaturgo español escribió "La casa de Bernarda Alba"?',
    questionEn: 'Which Spanish playwright wrote "The House of Bernarda Alba"?',
    answersTarget: ['Federico García Lorca', 'García Lorca', 'Lorca'],
    answersEn: ['Federico García Lorca', 'García Lorca', 'Lorca'],
  },
  {
    id: 'es-p13', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['literature', 'geography'], answerType: 'place',
    questionTarget: '¿En qué país nació el escritor Gabriel García Márquez?',
    questionEn: 'In which country was the writer Gabriel García Márquez born?',
    answersTarget: ['Colombia'],
    answersEn: ['Colombia'],
  },
  {
    id: 'es-p14', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['art'], answerType: 'person',
    questionTarget: '¿Qué pintor español pintó "Las Meninas"?',
    questionEn: 'Which Spanish painter painted "Las Meninas"?',
    answersTarget: ['Diego Velázquez', 'Velázquez'],
    answersEn: ['Diego Velázquez', 'Velázquez'],
  },
  {
    id: 'es-p15', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music'], answerType: 'thing',
    questionTarget: '¿Qué instrumento de percusión es típico del flamenco, además de la guitarra?',
    questionEn: 'Which percussion instrument is typical of flamenco, besides the guitar?',
    answersTarget: ['las castañuelas', 'castañuelas'],
    answersEn: ['castanets', 'the castanets'],
  },
  {
    id: 'es-p16', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: '¿Qué escritora chilena escribió "La casa de los espíritus"?',
    questionEn: 'Which Chilean writer wrote "The House of the Spirits"?',
    answersTarget: ['Isabel Allende', 'Allende'],
    answersEn: ['Isabel Allende', 'Allende'],
  },
  {
    id: 'es-p17', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music', 'culture'], answerType: 'thing',
    questionTarget: '¿Cuál es el baile nacional de Chile?',
    questionEn: 'What is the national dance of Chile?',
    answersTarget: ['la cueca', 'cueca'],
    answersEn: ['the cueca', 'cueca'],
  },
  {
    id: 'es-p18', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['art', 'geography'], answerType: 'place',
    questionTarget: '¿Qué ciudad española es famosa por la Sagrada Familia, diseñada por Antoni Gaudí?',
    questionEn: 'Which Spanish city is famous for the Sagrada Família, designed by Antoni Gaudí?',
    answersTarget: ['Barcelona'],
    answersEn: ['Barcelona'],
  },

  // ── Third batch — proof of concept for the 3-axis difficulty model
  // (Trivia Difficulty × Reading Difficulty × Reading Length), covering a
  // spread of domains and answer types at every combination. ──
  {
    id: 'es-n1', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['food'], answerType: 'thing',
    questionTarget: '¿De qué color son los limones?',
    questionEn: 'What color are lemons?',
    answersTarget: ['amarillo', 'amarillos'],
    answersEn: ['yellow'],
  },
  {
    id: 'es-n2', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['animals'], answerType: 'number',
    questionTarget: '¿Cuántas patas tiene una araña?',
    questionEn: 'How many legs does a spider have?',
    answersTarget: ['ocho', '8'],
    answersEn: ['eight', '8'],
  },
  {
    id: 'es-n3', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['geography'], answerType: 'place',
    questionTarget: 'La Torre Eiffel es uno de los monumentos más visitados del mundo. ¿En qué ciudad se encuentra?',
    questionEn: 'The Eiffel Tower is one of the most visited monuments in the world. What city is it in?',
    answersTarget: ['París', 'Paris'],
    answersEn: ['Paris'],
  },
  {
    id: 'es-n4', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['science', 'nature'], answerType: 'thing',
    questionTarget: 'El sol es la estrella más cercana a la Tierra. ¿De qué color parece el sol visto desde la Tierra?',
    questionEn: 'The sun is the closest star to Earth. What color does the sun appear from Earth?',
    answersTarget: ['amarillo'],
    answersEn: ['yellow'],
  },
  {
    id: 'es-n5', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['body'], answerType: 'number',
    questionTarget: '¿Cuántos huesos tiene aproximadamente el cuerpo humano adulto?',
    questionEn: 'How many bones does the adult human body have, approximately?',
    answersTarget: ['206', 'doscientos seis'],
    answersEn: ['206'],
  },
  {
    id: 'es-n6', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['geography', 'nature'], answerType: 'place',
    questionTarget: '¿Cuál es el océano más grande del planeta?',
    questionEn: 'What is the largest ocean on the planet?',
    answersTarget: ['el océano Pacífico', 'el Pacífico', 'Pacífico'],
    answersEn: ['the Pacific Ocean', 'the Pacific'],
  },
  {
    id: 'es-n7', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['science'], answerType: 'place',
    questionTarget: 'El científico alemán Albert Einstein es conocido por su Teoría de la Relatividad. ¿En qué país nació?',
    questionEn: 'German scientist Albert Einstein is known for his Theory of Relativity. What country was he born in?',
    answersTarget: ['Alemania'],
    answersEn: ['Germany'],
  },
  {
    id: 'es-n8', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['sports'], answerType: 'number',
    questionTarget: 'En un partido de fútbol profesional, cada equipo tiene once jugadores en el campo. ¿Cuántos jugadores hay en total entre los dos equipos, sin contar los suplentes?',
    questionEn: "In a professional soccer match, each team has eleven players on the field. How many players are there in total between both teams, not counting substitutes?",
    answersTarget: ['veintidós', '22'],
    answersEn: ['twenty-two', '22'],
  },
  {
    id: 'es-n9', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['science', 'nature'], answerType: 'thing',
    questionTarget: '¿Cómo se denomina el proceso mediante el cual las plantas producen su propio alimento usando la luz solar?',
    questionEn: 'What is the process called by which plants produce their own food using sunlight?',
    answersTarget: ['la fotosíntesis', 'fotosíntesis'],
    answersEn: ['photosynthesis'],
  },
  {
    id: 'es-n10', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: '¿Cuál es el país más extenso del continente sudamericano?',
    questionEn: 'What is the largest country, by area, on the South American continent?',
    answersTarget: ['Brasil', 'Brazil'],
    answersEn: ['Brazil'],
  },
  {
    id: 'es-n11', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['science', 'nature'], answerType: 'thing',
    questionTarget: 'La fotosíntesis es un proceso fundamental para la vida en la Tierra, mediante el cual los organismos vegetales convierten la energía solar en energía química. ¿Qué gas absorben las plantas durante este proceso?',
    questionEn: 'Photosynthesis is a process fundamental to life on Earth, through which plant organisms convert solar energy into chemical energy. What gas do plants absorb during this process?',
    answersTarget: ['dióxido de carbono', 'el dióxido de carbono', 'CO2'],
    answersEn: ['carbon dioxide', 'CO2'],
  },
  {
    id: 'es-n12', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['body', 'science'], answerType: 'number',
    questionTarget: 'El corazón humano es un órgano fundamental del sistema circulatorio, encargado de bombear la sangre por todo el cuerpo. ¿Cuántas cámaras tiene, en términos generales, el corazón humano?',
    questionEn: "The human heart is a vital organ of the circulatory system, responsible for pumping blood throughout the body. How many chambers does the human heart generally have?",
    answersTarget: ['cuatro', '4'],
    answersEn: ['four', '4'],
  },
  {
    id: 'es-n13', category: 'history', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['history', 'science'], answerType: 'year',
    questionTarget: '¿En qué año llegó el hombre a la Luna por primera vez?',
    questionEn: 'In what year did man first land on the Moon?',
    answersTarget: ['1969'],
    answersEn: ['1969'],
  },
  {
    id: 'es-n14', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography', 'nature'], answerType: 'place',
    questionTarget: '¿Cuál es el río más largo de Sudamérica?',
    questionEn: 'What is the longest river in South America?',
    answersTarget: ['el río Amazonas', 'el Amazonas', 'Amazonas'],
    answersEn: ['the Amazon River', 'the Amazon'],
  },
  {
    id: 'es-n15', category: 'history', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['science', 'history'], answerType: 'person',
    questionTarget: 'Muchos científicos han cambiado la historia con sus descubrimientos. ¿Quién formuló la teoría de la evolución por selección natural?',
    questionEn: 'Many scientists have changed history with their discoveries. Who formulated the theory of evolution by natural selection?',
    answersTarget: ['Charles Darwin', 'Darwin'],
    answersEn: ['Charles Darwin', 'Darwin'],
  },
  {
    id: 'es-n16', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['sports'], answerType: 'number',
    questionTarget: 'El fútbol es el deporte más popular del mundo. ¿Cada cuántos años se celebra la Copa Mundial de fútbol?',
    questionEn: 'Soccer is the most popular sport in the world. Every how many years is the World Cup held?',
    answersTarget: ['cuatro años', 'cada cuatro años', 'cuatro', '4'],
    answersEn: ['every four years', 'four years', '4'],
  },
  {
    id: 'es-n17', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['art'], answerType: 'person',
    questionTarget: '¿Quién pintó la Mona Lisa?',
    questionEn: 'Who painted the Mona Lisa?',
    answersTarget: ['Leonardo da Vinci', 'Da Vinci'],
    answersEn: ['Leonardo da Vinci', 'Da Vinci'],
  },
  {
    id: 'es-n18', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['politics', 'geography'], answerType: 'number',
    questionTarget: '¿Cuántos estados forman actualmente los Estados Unidos?',
    questionEn: 'How many states currently make up the United States?',
    answersTarget: ['cincuenta', '50'],
    answersEn: ['fifty', '50'],
  },
  {
    id: 'es-n19', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['literature'], answerType: 'place',
    questionTarget: 'William Shakespeare es considerado uno de los escritores más influyentes de la lengua inglesa. ¿En qué país nació?',
    questionEn: 'William Shakespeare is considered one of the most influential writers in the English language. What country was he born in?',
    answersTarget: ['Inglaterra', 'Reino Unido'],
    answersEn: ['England', 'the United Kingdom'],
  },
  {
    id: 'es-n20', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['music'], answerType: 'number',
    questionTarget: 'El piano es uno de los instrumentos más versátiles de la música clásica. ¿Cuántas teclas tiene, en total, un piano estándar?',
    questionEn: 'The piano is one of the most versatile instruments in classical music. How many keys does a standard piano have in total?',
    answersTarget: ['ochenta y ocho', '88'],
    answersEn: ['eighty-eight', '88'],
  },
  {
    id: 'es-n21', category: 'history', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['science'], answerType: 'person',
    questionTarget: '¿Quién formuló la teoría general de la relatividad?',
    questionEn: 'Who formulated the general theory of relativity?',
    answersTarget: ['Albert Einstein', 'Einstein'],
    answersEn: ['Albert Einstein', 'Einstein'],
  },
  {
    id: 'es-n22', category: 'history', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['history', 'geography'], answerType: 'place',
    questionTarget: '¿En qué antigua civilización se construyeron las pirámides de Guiza?',
    questionEn: 'In which ancient civilization were the pyramids of Giza built?',
    answersTarget: ['el antiguo Egipto', 'Egipto'],
    answersEn: ['ancient Egypt', 'Egypt'],
  },
  {
    id: 'es-n23', category: 'history', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'person',
    questionTarget: 'A lo largo de la historia, numerosos líderes militares han cambiado el curso de las naciones mediante sus conquistas. ¿Qué emperador francés fue derrotado definitivamente en la batalla de Waterloo en 1815?',
    questionEn: 'Throughout history, numerous military leaders have changed the course of nations through their conquests. Which French emperor was decisively defeated at the Battle of Waterloo in 1815?',
    answersTarget: ['Napoleón Bonaparte', 'Napoleón', 'Napoleon'],
    answersEn: ['Napoleon Bonaparte', 'Napoleon'],
  },
  {
    id: 'es-n24', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['science'], answerType: 'place',
    questionTarget: 'El sistema solar está compuesto por el Sol y los cuerpos celestes que orbitan a su alrededor debido a la fuerza de gravedad. ¿Cuál es el planeta más grande del sistema solar?',
    questionEn: 'The solar system is made up of the Sun and the celestial bodies that orbit it due to the force of gravity. What is the largest planet in the solar system?',
    answersTarget: ['Júpiter', 'Jupiter'],
    answersEn: ['Jupiter'],
  },
  {
    id: 'es-n25', category: 'history', difficulty: 'hard',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: '¿En qué año cayó el Muro de Berlín?',
    questionEn: 'In what year did the Berlin Wall fall?',
    answersTarget: ['1989'],
    answersEn: ['1989'],
  },
  {
    id: 'es-n26', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: '¿Quién escribió la novela "Crimen y castigo"?',
    questionEn: 'Who wrote the novel "Crime and Punishment"?',
    answersTarget: ['Fiódor Dostoyevski', 'Dostoyevski', 'Dostoievski', 'Dostoevsky'],
    answersEn: ['Fyodor Dostoevsky', 'Dostoevsky'],
  },
  {
    id: 'es-n27', category: 'history', difficulty: 'hard',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['science'], answerType: 'person',
    questionTarget: 'Muchos consideran que este científico sentó las bases de la física moderna con sus leyes del movimiento. ¿Cómo se llamaba este científico inglés del siglo diecisiete?',
    questionEn: 'Many consider this scientist to have laid the foundations of modern physics with his laws of motion. What was the name of this seventeenth-century English scientist?',
    answersTarget: ['Isaac Newton', 'Newton'],
    answersEn: ['Isaac Newton', 'Newton'],
  },
  {
    id: 'es-n28', category: 'history', difficulty: 'hard',
    readingDifficulty: 'easy', readingLength: 'long', domains: ['history'], answerType: 'year',
    questionTarget: 'La Revolución Francesa cambió para siempre la historia de Europa y del mundo. ¿En qué año comenzó esta revolución?',
    questionEn: 'The French Revolution forever changed the history of Europe and the world. In what year did this revolution begin?',
    answersTarget: ['1789'],
    answersEn: ['1789'],
  },
  {
    id: 'es-n29', category: 'history', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['science'], answerType: 'person',
    questionTarget: '¿Quién descubrió la penicilina en 1928?',
    questionEn: 'Who discovered penicillin in 1928?',
    answersTarget: ['Alexander Fleming', 'Fleming'],
    answersEn: ['Alexander Fleming', 'Fleming'],
  },
  {
    id: 'es-n30', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['geography', 'nature'], answerType: 'place',
    questionTarget: '¿Cuál es el desierto más grande del mundo, si se cuentan las regiones polares?',
    questionEn: 'What is the largest desert in the world, if polar regions are counted?',
    answersTarget: ['la Antártida', 'la Antártica', 'Antártida'],
    answersEn: ['Antarctica'],
  },
  {
    id: 'es-n31', category: 'history', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['history'], answerType: 'place',
    questionTarget: 'Durante la Guerra Fría, dos superpotencias dominaron la política mundial durante más de cuatro décadas. ¿Qué país, junto a Estados Unidos, protagonizó este enfrentamiento?',
    questionEn: 'During the Cold War, two superpowers dominated world politics for more than four decades. Which country, alongside the United States, was the other side of this standoff?',
    answersTarget: ['la Unión Soviética', 'la URSS', 'Unión Soviética'],
    answersEn: ['the Soviet Union', 'the USSR'],
  },
  {
    id: 'es-n32', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['science'], answerType: 'thing',
    questionTarget: 'La tabla periódica organiza todos los elementos químicos conocidos según sus propiedades. ¿Qué elemento químico tiene el símbolo "Au"?',
    questionEn: 'The periodic table organizes all known chemical elements according to their properties. Which chemical element has the symbol "Au"?',
    answersTarget: ['el oro', 'oro'],
    answersEn: ['gold'],
  },
  {
    id: 'es-n33', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['history', 'literature'], answerType: 'person',
    questionTarget: '¿Qué filósofo griego fue maestro de Alejandro Magno?',
    questionEn: 'Which Greek philosopher was the teacher of Alexander the Great?',
    answersTarget: ['Aristóteles', 'Aristotle'],
    answersEn: ['Aristotle'],
  },
  {
    id: 'es-n34', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: '¿En qué año se firmó el armisticio que puso fin a la Primera Guerra Mundial?',
    questionEn: 'In what year was the armistice signed that ended World War I?',
    answersTarget: ['1918'],
    answersEn: ['1918'],
  },
  {
    id: 'es-n35', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'person',
    questionTarget: 'A comienzos del siglo veinte, un asesinato desencadenó una serie de alianzas militares que arrastraron a gran parte del mundo a un conflicto sin precedentes. ¿Quién era el archiduque austrohúngaro cuyo asesinato en Sarajevo precipitó el estallido de la Primera Guerra Mundial?',
    questionEn: 'In the early twentieth century, an assassination triggered a chain of military alliances that dragged much of the world into an unprecedented conflict. Who was the Austro-Hungarian archduke whose assassination in Sarajevo precipitated the outbreak of World War I?',
    answersTarget: ['Francisco Fernando', 'el archiduque Francisco Fernando', 'Francisco Fernando de Austria'],
    answersEn: ['Archduke Franz Ferdinand', 'Franz Ferdinand'],
  },
  {
    id: 'es-n36', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['science', 'history'], answerType: 'person',
    questionTarget: 'Antes de que se aceptara ampliamente el modelo heliocéntrico, la mayoría de los astrónomos sostenía que la Tierra permanecía inmóvil en el centro del universo. ¿Qué astrónomo polaco propuso, en el siglo dieciséis, que era el Sol y no la Tierra el que ocupaba el centro del sistema planetario?',
    questionEn: 'Before the heliocentric model was widely accepted, most astronomers held that the Earth remained motionless at the center of the universe. Which Polish astronomer proposed, in the sixteenth century, that it was the Sun rather than the Earth that occupied the center of the planetary system?',
    answersTarget: ['Nicolás Copérnico', 'Copérnico', 'Nicolas Copernico'],
    answersEn: ['Nicolaus Copernicus', 'Copernicus'],
  },

  // Pop-culture batch — genuinely entertainment-themed (movies, TV, music,
  // sports, video games) rather than the science/art/geography trivia the
  // earlier "pop-culture" questions above lean on, and tagged with specific
  // domains (movies, tv, music, sports, videogames, internet — plus a
  // 'marvel' co-tag on the two Marvel questions) so the Domains filter can
  // actually slice this category by sub-topic instead of one flat bucket.
  {
    id: 'es-n37', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies'], answerType: 'person',
    questionTarget: '¿Quién dirigió la película "Titanic"?',
    questionEn: 'Who directed the movie "Titanic"?',
    answersTarget: ['James Cameron'],
    answersEn: ['James Cameron'],
  },
  {
    id: 'es-n38', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies', 'marvel'], answerType: 'person',
    questionTarget: '¿Qué actor interpreta a Iron Man en las películas de Marvel?',
    questionEn: 'Which actor plays Iron Man in the Marvel movies?',
    answersTarget: ['Robert Downey Jr.', 'Robert Downey Junior'],
    answersEn: ['Robert Downey Jr.', 'Robert Downey Junior'],
  },
  {
    id: 'es-n39', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies'], answerType: 'person',
    questionTarget: 'En "Star Wars", ¿cómo se llama el hijo de Darth Vader?',
    questionEn: 'In "Star Wars", what is the name of Darth Vader\'s son?',
    answersTarget: ['Luke Skywalker', 'Luke'],
    answersEn: ['Luke Skywalker', 'Luke'],
  },
  {
    id: 'es-n40', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies'], answerType: 'thing',
    questionTarget: '¿Qué estudio de animación creó la película "Toy Story"?',
    questionEn: 'Which animation studio created the movie "Toy Story"?',
    answersTarget: ['Pixar'],
    answersEn: ['Pixar'],
  },
  {
    id: 'es-n41', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['movies'], answerType: 'year',
    questionTarget: 'La película surcoreana "Parásitos" hizo historia en los premios Óscar al ser la primera película de habla no inglesa en ganar el Óscar a Mejor Película. ¿En qué año ganó ese premio?',
    questionEn: 'The South Korean film "Parasite" made history at the Academy Awards as the first non-English-language film to win Best Picture. In what year did it win that award?',
    answersTarget: ['2020'],
    answersEn: ['2020'],
  },
  {
    id: 'es-n42', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['tv', 'literature'], answerType: 'person',
    questionTarget: 'La serie "Juego de Tronos" está basada en una saga de novelas. ¿Quién es su autor?',
    questionEn: 'The TV series "Game of Thrones" is based on a series of novels. Who is their author?',
    answersTarget: ['George R. R. Martin', 'George R.R. Martin', 'George Martin'],
    answersEn: ['George R. R. Martin', 'George R.R. Martin', 'George Martin'],
  },
  {
    id: 'es-n43', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['tv'], answerType: 'number',
    questionTarget: '¿Cuántos personajes principales tiene la serie "Friends"?',
    questionEn: 'How many main characters does the TV series "Friends" have?',
    answersTarget: ['seis', '6'],
    answersEn: ['six', '6'],
  },
  {
    id: 'es-n44', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['tv'], answerType: 'thing',
    questionTarget: '¿Cuál es el apellido de la familia protagonista de "Los Simpson"?',
    questionEn: 'What is the surname of the family at the center of "The Simpsons"?',
    answersTarget: ['Simpson'],
    answersEn: ['Simpson'],
  },
  {
    id: 'es-n45', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['music'], answerType: 'place',
    questionTarget: '¿En qué ciudad británica se formó la banda The Beatles?',
    questionEn: 'In which British city was the band The Beatles formed?',
    answersTarget: ['Liverpool'],
    answersEn: ['Liverpool'],
  },
  {
    id: 'es-n46', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music'], answerType: 'thing',
    questionTarget: '¿Cómo se llama el álbum de Michael Jackson considerado el más vendido de la historia?',
    questionEn: 'What is the name of the Michael Jackson album considered the best-selling of all time?',
    answersTarget: ['Thriller'],
    answersEn: ['Thriller'],
  },
  {
    id: 'es-n47', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['music'], answerType: 'person',
    questionTarget: '¿Quién era el vocalista de la banda Queen?',
    questionEn: 'Who was the lead singer of the band Queen?',
    answersTarget: ['Freddie Mercury'],
    answersEn: ['Freddie Mercury'],
  },
  {
    id: 'es-n48', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['sports'], answerType: 'number',
    questionTarget: 'La Copa Mundial de fútbol se celebra cada cuatro años desde 1930. ¿Cuántas veces ha ganado Brasil este torneo, más que cualquier otro país?',
    questionEn: 'The FIFA World Cup has been held every four years since 1930. How many times has Brazil won the tournament — more than any other country?',
    answersTarget: ['cinco', '5'],
    answersEn: ['five', '5'],
  },
  {
    id: 'es-n49', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['sports'], answerType: 'thing',
    questionTarget: '¿Con qué equipo de la NBA ganó Michael Jordan sus seis campeonatos?',
    questionEn: 'With which NBA team did Michael Jordan win his six championships?',
    answersTarget: ['los Chicago Bulls', 'Chicago Bulls'],
    answersEn: ['the Chicago Bulls', 'Chicago Bulls'],
  },
  {
    id: 'es-n50', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['sports'], answerType: 'thing',
    questionTarget: 'El Balón de Oro es un premio individual muy prestigioso. ¿En qué deporte se entrega?',
    questionEn: 'The Ballon d\'Or is a highly prestigious individual award. In which sport is it given?',
    answersTarget: ['el fútbol', 'fútbol'],
    answersEn: ['football', 'soccer'],
  },
  {
    id: 'es-n51', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['videogames'], answerType: 'person',
    questionTarget: '¿Quién es el diseñador japonés considerado el creador de Mario y Zelda?',
    questionEn: 'Who is the Japanese designer considered the creator of Mario and Zelda?',
    answersTarget: ['Shigeru Miyamoto', 'Miyamoto'],
    answersEn: ['Shigeru Miyamoto', 'Miyamoto'],
  },
  {
    id: 'es-n52', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['videogames'], answerType: 'thing',
    questionTarget: '¿Cuál es el videojuego más vendido de la historia?',
    questionEn: 'What is the best-selling video game of all time?',
    answersTarget: ['Minecraft'],
    answersEn: ['Minecraft'],
  },
  {
    id: 'es-n53', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['videogames'], answerType: 'thing',
    questionTarget: '¿Qué empresa fabrica la consola PlayStation?',
    questionEn: 'Which company makes the PlayStation console?',
    answersTarget: ['Sony'],
    answersEn: ['Sony'],
  },
  {
    id: 'es-n54', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies'], answerType: 'person',
    questionTarget: '¿Qué actor interpretó a Harry Potter en la saga de películas?',
    questionEn: 'Which actor played Harry Potter in the film series?',
    answersTarget: ['Daniel Radcliffe'],
    answersEn: ['Daniel Radcliffe'],
  },
  {
    id: 'es-n55', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['movies', 'marvel'], answerType: 'person',
    questionTarget: '¿Cuál es el nombre real de Spider-Man en el universo de Marvel?',
    questionEn: 'What is Spider-Man\'s real name in the Marvel universe?',
    answersTarget: ['Peter Parker'],
    answersEn: ['Peter Parker'],
  },
  {
    id: 'es-n56', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['movies'], answerType: 'thing',
    questionTarget: 'En 1937, Walt Disney estrenó su primer largometraje de animación, una producción arriesgada que muchos en la industria creían que fracasaría. ¿Cómo se titula esta película, basada en un cuento de los hermanos Grimm?',
    questionEn: 'In 1937, Walt Disney released his first animated feature film, a risky production many in the industry believed would fail. What is this film, based on a tale by the Brothers Grimm, called?',
    answersTarget: ['Blancanieves y los siete enanitos', 'Blancanieves'],
    answersEn: ['Snow White and the Seven Dwarfs', 'Snow White'],
  },
  {
    id: 'es-n57', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['tv'], answerType: 'thing',
    questionTarget: 'En "Breaking Bad", ¿a qué se dedicaba Walter White antes de empezar a fabricar metanfetamina?',
    questionEn: 'In "Breaking Bad", what was Walter White\'s job before he started making methamphetamine?',
    answersTarget: ['era profesor de química', 'profesor de química'],
    answersEn: ['he was a chemistry teacher', 'chemistry teacher'],
  },
  {
    id: 'es-n58', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['music'], answerType: 'person',
    questionTarget: '¿Qué cantante puertorriqueño interpreta la canción "Despacito"?',
    questionEn: 'Which Puerto Rican singer performs the song "Despacito"?',
    answersTarget: ['Luis Fonsi'],
    answersEn: ['Luis Fonsi'],
  },
  {
    id: 'es-n59', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['internet'], answerType: 'person',
    questionTarget: '¿Quién fundó la red social Facebook?',
    questionEn: 'Who founded the social network Facebook?',
    answersTarget: ['Mark Zuckerberg'],
    answersEn: ['Mark Zuckerberg'],
  },
  {
    id: 'es-n60', category: 'pop-culture', difficulty: 'hard',
    readingDifficulty: 'medium', readingLength: 'long', domains: ['movies'], answerType: 'thing',
    questionTarget: 'Dirigida por James Cameron, esta película de ciencia ficción se convirtió en la más taquillera de la historia del cine, superando incluso a otra producción del mismo director. ¿Cómo se llama esta película, ambientada en el planeta Pandora?',
    questionEn: 'Directed by James Cameron, this science-fiction film became the highest-grossing movie of all time, even surpassing another production by the same director. What is this film, set on the planet Pandora, called?',
    answersTarget: ['Avatar'],
    answersEn: ['Avatar'],
  },
];

// Portuguese starter set — a smaller batch than Spanish's, proving the same
// question shape reads fine in another language. Covers both Portugal and
// Brazil, the same way the Spanish set spans Spain and Latin America.
const portuguese: TriviaQuestion[] = [
  {
    id: 'pt-h1', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: 'Qual é a capital de Portugal?',
    questionEn: 'What is the capital of Portugal?',
    answersTarget: ['Lisboa'],
    answersEn: ['Lisbon'],
  },
  {
    id: 'pt-h2', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: 'Qual é a capital do Brasil?',
    questionEn: 'What is the capital of Brazil?',
    answersTarget: ['Brasília'],
    answersEn: ['Brasília', 'Brasilia'],
  },
  {
    id: 'pt-h3', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'person',
    questionTarget: 'Quem foi o navegador português que chegou à Índia por mar em 1498?',
    questionEn: 'Which Portuguese navigator reached India by sea in 1498?',
    answersTarget: ['Vasco da Gama'],
    answersEn: ['Vasco da Gama'],
  },
  {
    id: 'pt-h4', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'year',
    questionTarget: 'Em que ano o Brasil declarou a sua independência de Portugal?',
    questionEn: 'In what year did Brazil declare independence from Portugal?',
    answersTarget: ['1822'],
    answersEn: ['1822'],
  },
  {
    id: 'pt-h5', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history'], answerType: 'person',
    questionTarget: 'Quem foi o navegador que chegou ao Brasil em 1500, em nome de Portugal?',
    questionEn: "Which navigator reached Brazil in 1500, on Portugal's behalf?",
    answersTarget: ['Pedro Álvares Cabral', 'Cabral'],
    answersEn: ['Pedro Álvares Cabral', 'Cabral'],
  },
  {
    id: 'pt-h6', category: 'history', difficulty: 'hard',
    readingDifficulty: 'hard', readingLength: 'long', domains: ['history'], answerType: 'thing',
    questionTarget: 'Qual é o nome do tratado de 1494 que dividiu as terras do Novo Mundo entre Portugal e Espanha?',
    questionEn: 'What is the name of the 1494 treaty that divided the lands of the New World between Portugal and Spain?',
    answersTarget: ['o Tratado de Tordesilhas', 'Tordesilhas', 'Tratado de Tordesilhas'],
    answersEn: ['the Treaty of Tordesillas', 'Tordesillas'],
  },
  {
    id: 'pt-h7', category: 'history', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'place',
    questionTarget: 'Em que continente fica Portugal?',
    questionEn: 'What continent is Portugal in?',
    answersTarget: ['Europa'],
    answersEn: ['Europe'],
  },
  {
    id: 'pt-h8', category: 'history', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['history', 'politics'], answerType: 'person',
    questionTarget: 'Quem foi o primeiro imperador do Brasil, depois da independência?',
    questionEn: 'Who was the first Emperor of Brazil, after independence?',
    answersTarget: ['Dom Pedro I', 'Pedro I'],
    answersEn: ['Dom Pedro I', 'Pedro I'],
  },
  {
    id: 'pt-p1', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['sports'], answerType: 'thing',
    questionTarget: 'Qual é o desporto mais popular no Brasil?',
    questionEn: 'What is the most popular sport in Brazil?',
    answersTarget: ['o futebol', 'futebol'],
    answersEn: ['soccer', 'football'],
  },
  {
    id: 'pt-p2', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: 'Qual escritor português escreveu "Os Lusíadas"?',
    questionEn: 'Which Portuguese writer wrote "The Lusiads"?',
    answersTarget: ['Luís de Camões', 'Camões'],
    answersEn: ['Luís de Camões', 'Camões'],
  },
  {
    id: 'pt-p3', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music'], answerType: 'thing',
    questionTarget: 'Qual é o estilo musical típico de Lisboa, conhecido pela sua melancolia?',
    questionEn: 'What musical style, known for its melancholy, is typical of Lisbon?',
    answersTarget: ['o fado', 'fado'],
    answersEn: ['fado'],
  },
  {
    id: 'pt-p4', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography', 'politics'], answerType: 'thing',
    questionTarget: 'Qual é a moeda oficial de Portugal?',
    questionEn: "What is Portugal's official currency?",
    answersTarget: ['o euro', 'euro'],
    answersEn: ['the euro', 'euro'],
  },
  {
    id: 'pt-p5', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['music', 'culture'], answerType: 'thing',
    questionTarget: 'Qual é o nome da dança e arte marcial brasileira que combina música e movimento?',
    questionEn: 'What is the name of the Brazilian dance-and-martial-art that combines music and movement?',
    answersTarget: ['a capoeira', 'capoeira'],
    answersEn: ['capoeira'],
  },
  {
    id: 'pt-p6', category: 'pop-culture', difficulty: 'medium',
    readingDifficulty: 'medium', readingLength: 'short', domains: ['literature'], answerType: 'person',
    questionTarget: 'Qual escritor português ganhou o Prémio Nobel da Literatura em 1998?',
    questionEn: 'Which Portuguese writer won the Nobel Prize in Literature in 1998?',
    answersTarget: ['José Saramago', 'Saramago'],
    answersEn: ['José Saramago', 'Saramago'],
  },
  {
    id: 'pt-p7', category: 'pop-culture', difficulty: 'easy',
    readingDifficulty: 'easy', readingLength: 'short', domains: ['geography'], answerType: 'thing',
    questionTarget: 'Qual é a língua oficial do Brasil?',
    questionEn: "What is Brazil's official language?",
    answersTarget: ['o português', 'português'],
    answersEn: ['Portuguese'],
  },
];

const TRIVIA_QUESTIONS: Record<string, TriviaQuestion[]> = {
  spanish,
  portuguese,
  italian:    [],
  french:     [],
  german:     [],
  dutch:      [],
};

export function getTriviaQuestions(lang: string): TriviaQuestion[] {
  return TRIVIA_QUESTIONS[lang] ?? [];
}
