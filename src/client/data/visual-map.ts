/**
 * visual-map.ts
 *
 * Concept-based visual fallbacks for Picture Quiz mode.
 *
 * Each entry defines one concept (e.g. "dog") with:
 *   - emoji   — Unicode emoji fallback (always available)
 *   - svgUrl  — OpenMoji SVG served from /emoji/ (preferred over emoji)
 *   - words   — every word across all supported languages that maps to this concept,
 *               so one entry covers perro + cachorro + cão + cane + chien
 *
 * Language keys match the full names used throughout the app — see LANGUAGES
 * in data/languages.ts.
 *
 * German nouns are listed with their capital letter, since that is how the
 * pipeline stores them and how they must be written. The lookup normalises
 * case and strips diacritics, so Bär, BÄR and bar all resolve to the same
 * concept.
 *
 * SVG files: run VocabApp-Data's emoji-download step to populate data/emoji/animals/.
 * Browse OpenMoji at: https://openmoji.org
 */

// Local paths — SVGs are served by Express from data/emoji/ and data/svgs/
const CDN    = '/emoji';   // OpenMoji SVGs (data/emoji/animals/)
const SHARED = '/svgs';    // shared custom SVGs (data/svgs/)

type Languages = 'spanish' | 'portuguese' | 'italian' | 'french' | 'german' | 'dutch';

interface Concept {
  key?: string;
  /** Local photo from data/images/ — highest priority in picture mode */
  imageUrl?: string;
  /** OpenMoji SVG — used when no photo available */
  svgUrl?: string;
  /** Unicode emoji — cheapest fallback */
  emoji?: string;
  words: Partial<Record<Languages, string[]>>;
}

const IMG = '/images';  // served from data/images/ (run download_images.py once)

const CONCEPTS: Concept[] = [

  // Animals

  { key: 'dog', emoji: '🐕', svgUrl: `${SHARED}/dog.svg`,
    words: { spanish: ['perro'], portuguese: ['cao'], italian: ['cane'], french: ['chien'], german: ['Hund'], dutch: ['hond'] } },

  { emoji: '🐶', svgUrl: `${CDN}/1F436.svg`,
    words: { spanish: ['cachorro'], portuguese: ['cachorro','filhote'], italian: ['cucciolo'], french: ['chiot'], german: ['Welpe'], dutch: ['puppy'] } },

  { key: 'cat', emoji: '🐱', svgUrl: `${SHARED}/cat.svg`,
    words: { spanish: ['gato'], portuguese: ['gato'], italian: ['gatto'], french: ['chat'], german: ['Katze'], dutch: ['kat','poes'] } },

  { emoji: '🐱', svgUrl: `${CDN}/1F431.svg`,
    words: { spanish: ['gatito'], portuguese: ['gatinho'], italian: ['gattino'], french: ['chaton'], german: ['Kaetzchen','Kätzchen'], dutch: ['katje'] } },

  { emoji: '🐴', svgUrl: `${CDN}/1F434.svg`,
    words: { spanish: ['caballo','potro'], portuguese: ['cavalo'], italian: ['cavallo'], french: ['cheval'], german: ['Pferd'], dutch: ['paard'] } },

  { emoji: '🐄', svgUrl: `${CDN}/1F404.svg`,
    words: { spanish: ['vaca','ternero'], portuguese: ['vaca'], italian: ['mucca'], french: ['vache'], german: ['Kuh'], dutch: ['koe'] } },

  { emoji: '🐷', svgUrl: `${CDN}/1F437.svg`,
    words: { spanish: ['cerdo','lechon'], portuguese: ['porco'], italian: ['maiale'], french: ['cochon'], german: ['Schwein'], dutch: ['varken'] } },

  { emoji: '🐑', svgUrl: `${CDN}/1F411.svg`,
    words: { spanish: ['oveja','cordero'], portuguese: ['ovelha'], italian: ['pecora'], french: ['mouton'], german: ['Schaf'], dutch: ['schaap'] } },

  { emoji: '🐐', svgUrl: `${CDN}/1F410.svg`,
    words: { spanish: ['cabra','chivo'], portuguese: ['cabra'], italian: ['capra'], french: ['chevre'], german: ['Ziege'], dutch: ['geit'] } },

  { emoji: '\uD83E\uDAAF', svgUrl: `${CDN}/1FAAF.svg`,
    words: { spanish: ['burro'], portuguese: ['burro'], italian: ['asino'], french: ['ane'], german: ['Esel'], dutch: ['ezel'] } },

  { emoji: '🐺', svgUrl: `${CDN}/1F43A.svg`,
    words: { spanish: ['lobo'], portuguese: ['lobo'], italian: ['lupo'], french: ['loup'], german: ['Wolf'], dutch: ['wolf'] } },

  { emoji: '🦊', svgUrl: `${CDN}/1F98A.svg`,
    words: { spanish: ['zorro'], portuguese: ['raposa'], italian: ['volpe'], french: ['renard'], german: ['Fuchs'], dutch: ['vos'] } },

  { emoji: '🐻', svgUrl: `${CDN}/1F43B.svg`,
    words: { spanish: ['oso'], portuguese: ['urso'], italian: ['orso'], french: ['ours'], german: ['Bär'], dutch: ['beer'] } },

  { emoji: '🐇', svgUrl: `${CDN}/1F407.svg`,
    words: { spanish: ['conejo'], portuguese: ['coelho'], italian: ['coniglio'], french: ['lapin'], german: ['Kaninchen','Hase'], dutch: ['konijn','haas'] } },

  { emoji: '🦌', svgUrl: `${CDN}/1F98C.svg`,
    words: { spanish: ['ciervo'], portuguese: ['cervo'], italian: ['cervo'], french: ['cerf'], german: ['Hirsch','Reh'], dutch: ['hert'] } },

  { emoji: '🐒', svgUrl: `${CDN}/1F412.svg`,
    words: { spanish: ['mono'], portuguese: ['macaco'], italian: ['scimmia'], french: ['singe'], german: ['Affe'], dutch: ['aap'] } },

  { emoji: '🦍', svgUrl: `${CDN}/1F98D.svg`,
    words: { spanish: ['gorila'], portuguese: ['gorila'], italian: ['gorilla'], french: ['gorille'], german: ['Gorilla'], dutch: ['gorilla'] } },

  { emoji: '🐘', svgUrl: `${CDN}/1F418.svg`,
    words: { spanish: ['elefante'], portuguese: ['elefante'], italian: ['elefante'], french: ['elephant'], german: ['Elefant'], dutch: ['olifant'] } },

  { emoji: '🦒', svgUrl: `${CDN}/1F992.svg`,
    words: { spanish: ['jirafa'], portuguese: ['girafa'], italian: ['giraffa'], french: ['girafe'], german: ['Giraffe'], dutch: ['giraf'] } },

  { emoji: '🦏', svgUrl: `${CDN}/1F98F.svg`,
    words: { spanish: ['rinoceronte'], portuguese: ['rinoceronte'], italian: ['rinoceronte'], french: ['rhinoceros'], german: ['Nashorn'], dutch: ['neushoorn'] } },

  { emoji: '🦛', svgUrl: `${CDN}/1F99B.svg`,
    words: { spanish: ['hipopotamo'], portuguese: ['hipopotamo'], italian: ['ippopotamo'], french: ['hippopotame'], german: ['Nilpferd','Flusspferd'], dutch: ['nijlpaard'] } },

  { emoji: '🦓', svgUrl: `${CDN}/1F993.svg`,
    words: { spanish: ['cebra'], portuguese: ['zebra'], italian: ['zebra'], french: ['zebre'], german: ['Zebra'], dutch: ['zebra'] } },

  { emoji: '🐪', svgUrl: `${CDN}/1F42A.svg`,
    words: { spanish: ['camello'], portuguese: ['camelo'], italian: ['cammello'], french: ['chameau'], german: ['Kamel'], dutch: ['kameel'] } },

  { emoji: '🦙', svgUrl: `${CDN}/1F999.svg`,
    words: { spanish: ['llama'], portuguese: ['lhama'], italian: ['lama'], french: ['lama'], german: ['Lama'], dutch: ['lama'] } },

  { emoji: '🦁', svgUrl: `${CDN}/1F981.svg`,
    words: { spanish: ['leon'], portuguese: ['leao'], italian: ['leone'], french: ['lion'], german: ['Löwe'], dutch: ['leeuw'] } },

  { emoji: '🐯', svgUrl: `${CDN}/1F42F.svg`,
    words: { spanish: ['tigre'], portuguese: ['tigre'], italian: ['tigre'], french: ['tigre'], german: ['Tiger'], dutch: ['tijger'] } },

  { emoji: '🐆', svgUrl: `${CDN}/1F406.svg`,
    words: { spanish: ['leopardo','guepardo','jaguar','pantera','lince'], portuguese: ['leopardo'], italian: ['leopardo'], french: ['leopard'], german: ['Leopard','Gepard','Jaguar','Panther','Luchs'], dutch: ['luipaard','jachtluipaard','jaguar','panter','lynx'] } },

  { emoji: '🐊', svgUrl: `${CDN}/1F40A.svg`,
    words: { spanish: ['cocodrilo','caiman'], portuguese: ['crocodilo'], italian: ['coccodrillo'], french: ['crocodile'], german: ['Krokodil','Alligator'], dutch: ['krokodil','alligator'] } },

  { emoji: '🦭', svgUrl: `${CDN}/1F9AD.svg`,
    words: { spanish: ['foca'], portuguese: ['foca'], italian: ['foca'], french: ['phoque'], german: ['Robbe','Seehund'], dutch: ['zeehond'] } },

  { emoji: '🐋', svgUrl: `${CDN}/1F40B.svg`,
    words: { spanish: ['ballena'], portuguese: ['baleia'], italian: ['balena'], french: ['baleine'], german: ['Wal'], dutch: ['walvis'] } },

  { emoji: '🐬', svgUrl: `${CDN}/1F42C.svg`,
    words: { spanish: ['delfin'], portuguese: ['golfinho'], italian: ['delfino'], french: ['dauphin'], german: ['Delfin'], dutch: ['dolfijn'] } },

  { emoji: '🦈', svgUrl: `${CDN}/1F988.svg`,
    words: { spanish: ['tiburon'], portuguese: ['tubarao'], italian: ['squalo'], french: ['requin'], german: ['Hai'], dutch: ['haai'] } },

  { emoji: '🐙', svgUrl: `${CDN}/1F419.svg`,
    words: { spanish: ['pulpo'], portuguese: ['polvo'], italian: ['polpo'], french: ['pieuvre'], german: ['Krake','Tintenfisch'], dutch: ['octopus','inktvis'] } },

  { emoji: '🦐', svgUrl: `${CDN}/1F990.svg`,
    words: { spanish: ['gamba','camaron'], portuguese: ['camarao'], italian: ['gambero'], french: ['crevette'], german: ['Garnele'], dutch: ['garnaal'] } },

  { emoji: '🦞', svgUrl: `${CDN}/1F99E.svg`,
    words: { spanish: ['langosta'], portuguese: ['lagosta'], italian: ['aragosta'], french: ['homard'], german: ['Hummer'], dutch: ['kreeft'] } },

  { emoji: '🦀', svgUrl: `${CDN}/1F980.svg`,
    words: { spanish: ['cangrejo'], portuguese: ['caranguejo'], italian: ['granchio'], french: ['crabe'], german: ['Krabbe','Krebs'], dutch: ['krab'] } },

  { emoji: '🐦', svgUrl: `${CDN}/1F426.svg`,
    words: { spanish: ['pajaro'], portuguese: ['passaro'], italian: ['uccello'], french: ['oiseau'], german: ['Vogel'], dutch: ['vogel'] } },

  { emoji: '🦅', svgUrl: `${CDN}/1F985.svg`,
    words: { spanish: ['aguila','halcon'], portuguese: ['aguia','falcao'], italian: ['aquila','falco'], french: ['aigle','faucon'], german: ['Adler','Falke'], dutch: ['adelaar','valk'] } },

  { emoji: '🦆', svgUrl: `${CDN}/1F986.svg`,
    words: { spanish: ['pato'], portuguese: ['pato'], italian: ['anatra'], french: ['canard'], german: ['Ente'], dutch: ['eend'] } },

  { emoji: '🦉', svgUrl: `${CDN}/1F989.svg`,
    words: { spanish: ['buho','lechuza'], portuguese: ['coruja'], italian: ['gufo'], french: ['hibou'], german: ['Eule'], dutch: ['uil'] } },

  { emoji: '🦚', svgUrl: `${CDN}/1F99A.svg`,
    words: { spanish: ['pavo real'], portuguese: ['pavao'], italian: ['pavone'], french: ['paon'], german: ['Pfau'], dutch: ['pauw'] } },

  { emoji: '🦜', svgUrl: `${CDN}/1F99C.svg`,
    words: { spanish: ['loro'], portuguese: ['papagaio'], italian: ['pappagallo'], french: ['perroquet'], german: ['Papagei'], dutch: ['papegaai'] } },

  { emoji: '🐧', svgUrl: `${CDN}/1F427.svg`,
    words: { spanish: ['pinguino'], portuguese: ['pinguim'], italian: ['pinguino'], french: ['pingouin'], german: ['Pinguin'], dutch: ['pinguin'] } },

  { emoji: '🦩', svgUrl: `${CDN}/1F9A9.svg`,
    words: { spanish: ['flamenco'], portuguese: ['flamingo'], italian: ['fenicottero'], french: ['flamant'], german: ['Flamingo'], dutch: ['flamingo'] } },

  { emoji: '🦢', svgUrl: `${CDN}/1F9A2.svg`,
    words: { spanish: ['cisne'], portuguese: ['cisne'], italian: ['cigno'], french: ['cygne'], german: ['Schwan'], dutch: ['zwaan'] } },

  { emoji: '🐓', svgUrl: `${CDN}/1F413.svg`,
    words: { spanish: ['gallo','gallina'], portuguese: ['galo','galinha'], italian: ['gallo','gallina'], french: ['coq','poule'], german: ['Hahn','Henne','Huhn'], dutch: ['haan','kip'] } },

  { emoji: '🦃', svgUrl: `${CDN}/1F983.svg`,
    words: { spanish: ['pavo'], portuguese: ['peru'], italian: ['tacchino'], french: ['dinde'], german: ['Truthahn'], dutch: ['kalkoen'] } },

  { emoji: '🐸', svgUrl: `${CDN}/1F438.svg`,
    words: { spanish: ['rana'], portuguese: ['sapo'], italian: ['rana'], french: ['grenouille'], german: ['Frosch'], dutch: ['kikker'] } },

  { emoji: '🐢', svgUrl: `${CDN}/1F422.svg`,
    words: { spanish: ['tortuga'], portuguese: ['tartaruga'], italian: ['tartaruga'], french: ['tortue'], german: ['Schildkröte'], dutch: ['schildpad'] } },

  { emoji: '🦎', svgUrl: `${CDN}/1F98E.svg`,
    words: { spanish: ['lagarto','lagartija'], portuguese: ['lagarto'], italian: ['lucertola'], french: ['lezard'], german: ['Eidechse'], dutch: ['hagedis'] } },

  { emoji: '🐍', svgUrl: `${CDN}/1F40D.svg`,
    words: { spanish: ['serpiente','culebra'], portuguese: ['serpente','cobra'], italian: ['serpente'], french: ['serpent'], german: ['Schlange'], dutch: ['slang'] } },

  { emoji: '🦂', svgUrl: `${CDN}/1F982.svg`,
    words: { spanish: ['escorpion'], portuguese: ['escorpiao'], italian: ['scorpione'], french: ['scorpion'], german: ['Skorpion'], dutch: ['schorpioen'] } },

  { emoji: '🐟', svgUrl: `${CDN}/1F41F.svg`,
    words: { spanish: ['pez','pescado','bacalao','trucha','salmon','atun'], portuguese: ['peixe'], italian: ['pesce'], french: ['poisson'], german: ['Fisch','Kabeljau','Forelle','Lachs','Thunfisch'], dutch: ['vis','kabeljauw','forel','zalm','tonijn'] } },

  { emoji: '🐁', svgUrl: `${CDN}/1F401.svg`,
    words: { spanish: ['raton','rata'], portuguese: ['rato'], italian: ['topo'], french: ['souris','rat'], german: ['Maus','Ratte'], dutch: ['muis','rat'] } },

  { emoji: '🐿', svgUrl: `${CDN}/1F43F.svg`,
    words: { spanish: ['ardilla'], portuguese: ['esquilo'], italian: ['scoiattolo'], french: ['ecureuil'], german: ['Eichhörnchen'], dutch: ['eekhoorn'] } },

  { emoji: '🦔', svgUrl: `${CDN}/1F994.svg`,
    words: { spanish: ['erizo'], portuguese: ['ourigo'], italian: ['riccio'], french: ['herisson'], german: ['Igel'], dutch: ['egel'] } },

  { emoji: '🦇', svgUrl: `${CDN}/1F987.svg`,
    words: { spanish: ['murcielago'], portuguese: ['morcego'], italian: ['pipistrello'], french: ['chauve-souris'], german: ['Fledermaus'], dutch: ['vleermuis'] } },

  { emoji: '🐹', svgUrl: `${CDN}/1F439.svg`,
    words: { spanish: ['hamster','cobaya'], portuguese: ['hamster','cobaia'], italian: ['criceto'], french: ['hamster'], german: ['Hamster','Meerschweinchen'], dutch: ['hamster','cavia'] } },

  { emoji: '🐝', svgUrl: `${CDN}/1F41D.svg`,
    words: { spanish: ['abeja'], portuguese: ['abelha'], italian: ['ape'], french: ['abeille'], german: ['Biene'], dutch: ['bij'] } },

  { emoji: '🦋', svgUrl: `${CDN}/1F98B.svg`,
    words: { spanish: ['mariposa'], portuguese: ['borboleta'], italian: ['farfalla'], french: ['papillon'], german: ['Schmetterling'], dutch: ['vlinder'] } },

  { emoji: '🐛', svgUrl: `${CDN}/1F41B.svg`,
    words: { spanish: ['gusano','oruga','larva'], portuguese: ['verme','lagarta'], italian: ['verme','bruco'], french: ['ver','chenille'], german: ['Wurm','Raupe','Larve'], dutch: ['worm','rups'] } },

  { emoji: '🐜', svgUrl: `${CDN}/1F41C.svg`,
    words: { spanish: ['hormiga'], portuguese: ['formiga'], italian: ['formica'], french: ['fourmi'], german: ['Ameise'], dutch: ['mier'] } },

  { emoji: '🦟', svgUrl: `${CDN}/1F99F.svg`,
    words: { spanish: ['mosquito'], portuguese: ['mosquito'], italian: ['zanzara'], french: ['moustique'], german: ['Mücke'], dutch: ['mug'] } },

  { emoji: '🦗', svgUrl: `${CDN}/1F997.svg`,
    words: { spanish: ['grillo','saltamontes'], portuguese: ['grilo'], italian: ['grillo'], french: ['grillon'], german: ['Grille','Heuschrecke'], dutch: ['krekel','sprinkhaan'] } },

  { emoji: '🪲', svgUrl: `${CDN}/1FAB2.svg`,
    words: { spanish: ['escarabajo'], portuguese: ['besouro'], italian: ['scarafaggio'], french: ['scarabee'], german: ['Käfer'], dutch: ['kever'] } },

  { emoji: '🪳', svgUrl: `${CDN}/1FAB3.svg`,
    words: { spanish: ['cucaracha'], portuguese: ['barata'], italian: ['blatta'], french: ['cafard'], german: ['Kakerlake'], dutch: ['kakkerlak'] } },

  { emoji: '🕷',
    words: { spanish: ['arana'], portuguese: ['aranha'], italian: ['ragno'], french: ['araignee'], german: ['Spinne'], dutch: ['spin'] } },

  { emoji: '🐌', svgUrl: `${CDN}/1F40C.svg`,
    words: { spanish: ['caracol'], portuguese: ['caracol'], italian: ['lumaca'], french: ['escargot'], german: ['Schnecke'], dutch: ['slak'] } },

  { emoji: '🦦', svgUrl: `${CDN}/1F9A6.svg`,
    words: { spanish: ['nutria'], portuguese: ['lontra'], italian: ['lontra'], french: ['loutre'], german: ['Otter'], dutch: ['otter'] } },

  // Abstract animal category words intentionally excluded from picture mode
  // (mamifero, reptil, anfibio, felino, roedor, primate, depredador, predador, mascota)
  // — no single image can represent them unambiguously

  // Nature & Weather

  { key: 'water', emoji: '💧', svgUrl: `${SHARED}/water.svg`,
    words: { spanish: ['agua'], portuguese: ['agua'], italian: ['acqua'], french: ['eau'], german: ['Wasser'], dutch: ['water'] } },

  { emoji: '🔥',
    words: { spanish: ['fuego'], portuguese: ['fogo'], italian: ['fuoco'], french: ['feu'], german: ['Feuer'], dutch: ['vuur'] } },

  { emoji: '💨',
    words: { spanish: ['aire','viento'], portuguese: ['ar','vento'], italian: ['aria','vento'], french: ['air','vent'], german: ['Luft','Wind'], dutch: ['lucht','wind'] } },

  { emoji: '🌍',
    words: { spanish: ['tierra'], portuguese: ['terra'], italian: ['terra'], french: ['terre'], german: ['Erde'], dutch: ['aarde'] } },

  { emoji: '🌊',
    words: { spanish: ['mar'], portuguese: ['mar'], italian: ['mare'], french: ['mer'], german: ['Meer','See'], dutch: ['zee'] } },

  { emoji: '🏞',
    words: { spanish: ['rio'], portuguese: ['rio'], italian: ['fiume'], french: ['riviere','fleuve'], german: ['Fluss'], dutch: ['rivier'] } },

  { emoji: '⛰',
    words: { spanish: ['montana'], portuguese: ['montanha'], italian: ['montagna'], french: ['montagne'], german: ['Berg'], dutch: ['berg'] } },

  { emoji: '🌲',
    words: { spanish: ['bosque'], portuguese: ['floresta'], italian: ['bosco'], french: ['foret'], german: ['Wald'], dutch: ['bos'] } },

  { key: 'tree', emoji: '🌳', svgUrl: `${SHARED}/tree.svg`,
    words: { spanish: ['arbol'], portuguese: ['arvore'], italian: ['albero'], french: ['arbre'], german: ['Baum'], dutch: ['boom'] } },

  { emoji: '🌱',
    words: { spanish: ['planta','semilla'], portuguese: ['planta','semente'], italian: ['pianta','seme'], french: ['plante','graine'], german: ['Pflanze','Samen'], dutch: ['plant','zaad'] } },

  { key: 'flower', emoji: '🌸', svgUrl: `${SHARED}/flower.svg`,
    words: { spanish: ['flor'], portuguese: ['flor'], italian: ['fiore'], french: ['fleur'], german: ['Blume'], dutch: ['bloem'] } },

  { emoji: '🍃',
    words: { spanish: ['hoja'], portuguese: ['folha'], italian: ['foglia'], french: ['feuille'], german: ['Blatt'], dutch: ['blad'] } },

  { emoji: '🌤',
    words: { spanish: ['cielo'], portuguese: ['ceu'], italian: ['cielo'], french: ['ciel'], german: ['Himmel'], dutch: ['hemel'] } },

  { key: 'sun', emoji: '☀', svgUrl: `${SHARED}/sun.svg`,
    words: { spanish: ['sol'], portuguese: ['sol'], italian: ['sole'], french: ['soleil'], german: ['Sonne'], dutch: ['zon'] } },

  { emoji: '🌙',
    words: { spanish: ['luna'], portuguese: ['lua'], italian: ['luna'], french: ['lune'], german: ['Mond'], dutch: ['maan'] } },

  { emoji: '⭐',
    words: { spanish: ['estrella'], portuguese: ['estrela'], italian: ['stella'], french: ['etoile'], german: ['Stern'], dutch: ['ster'] } },

  { emoji: '☁',
    words: { spanish: ['nube'], portuguese: ['nuvem'], italian: ['nuvola'], french: ['nuage'], german: ['Wolke'], dutch: ['wolk'] } },

  { emoji: '🌧',
    words: { spanish: ['lluvia'], portuguese: ['chuva'], italian: ['pioggia'], french: ['pluie'], german: ['Regen'], dutch: ['regen'] } },

  { emoji: '❄',
    words: { spanish: ['nieve'], portuguese: ['neve'], italian: ['neve'], french: ['neige'], german: ['Schnee'], dutch: ['sneeuw'] } },

  { emoji: '⛈',
    words: { spanish: ['tormenta'], portuguese: ['tempestade'], italian: ['temporale'], french: ['orage'], german: ['Sturm','Gewitter'], dutch: ['storm','onweer'] } },

  // Food & Drink

  { emoji: '🍽',
    words: { spanish: ['comida'], portuguese: ['comida'], italian: ['cibo'], french: ['nourriture'], german: ['Essen','Nahrung'], dutch: ['eten','voedsel'] } },

  { emoji: '🍞',
    words: { spanish: ['pan'], portuguese: ['pao'], italian: ['pane'], french: ['pain'], german: ['Brot'], dutch: ['brood'] } },

  { emoji: '🥩',
    words: { spanish: ['carne'], portuguese: ['carne'], italian: ['carne'], french: ['viande'], german: ['Fleisch'], dutch: ['vlees'] } },

  { emoji: '🐔', svgUrl: `${CDN}/1F414.svg`,
    words: { spanish: ['pollo'], portuguese: ['frango'], italian: ['pollo'], french: ['poulet'], german: ['Hähnchen'], dutch: ['kip'] } },

  { emoji: '🍚',
    words: { spanish: ['arroz'], portuguese: ['arroz'], italian: ['riso'], french: ['riz'], german: ['Reis'], dutch: ['rijst'] } },

  { emoji: '🍎',
    words: { spanish: ['fruta'], portuguese: ['fruta'], italian: ['frutta'], french: ['fruit'], german: ['Obst','Frucht'], dutch: ['fruit'] } },

  { key: 'apple', emoji: '🍎', svgUrl: `${SHARED}/apple.svg`,
    words: { spanish: ['manzana'], portuguese: ['maca'], italian: ['mela'], french: ['pomme'], german: ['Apfel'], dutch: ['appel'] } },

  { emoji: '🥦',
    words: { spanish: ['verdura'], portuguese: ['verdura'], italian: ['verdura'], french: ['legume'], german: ['Gemüse'], dutch: ['groente'] } },

  { emoji: '🥛',
    words: { spanish: ['leche'], portuguese: ['leite'], italian: ['latte'], french: ['lait'], german: ['Milch'], dutch: ['melk'] } },

  { emoji: '☕',
    words: { spanish: ['cafe'], portuguese: ['cafe'], italian: ['caffe'], french: ['cafe'], german: ['Kaffee'], dutch: ['koffie'] } },

  { emoji: '🍷',
    words: { spanish: ['vino'], portuguese: ['vinho'], italian: ['vino'], french: ['vin'], german: ['Wein'], dutch: ['wijn'] } },

  { emoji: '🍺',
    words: { spanish: ['cerveza'], portuguese: ['cerveja'], italian: ['birra'], french: ['biere'], german: ['Bier'], dutch: ['bier'] } },

  { emoji: '🥤',
    words: { spanish: ['jugo'], portuguese: ['suco'], italian: ['succo'], french: ['jus'], german: ['Saft'], dutch: ['sap'] } },

];  // end CONCEPTS

// Normalize: strip diacritics and lowercase so lookups are accent-insensitive.
// e.g. 'delfín' -> 'delfin', 'Águila' -> 'aguila'
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

// Lookup tables built once at module load (keys are normalized).
// Object.create(null) — no prototype, so words like 'constructor' (Spanish for
// 'builder') can't accidentally resolve to Object.prototype members.
const _emoji:  Record<string, Record<string, string>> = Object.create(null);
const _svgUrl: Record<string, Record<string, string>> = Object.create(null);

for (const c of CONCEPTS) {
  for (const [lang, words] of Object.entries(c.words) as [string, string[]][]) {
    for (const word of words) {
      const k = norm(word);
      if (c.emoji)  (_emoji[lang]  ??= Object.create(null))[k] = c.emoji;
      if (c.svgUrl) (_svgUrl[lang] ??= Object.create(null))[k] = c.svgUrl;
    }
  }
}

export function getFallbackEmoji(lang: string, word: string): string | null {
  return _emoji[lang]?.[norm(word)] ?? null;
}

export function getFallbackSvgUrl(lang: string, word: string): string | null {
  return _svgUrl[lang]?.[norm(word)] ?? null;
}

// ── Local photo map ───────────────────────────────────────────────────────────
// Maps normalised Spanish (and other lang) words to local image files.
// Files live in data/images/ — run VocabApp-Data's image-download step to populate.
// Add entries here as new images are downloaded.

const IMAGES: Record<string, string> = {
  // key = normalised word (no accents, lowercase), value = /images/{concept}.jpg|png
  // Pets & domestic
  'perro':        `${IMG}/dog.jpg`,
  'cachorro':     `${IMG}/puppy.jpg`,
  'gato':         `${IMG}/cat.jpg`,
  'gatito':       `${IMG}/kitten.jpg`,
  'caballo':      `${IMG}/horse.jpg`,
  'potro':        `${IMG}/foal.jpg`,
  'vaca':         `${IMG}/cow.jpg`,
  'ternero':      `${IMG}/calf.jpg`,
  'cerdo':        `${IMG}/pig.jpg`,
  'lechon':       `${IMG}/pig.jpg`,
  'oveja':        `${IMG}/sheep.jpg`,
  'cordero':      `${IMG}/lamb.jpg`,
  'cabra':        `${IMG}/goat.jpg`,
  'chivo':        `${IMG}/goat.jpg`,
  'burro':        `${IMG}/donkey.jpg`,
  'conejo':       `${IMG}/rabbit.jpg`,
  'hamster':      `${IMG}/hamster.jpg`,
  'cobaya':       `${IMG}/guinea_pig.jpg`,
  // Wild mammals
  'lobo':         `${IMG}/wolf.jpg`,
  'zorro':        `${IMG}/fox.jpg`,
  'oso':          `${IMG}/bear.jpg`,
  'ciervo':       `${IMG}/deer.jpg`,
  'mono':         `${IMG}/monkey.jpg`,
  'gorila':       `${IMG}/gorilla.jpg`,
  'elefante':     `${IMG}/elephant.jpg`,
  'jirafa':       `${IMG}/giraffe.jpg`,
  'rinoceronte':  `${IMG}/rhinoceros.jpg`,
  'hipopotamo':   `${IMG}/hippopotamus.jpg`,
  'cebra':        `${IMG}/zebra.jpg`,
  'camello':      `${IMG}/camel.jpg`,
  'llama':        `${IMG}/llama.jpg`,
  'leon':         `${IMG}/lion.jpg`,
  'tigre':        `${IMG}/tiger.jpg`,
  'leopardo':     `${IMG}/leopard.jpg`,
  'guepardo':     `${IMG}/cheetah.jpg`,
  'jaguar':       `${IMG}/jaguar.jpg`,
  'pantera':      `${IMG}/panther.jpg`,
  'lince':        `${IMG}/lynx.jpg`,
  'ardilla':      `${IMG}/squirrel.jpg`,
  'erizo':        `${IMG}/hedgehog.jpg`,
  'murcielago':   `${IMG}/bat.jpg`,
  'nutria':       `${IMG}/otter.jpg`,
  'raton':        `${IMG}/mouse.jpg`,
  'rata':         `${IMG}/mouse.jpg`,
  // Marine
  'ballena':      `${IMG}/whale.jpg`,
  'delfin':       `${IMG}/dolphin.jpg`,
  'tiburon':      `${IMG}/shark.jpg`,
  'foca':         `${IMG}/seal.jpg`,
  'pulpo':        `${IMG}/octopus.jpg`,
  'gamba':        `${IMG}/shrimp.jpg`,
  'camaron':      `${IMG}/shrimp.jpg`,
  'langosta':     `${IMG}/lobster.jpg`,
  'cangrejo':     `${IMG}/crab.jpg`,
  'pez':          `${IMG}/fish.jpg`,
  'pescado':      `${IMG}/fish.jpg`,
  'salmon':       `${IMG}/salmon.jpg`,
  'atun':         `${IMG}/fish.jpg`,
  'bacalao':      `${IMG}/fish.jpg`,
  'trucha':       `${IMG}/fish.jpg`,
  'medusa':       `${IMG}/jellyfish.jpg`,
  // Birds
  'pajaro':       `${IMG}/bird.jpg`,
  'aguila':       `${IMG}/eagle.jpg`,
  'halcon':       `${IMG}/falcon.jpg`,
  'pato':         `${IMG}/duck.jpg`,
  'buho':         `${IMG}/owl.jpg`,
  'lechuza':      `${IMG}/owl.jpg`,
  'pavo real':    `${IMG}/peacock.jpg`,
  'loro':         `${IMG}/parrot.jpg`,
  'pinguino':     `${IMG}/penguin.jpg`,
  'flamenco':     `${IMG}/flamingo.jpg`,
  'cisne':        `${IMG}/swan.jpg`,
  'gallo':        `${IMG}/rooster.jpg`,
  'gallina':      `${IMG}/chicken.jpg`,
  'pollo':        `${IMG}/chicken.jpg`,
  'pavo':         `${IMG}/turkey.jpg`,
  'ciguena':      `${IMG}/stork.jpg`,
  'gorrion':      `${IMG}/sparrow.jpg`,
  'cuervo':       `${IMG}/crow.jpg`,
  'gaviota':      `${IMG}/seagull.jpg`,
  'garza':        `${IMG}/heron.jpg`,
  // Reptiles & amphibians
  'rana':         `${IMG}/frog.jpg`,
  'tortuga':      `${IMG}/turtle.jpg`,
  'lagarto':      `${IMG}/lizard.jpg`,
  'lagartija':    `${IMG}/lizard.jpg`,
  'serpiente':    `${IMG}/snake.jpg`,
  'culebra':      `${IMG}/snake.jpg`,
  'cocodrilo':    `${IMG}/crocodile.jpg`,
  'caiman':       `${IMG}/crocodile.jpg`,
  'escorpion':    `${IMG}/scorpion.jpg`,
  // Insects & bugs
  'abeja':        `${IMG}/bee.jpg`,
  'mariposa':     `${IMG}/butterfly.jpg`,
  'hormiga':      `${IMG}/ant.jpg`,
  'mosquito':     `${IMG}/mosquito.jpg`,
  'grillo':       `${IMG}/cricket.jpg`,
  'saltamontes':  `${IMG}/grasshopper.jpg`,
  'escarabajo':   `${IMG}/beetle.jpg`,
  'cucaracha':    `${IMG}/cockroach.jpg`,
  'arana':        `${IMG}/spider.jpg`,
  'caracol':      `${IMG}/snail.jpg`,
  'gusano':       `${IMG}/worm.jpg`,
  'oruga':        `${IMG}/caterpillar.jpg`,
  'libelula':     `${IMG}/dragonfly.jpg`,
  'pulga':        `${IMG}/flea.jpg`,
  'larva':        `${IMG}/worm.jpg`,
};

// Build reverse lookup per-language (Spanish words → image; extend for other langs as needed)
const _imageUrl: Record<string, string> = Object.create(null);
for (const [word, url] of Object.entries(IMAGES)) {
  _imageUrl[norm(word)] = url;
}

export function getFallbackImageUrl(lang: string, word: string): string | null {
  // Currently image map is Spanish-keyed; extend IMAGES for other languages as needed
  return _imageUrl[norm(word)] ?? null;
}

/**
 * The distinct photos bundled under `data/images/` — one entry per file, not
 * per word, since several words in IMAGES (pescado/pez/atun) point at the
 * same picture. This backs My Content's "choose a stock image" picker: a
 * gallery of every photo already shipped with the app, so a learner can set
 * one as a word's canonical picture without needing a URL or a file of their
 * own. The label is the filename stem, title-cased, since that is the only
 * name these files carry.
 */
export interface StockImage { url: string; label: string }

let _stockImages: StockImage[] | null = null;

export function getStockImages(): StockImage[] {
  if (_stockImages) return _stockImages;
  const seen = new Set<string>();
  const out: StockImage[] = [];
  for (const url of Object.values(IMAGES)) {
    if (seen.has(url)) continue;
    seen.add(url);
    const stem = url.slice(url.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
    const label = stem.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    out.push({ url, label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  _stockImages = out;
  return out;
}

export { CONCEPTS };


/**
 * Does this word have any visual at all — photo, SVG or emoji?
 *
 * Picture mode drops every word without one, so the size window has to be
 * applied to words that pass this test rather than to the vocabulary at
 * large. Otherwise "Top 100" hands picture mode 100 words and it quizzes
 * however many of them happen to have an image.
 */
export function hasVisual(lang: string, word: string): boolean {
  return Boolean(
    getFallbackImageUrl(lang, word)
    || getFallbackSvgUrl(lang, word)
    || getFallbackEmoji(lang, word),
  );
}
