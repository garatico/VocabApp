/**
 * guess-blank-questions.ts — "Guess the Blank": clues about an object,
 * person, place or animal; the learner guesses the target-language word.
 *
 * Proof of concept, modeled directly on trivia-questions.ts: hand-written per
 * language. Spanish has the full set; Portuguese has a smaller starter batch
 * proving the same question shape carries over to another language; the
 * rest are still empty. Clues are ordered weakest-first — vaguest
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

  // ── Second batch — more mid-difficulty everyday nouns ──
  {
    id: 'es-b13',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Soy pequeña y de metal.',
      'Te ayudo a abrir y cerrar puertas.',
      'A veces te pierdes buscándome en el bolso.',
    ],
    cluesEn: [
      "I'm small and made of metal.",
      'I help you open and close doors.',
      'Sometimes you lose me searching through your bag.',
    ],
    answerTarget: 'la llave',
    answerEn: 'the key',
  },
  {
    id: 'es-b14',
    category: 'animal',
    difficulty: 'medium',
    cluesTarget: [
      'Soy el animal terrestre más grande.',
      'Tengo una trompa muy larga.',
      'Mis orejas son enormes y grises.',
    ],
    cluesEn: [
      "I'm the largest land animal.",
      'I have a very long trunk.',
      'My ears are huge and grey.',
    ],
    answerTarget: 'el elefante',
    answerEn: 'the elephant',
  },
  {
    id: 'es-b15',
    category: 'place',
    difficulty: 'medium',
    cluesTarget: [
      'Soy un lugar con arena y agua.',
      'La gente viene a nadar y tomar el sol.',
      'Las olas del mar llegan hasta mí.',
    ],
    cluesEn: [
      "I'm a place with sand and water.",
      'People come to swim and sunbathe.',
      'The sea waves reach me.',
    ],
    answerTarget: 'la playa',
    answerEn: 'the beach',
  },
  {
    id: 'es-b16',
    category: 'person',
    difficulty: 'medium',
    cluesTarget: [
      'Trabajo para apagar incendios.',
      'Uso un camión rojo con una escalera.',
      'Rescato a personas y animales en peligro.',
    ],
    cluesEn: [
      'I work to put out fires.',
      'I use a red truck with a ladder.',
      'I rescue people and animals in danger.',
    ],
    answerTarget: 'el bombero',
    answerEn: 'the firefighter',
  },
  {
    id: 'es-b17',
    category: 'food',
    difficulty: 'medium',
    cluesTarget: [
      'Soy dulce y normalmente de color marrón.',
      'Vengo de una planta llamada cacao.',
      'A muchos niños les encanto en forma de barra.',
    ],
    cluesEn: [
      "I'm sweet and usually brown.",
      'I come from a plant called cacao.',
      'Many children love me in the shape of a bar.',
    ],
    answerTarget: 'el chocolate',
    answerEn: 'chocolate',
  },
  {
    id: 'es-b18',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Me pones en la cara para ver mejor.',
      'Tengo dos cristales y dos patillas.',
      'Algunas personas también me usan para protegerse del sol.',
    ],
    cluesEn: [
      'You put me on your face to see better.',
      'I have two lenses and two arms.',
      'Some people also use me to protect their eyes from the sun.',
    ],
    answerTarget: 'las gafas',
    answerEn: 'the glasses',
  },
  {
    id: 'es-b19',
    category: 'animal',
    difficulty: 'easy',
    cluesTarget: [
      'Vuelo por el cielo.',
      'Tengo plumas y un pico.',
      'Pongo huevos en un nido.',
    ],
    cluesEn: [
      'I fly through the sky.',
      'I have feathers and a beak.',
      'I lay eggs in a nest.',
    ],
    answerTarget: 'el pájaro',
    answerEn: 'the bird',
  },
  {
    id: 'es-b20',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Estoy en la entrada de una casa.',
      'Me abres y me cierras para entrar y salir.',
      'A veces tengo una cerradura y una llave.',
    ],
    cluesEn: [
      "I'm at the entrance of a house.",
      'You open and close me to go in and out.',
      'Sometimes I have a lock and a key.',
    ],
    answerTarget: 'la puerta',
    answerEn: 'the door',
  },
  {
    id: 'es-b21',
    category: 'place',
    difficulty: 'medium',
    cluesTarget: [
      'Soy un lugar tranquilo y silencioso.',
      'Tengo miles de libros en mis estantes.',
      'Puedes llevarte libros prestados si tienes una tarjeta.',
    ],
    cluesEn: [
      "I'm a quiet, silent place.",
      'I have thousands of books on my shelves.',
      'You can borrow books from me if you have a card.',
    ],
    answerTarget: 'la biblioteca',
    answerEn: 'the library',
  },
  {
    id: 'es-b22',
    category: 'food',
    difficulty: 'easy',
    cluesTarget: [
      'Vengo de una gallina.',
      'Soy blanco o marrón por fuera.',
      'Me comes frito, cocido o revuelto.',
    ],
    cluesEn: [
      'I come from a hen.',
      "I'm white or brown on the outside.",
      'You eat me fried, boiled or scrambled.',
    ],
    answerTarget: 'el huevo',
    answerEn: 'the egg',
  },
];

// Portuguese starter set — a smaller batch than Spanish's, proving the same
// question shape reads fine in another language rather than trying to match
// Spanish's count. Kept to vocabulary that reads the same way in European
// and Brazilian Portuguese (no "autocarro/ônibus"-style splits), since
// answerTarget is a single string with no per-dialect variant list the way
// trivia-questions.ts's answersTarget array allows.
const portuguese: GuessBlankQuestion[] = [
  {
    id: 'pt-b1',
    category: 'animal',
    difficulty: 'easy',
    cluesTarget: [
      'Sou um animal pequeno.',
      'Eu digo "miau".',
      'Vivo na tua casa.',
    ],
    cluesEn: [
      "I'm a small animal.",
      'I say "meow".',
      'I live in your house.',
    ],
    answerTarget: 'o gato',
    answerEn: 'the cat',
  },
  {
    id: 'pt-b2',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Sou amarelo.',
      'Dou luz durante o dia.',
      'Estou no céu.',
    ],
    cluesEn: [
      "I'm yellow.",
      'I give light during the day.',
      "I'm in the sky.",
    ],
    answerTarget: 'o sol',
    answerEn: 'the sun',
  },
  {
    id: 'pt-b3',
    category: 'food',
    difficulty: 'easy',
    cluesTarget: [
      'Sou branco.',
      'Venho de uma vaca.',
      'As pessoas bebem-me todos os dias.',
    ],
    cluesEn: [
      "I'm white.",
      'I come from a cow.',
      'People drink me every day.',
    ],
    answerTarget: 'o leite',
    answerEn: 'the milk',
  },
  {
    id: 'pt-b4',
    category: 'object',
    difficulty: 'medium',
    cluesTarget: [
      'Abres-me para ler.',
      'Sou feito de muitas páginas de papel.',
      'Posso contar uma história longa.',
    ],
    cluesEn: [
      'You open me to read.',
      "I'm made of many sheets of paper.",
      'I can tell a long story.',
    ],
    answerTarget: 'o livro',
    answerEn: 'the book',
  },
  {
    id: 'pt-b5',
    category: 'place',
    difficulty: 'easy',
    cluesTarget: [
      'Sou um lugar.',
      'As crianças estudam aqui.',
      'Há um quadro e muitos livros.',
    ],
    cluesEn: [
      "I'm a place.",
      'Children study here.',
      'There is a board and many books.',
    ],
    answerTarget: 'a escola',
    answerEn: 'the school',
  },
  {
    id: 'pt-b6',
    category: 'person',
    difficulty: 'medium',
    cluesTarget: [
      'Trabalho numa escola.',
      'Explico as lições e corrijo os trabalhos.',
      'Tenho muitos alunos na minha turma.',
    ],
    cluesEn: [
      'I work in a school.',
      'I explain lessons and grade homework.',
      'I have many students in my class.',
    ],
    answerTarget: 'o professor',
    answerEn: 'the teacher',
  },
  {
    id: 'pt-b7',
    category: 'food',
    difficulty: 'medium',
    cluesTarget: [
      'Sou redonda e normalmente vermelha ou verde.',
      'Cresço numa árvore.',
      'Um ditado diz que uma por dia afasta o médico.',
    ],
    cluesEn: [
      "I'm round and usually red or green.",
      'I grow on a tree.',
      'A saying claims one a day keeps the doctor away.',
    ],
    answerTarget: 'a maçã',
    answerEn: 'the apple',
  },
  {
    id: 'pt-b8',
    category: 'animal',
    difficulty: 'medium',
    cluesTarget: [
      'Sou o rei da selva.',
      'Tenho uma grande juba à volta da cara.',
      'Rujo alto para assustar outros animais.',
    ],
    cluesEn: [
      "I'm the king of the jungle.",
      'I have a big mane around my face.',
      'I roar loudly to scare other animals.',
    ],
    answerTarget: 'o leão',
    answerEn: 'the lion',
  },
  {
    id: 'pt-b9',
    category: 'object',
    difficulty: 'easy',
    cluesTarget: [
      'Sou redonda.',
      'As crianças brincam comigo.',
      'Salto quando me atiras ao chão.',
    ],
    cluesEn: [
      "I'm round.",
      'Children play with me.',
      'I bounce when you throw me on the ground.',
    ],
    answerTarget: 'a bola',
    answerEn: 'the ball',
  },
  {
    id: 'pt-b10',
    category: 'place',
    difficulty: 'medium',
    cluesTarget: [
      'Sou um lugar onde compras comida fresca.',
      'Tenho muitas bancas com frutas, legumes e carne.',
      'Costumo estar ao ar livre ou debaixo de um telhado grande.',
    ],
    cluesEn: [
      'I am a place where you buy fresh food.',
      'I have many stalls with fruit, vegetables and meat.',
      "I'm usually outdoors or under one big roof.",
    ],
    answerTarget: 'o mercado',
    answerEn: 'the market',
  },
];

const GUESS_BLANK_QUESTIONS: Record<string, GuessBlankQuestion[]> = {
  spanish,
  portuguese,
  italian:    [],
  french:     [],
  german:     [],
  dutch:      [],
};

export function getGuessBlankQuestions(lang: string): GuessBlankQuestion[] {
  return GUESS_BLANK_QUESTIONS[lang] ?? [];
}
