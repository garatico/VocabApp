/**
 * guess-blank-questions.ts — "Guess the Blank": clues about an object,
 * person, place or animal; the learner guesses the target-language word.
 *
 * Proof of concept, modeled directly on trivia-questions.ts: hand-written per
 * language, Spanish-only for now. Clues are ordered weakest-first — vaguest
 * clue shown alone, more specific ones revealed on request (see
 * guess-blank-mode.ts) — rather than all shown at once, so the guess is
 * worth something even before every clue is out.
 *
 * `difficulty` covers both halves of what makes a question hard: the target
 * word itself (a beginner noun like "gato" vs. a specific dish like
 * "paella") and the clue language (short, simple sentences using common
 * words vs. longer or more idiomatic ones). 'easy' entries keep both
 * simple; 'medium'/'hard' can lean on either.
 *
 * `answerTarget`/`answerEn` are both accepted, matched the same
 * case/accent/punctuation-insensitive way trivia-mode.ts's questions are.
 */

export type BlankCategory = 'animal' | 'object' | 'place' | 'person' | 'food';
export type BlankDifficulty = 'easy' | 'medium' | 'hard';

export interface GuessBlankQuestion {
  id:           string;
  category:     BlankCategory;
  difficulty:   BlankDifficulty;
  /** Weakest clue first. 2-4 per question. */
  cluesTarget:  string[];
  cluesEn:      string[];
  answerTarget: string;
  answerEn:     string;
}

const spanish: GuessBlankQuestion[] = [
  {
    id: 'es-b1',
    category: 'animal',
    difficulty: 'medium',
    cluesTarget: [
      'Vivo en la selva y me gustan los plátanos.',
      'Tengo brazos largos y trepo a los árboles.',
      'Me parezco mucho a los humanos.',
    ],
    cluesEn: [
      'I live in the jungle and I like bananas.',
      'I have long arms and I climb trees.',
      'I look a lot like humans.',
    ],
    answerTarget: 'el mono',
    answerEn: 'the monkey',
  },
  {
    id: 'es-b2',
    category: 'animal',
    difficulty: 'medium',
    cluesTarget: [
      'Soy el rey de la selva.',
      'Tengo una gran melena alrededor de la cara.',
      'Rujo muy fuerte para asustar a otros animales.',
    ],
    cluesEn: [
      "I'm the king of the jungle.",
      'I have a big mane around my face.',
      'I roar loudly to scare other animals.',
    ],
    answerTarget: 'el león',
    answerEn: 'the lion',
  },
  {
    id: 'es-b3',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Me usas todos los días para ver la hora.',
      'A veces me llevas en la muñeca.',
      'Tengo manecillas o una pantalla con números.',
    ],
    cluesEn: [
      'You use me every day to see the time.',
      'Sometimes you wear me on your wrist.',
      'I have hands, or a screen with numbers.',
    ],
    answerTarget: 'el reloj',
    answerEn: 'the clock',
  },
  {
    id: 'es-b4',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Me abres para leerme, pero no tengo pantalla.',
      'Estoy hecho de muchas hojas de papel.',
      'Puedo contar una historia larga.',
    ],
    cluesEn: [
      'You open me to read me, but I have no screen.',
      "I'm made of many sheets of paper.",
      'I can tell a long story.',
    ],
    answerTarget: 'el libro',
    answerEn: 'the book',
  },
  {
    id: 'es-b5',
    category: 'place',
    difficulty: 'medium',
    cluesTarget: [
      'Soy un edificio muy alto en el centro de la ciudad.',
      'Tengo muchos pisos y ascensores.',
      'La gente trabaja o vive dentro de mí.',
    ],
    cluesEn: [
      "I'm a very tall building in the city center.",
      'I have many floors and elevators.',
      'People work or live inside me.',
    ],
    answerTarget: 'el rascacielos',
    answerEn: 'the skyscraper',
  },
  {
    id: 'es-b6',
    category: 'place',
    difficulty: 'medium',
    cluesTarget: [
      'Soy un lugar donde compras comida fresca.',
      'Tengo muchos puestos con frutas, verduras y carne.',
      'Suelo estar al aire libre o bajo un techo grande.',
    ],
    cluesEn: [
      'I am a place where you buy fresh food.',
      'I have many stalls with fruit, vegetables and meat.',
      "I'm usually outdoors or under one big roof.",
    ],
    answerTarget: 'el mercado',
    answerEn: 'the market',
  },
  {
    id: 'es-b7',
    category: 'person',
    difficulty: 'medium',
    cluesTarget: [
      'Trabajo en un hospital o una clínica.',
      'Ayudo a las personas cuando están enfermas.',
      'Uso una bata blanca y a veces un estetoscopio.',
    ],
    cluesEn: [
      'I work in a hospital or a clinic.',
      'I help people when they are sick.',
      'I wear a white coat and sometimes a stethoscope.',
    ],
    answerTarget: 'el médico',
    answerEn: 'the doctor',
  },
  {
    id: 'es-b8',
    category: 'person',
    difficulty: 'medium',
    cluesTarget: [
      'Trabajo en una escuela.',
      'Explico las lecciones y corrijo tareas.',
      'Tengo muchos estudiantes en mi clase.',
    ],
    cluesEn: [
      'I work in a school.',
      'I explain lessons and grade homework.',
      'I have many students in my class.',
    ],
    answerTarget: 'el profesor',
    answerEn: 'the teacher',
  },
  {
    id: 'es-b9',
    category: 'food',
    difficulty: 'medium',
    cluesTarget: [
      'Soy redonda y normalmente roja o verde.',
      'Crezco en un árbol.',
      'Un dicho dice que una al día mantiene al médico lejos.',
    ],
    cluesEn: [
      "I'm round and usually red or green.",
      'I grow on a tree.',
      'A saying claims one a day keeps the doctor away.',
    ],
    answerTarget: 'la manzana',
    answerEn: 'the apple',
  },
  {
    id: 'es-b10',
    category: 'food',
    difficulty: 'hard',
    cluesTarget: [
      'Soy un plato español muy famoso.',
      'Llevo arroz, azafrán y varios tipos de marisco o carne.',
      'Se cocina y se sirve en una sartén grande y plana.',
    ],
    cluesEn: [
      'I am a very famous Spanish dish.',
      'I have rice, saffron and various kinds of seafood or meat.',
      'I am cooked and served in a large, flat pan.',
    ],
    answerTarget: 'la paella',
    answerEn: 'paella',
  },
  {
    id: 'es-b11',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Me llevas cuando llueve.',
      'Tengo una tela redonda sobre un mango.',
      'Te protejo del agua cuando te abro sobre la cabeza.',
    ],
    cluesEn: [
      'You carry me when it rains.',
      'I have round fabric over a handle.',
      'I protect you from water when you open me over your head.',
    ],
    answerTarget: 'el paraguas',
    answerEn: 'the umbrella',
  },
  {
    id: 'es-b12',
    category: 'animal',
    difficulty: 'medium',
    cluesTarget: [
      'Vivo en el mar y tengo ocho brazos.',
      'Puedo cambiar de color para esconderme.',
      'Expulso tinta cuando tengo miedo.',
    ],
    cluesEn: [
      'I live in the sea and I have eight arms.',
      'I can change color to hide.',
      'I squirt ink when I am scared.',
    ],
    answerTarget: 'el pulpo',
    answerEn: 'the octopus',
  },

  // ── Easy tier — beginner words, short simple-present clues ──
  {
    id: 'es-e1',
    category: 'animal',
    difficulty: 'easy',
    cluesTarget: [
      'Soy un animal pequeño.',
      'Digo "miau".',
      'Vivo en tu casa.',
    ],
    cluesEn: [
      "I'm a small animal.",
      'I say "meow".',
      'I live in your house.',
    ],
    answerTarget: 'el gato',
    answerEn: 'the cat',
  },
  {
    id: 'es-e2',
    category: 'animal',
    difficulty: 'easy',
    cluesTarget: [
      'Soy un animal.',
      'Digo "guau".',
      'Soy el mejor amigo del hombre.',
    ],
    cluesEn: [
      "I'm an animal.",
      'I say "woof".',
      "I'm man's best friend.",
    ],
    answerTarget: 'el perro',
    answerEn: 'the dog',
  },
  {
    id: 'es-e3',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Soy un mueble.',
      'Te sientas en mí.',
      'Tengo cuatro patas.',
    ],
    cluesEn: [
      "I'm a piece of furniture.",
      'You sit on me.',
      'I have four legs.',
    ],
    answerTarget: 'la silla',
    answerEn: 'the chair',
  },
  {
    id: 'es-e4',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Soy de color amarillo.',
      'Doy luz durante el día.',
      'Estoy en el cielo.',
    ],
    cluesEn: [
      "I'm yellow.",
      'I give light during the day.',
      "I'm in the sky.",
    ],
    answerTarget: 'el sol',
    answerEn: 'the sun',
  },
  {
    id: 'es-e5',
    category: 'food',
    difficulty: 'easy',
    cluesTarget: [
      'Soy una fruta.',
      'Soy amarillo y largo.',
      'A los monos les gusto mucho.',
    ],
    cluesEn: [
      "I'm a fruit.",
      "I'm yellow and long.",
      'Monkeys like me a lot.',
    ],
    answerTarget: 'el plátano',
    answerEn: 'the banana',
  },
  {
    id: 'es-e6',
    category: 'food',
    difficulty: 'easy',
    cluesTarget: [
      'Soy blanca.',
      'Vengo de una vaca.',
      'La bebes en el desayuno.',
    ],
    cluesEn: [
      "I'm white.",
      'I come from a cow.',
      'You drink me at breakfast.',
    ],
    answerTarget: 'la leche',
    answerEn: 'the milk',
  },
  {
    id: 'es-e7',
    category: 'place',
    difficulty: 'easy',
    cluesTarget: [
      'Soy un lugar.',
      'Los niños estudian aquí.',
      'Hay una pizarra y muchos libros.',
    ],
    cluesEn: [
      "I'm a place.",
      'Children study here.',
      'There is a chalkboard and many books.',
    ],
    answerTarget: 'la escuela',
    answerEn: 'the school',
  },
  {
    id: 'es-e8',
    category: 'person',
    difficulty: 'easy',
    cluesTarget: [
      'Soy una persona de tu familia.',
      'Soy la madre de tu madre o de tu padre.',
      'Me gusta contar historias antiguas.',
    ],
    cluesEn: [
      "I'm a person in your family.",
      'I am your mother\'s or father\'s mother.',
      'I like to tell old stories.',
    ],
    answerTarget: 'la abuela',
    answerEn: 'the grandmother',
  },
  {
    id: 'es-e9',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Soy redonda.',
      'Los niños juegan conmigo.',
      'Botas cuando me tiras al suelo.',
    ],
    cluesEn: [
      "I'm round.",
      'Children play with me.',
      'I bounce when you throw me on the ground.',
    ],
    answerTarget: 'la pelota',
    answerEn: 'the ball',
  },
  {
    id: 'es-e10',
    category: 'food',
    difficulty: 'easy',
    cluesTarget: [
      'Soy blanco o moreno.',
      'Me haces con harina y agua.',
      'Me comes en el desayuno, con mantequilla.',
    ],
    cluesEn: [
      "I'm white or brown.",
      'You make me with flour and water.',
      'You eat me at breakfast, with butter.',
    ],
    answerTarget: 'el pan',
    answerEn: 'the bread',
  },
];

const GUESS_BLANK_QUESTIONS: Record<string, GuessBlankQuestion[]> = {
  spanish,
  portuguese: [],
  italian:    [],
  french:     [],
  german:     [],
  dutch:      [],
};

export function getGuessBlankQuestions(lang: string): GuessBlankQuestion[] {
  return GUESS_BLANK_QUESTIONS[lang] ?? [];
}
