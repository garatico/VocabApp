/**
 * synonym-generator.js
 *
 * Rules-based synonym generation for Spanish vocabulary
 * Generates synonyms, antonyms, and related words without API calls
 */

// Comprehensive synonym mappings for common Spanish words
// Organized by word family and semantic groups
const synonymMappings = {
  // Adjectives - Size
  'grande': ['amplio', 'vasto', 'extenso', 'inmenso', 'colosal'],
  'pequeño': ['diminuto', 'minúsculo', 'chico', 'reducido', 'menudo'],
  'largo': ['extenso', 'prolongado', 'dilatado'],
  'corto': ['breve', 'reducido', 'ceñido'],

  // Adjectives - Quality
  'bonito': ['hermoso', 'bello', 'precioso', 'lindo', 'atractivo'],
  'feo': ['desagradable', 'horrible', 'repugnante', 'grotesco'],
  'bueno': ['excelente', 'óptimo', 'magnífico', 'espléndido', 'superior'],
  'malo': ['pésimo', 'horrible', 'terrible', 'execrable', 'mediocre'],
  'nuevo': ['reciente', 'flamante', 'moderno', 'inédito'],
  'viejo': ['antiguo', 'arcaico', 'obsoleto', 'vetustez'],

  // Adjectives - Emotion/State
  'feliz': ['alegre', 'contento', 'joyoso', 'dichoso', 'radiante'],
  'triste': ['melancólico', 'infeliz', 'desventurado', 'lúgubre', 'sombrío'],
  'fuerte': ['robusto', 'vigoroso', 'potente', 'musculoso', 'resistente'],
  'débil': ['frágil', 'endeble', 'decrépito', 'delicado'],
  'cansado': ['fatigado', 'exhausto', 'agotado', 'extenuado'],
  'tranquilo': ['sereno', 'apacible', 'sosegado', 'plácido', 'imperturbable'],

  // Common Verbs
  'hablar': ['conversar', 'charlar', 'dialogar', 'platicar', 'comunicar'],
  'decir': ['afirmar', 'expresar', 'manifestar', 'proferir', 'articular'],
  'hacer': ['realizar', 'ejecutar', 'llevar a cabo', 'efectuar'],
  'ir': ['partir', 'marcharse', 'dirigirse', 'encaminarse'],
  'venir': ['arribar', 'llegar', 'presentarse', 'acudir'],
  'dar': ['otorgar', 'regalar', 'entregar', 'conferir', 'facilitar'],
  'tomar': ['coger', 'asir', 'agarrar', 'capturar', 'aprehender'],
  'poner': ['colocar', 'situar', 'depositar', 'instalar', 'ubicar'],
  'quitar': ['sacar', 'extirpar', 'despojar', 'arrebatar', 'sustraer'],
  'ver': ['observar', 'mirar', 'contemplar', 'visualizar', 'percibir'],
  'mirar': ['observar', 'contemplar', 'examinar', 'escudriñar', 'avistar'],
  'oír': ['escuchar', 'percibir', 'auscultar'],
  'sentir': ['experimentar', 'padecer', 'soportar', 'percibir'],
  'pensar': ['reflexionar', 'meditar', 'considerar', 'rumiar', 'cavilar'],
  'saber': ['conocer', 'estar enterado', 'dominir', 'comprender'],
  'poder': ['ser capaz', 'tener capacidad', 'lograr'],
  'querer': ['desear', 'anhelar', 'apetecer', 'aspirar', 'pretender'],
  'deber': ['estar obligado', 'tener que', 'ser necesario'],
  'creer': ['opinar', 'juzgar', 'estimar', 'pensar', 'suponer'],
  'parecer': ['asemejar', 'semejanza', 'apariencia'],
  'encontrar': ['hallar', 'descubrir', 'ubicar', 'localizar', 'tropezar'],
  'buscar': ['indagar', 'investigar', 'explorar', 'rastrear', 'perseguir'],
  'empezar': ['iniciar', 'comenzar', 'principiar', 'arrancar'],
  'terminar': ['finalizar', 'concluir', 'acabar', 'culminar', 'cesación'],
  'continuar': ['proseguir', 'persistir', 'seguir', 'mantener'],
  'cambiar': ['transformar', 'mudar', 'alterar', 'variar', 'modificar'],
  'dejar': ['abandonar', 'desistir', 'renunciar', 'ceder'],
  'llamar': ['invocar', 'convocar', 'evocar', 'nombrar'],
  'traer': ['conducir', 'portar', 'acarrear', 'transportar'],
  'llevar': ['conducir', 'trasportar', 'cargar', 'arrastrar'],
  'esperar': ['aguardar', 'posponer', 'aplazar', 'confiar'],
  'vivir': ['existir', 'habitar', 'residir', 'perdurar'],
  'morir': ['fallecer', 'expirar', 'perecer', 'sucumbir'],
  'nacer': ['originarse', 'surgir', 'emerger', 'brotar'],
  'trabajar': ['laborar', 'faenas', 'ocuparse', 'trajinar'],
  'estudiar': ['aprender', 'investigar', 'analizar', 'examinar'],
  'enseñar': ['instruir', 'educar', 'capacitar', 'mostrar'],
  'aprender': ['asimilar', 'memorizar', 'adquirir conocimiento'],
  'ganar': ['obtener', 'conseguir', 'lograr', 'vencer'],
  'perder': ['extraviarse', 'descaminarse', 'fracasar', 'malgastar'],
  'producir': ['fabricar', 'manufacturar', 'originar', 'engendrar'],
  'vender': ['comercializar', 'negociar', 'traficar'],
  'comprar': ['adquirir', 'mercadear', 'procurar'],
  'recibir': ['aceptar', 'admitir', 'acogida', 'obtener'],
  'beber': ['sorber', 'tragar', 'ingerir'],
  'comer': ['consumir', 'devorar', 'saborear', 'alimentarse'],
  'dormir': ['reposar', 'descansar', 'yacer', 'conciliar el sueño'],
  'caminar': ['andar', 'marchar', 'transitar', 'desplazarse'],
  'correr': ['trotar', 'galopar', 'velocidad', 'precipitarse'],
  'saltar': ['brincar', 'botar', 'lanzarse'],
  'nadar': ['flotar', 'sumergirse', 'bucear'],
  'volar': ['elevar', 'ascender', 'planear', 'revolotear'],
  'cantar': ['entonar', 'tararear', 'modular', 'trinar'],
  'bailar': ['danzar', 'moverse rítmicamente'],
  'jugar': ['divertirse', 'recrearse', 'participar'],
  'pelear': ['combatir', 'luchar', 'batallar', 'contender'],
  'reír': ['carcajada', 'reírse', 'sonreír', 'bromear'],
  'llorar': ['sollozar', 'lamentar', 'deplorarse'],
  'gritar': ['vociferar', 'exclamar', 'clamar', 'berrea'],
  'susurrar': ['murmura', 'cuchichear', 'susurro'],
  'cansar': ['agotar', 'extenuarse', 'fatigar'],
  'descansar': ['reposar', 'recuperarse', 'recobrar fuerzas'],

  // Nouns - Common Objects
  'casa': ['hogar', 'vivienda', 'domicilio', 'morada', 'caseron'],
  'puerta': ['entrada', 'acceso', 'portal'],
  'ventana': ['abertura', 'hueco', 'luz'],
  'calle': ['vía', 'camino', 'sendero', 'carrera'],
  'árbol': ['planta', 'vegetal', 'arbustillo'],
  'flor': ['floración', 'blossom', 'capullo'],
  'agua': ['líquido', 'fluido', 'caudal'],
  'pan': ['alimento', 'sustento', 'bollo'],
  'carne': ['alimento', 'materia', 'tela'],
  'fruta': ['producto', 'cosecha', 'agraz'],
  'verdura': ['hortaliza', 'legumbre'],

  // Nouns - Abstract
  'amor': ['afecto', 'pasión', 'cariño', 'ternura', 'devoción'],
  'odio': ['aversión', 'aborrecimiento', 'enemistad', 'rencor'],
  'alegría': ['felicidad', 'regocijo', 'júbilo', 'contento'],
  'tristeza': ['melancolía', 'pesar', 'desventura', 'congoja'],
  'miedo': ['terror', 'pánico', 'espanto', 'fobia', 'aprensión'],
  'esperanza': ['ilusión', 'expectativa', 'optimismo', 'confianza'],
  'verdad': ['certeza', 'realidad', 'veracidad', 'exactitud'],
  'mentira': ['falsedad', 'engaño', 'impostura', 'patraña'],
  'belleza': ['hermosura', 'gracia', 'esplendor', 'atractivo'],
  'fealdad': ['deformidad', 'grotescidad', 'aspecto desagradable'],
  'trabajo': ['labor', 'tarea', 'ocupación', 'faena', 'empleo'],
  'descanso': ['reposo', 'ocio', 'relajación', 'pausa'],
  'guerra': ['conflicto', 'batalla', 'combate', 'contienda'],
  'paz': ['sosiego', 'tranquilidad', 'armonía', 'concordia'],
  'muerte': ['fallecimiento', 'defunción', 'óbito', 'término'],
  'vida': ['existencia', 'vivencia', 'biología'],
  'dinero': ['moneda', 'capital', 'fondos', 'recursos'],
  'poder': ['autoridad', 'dominio', 'control', 'influencia'],
  'derecho': ['prerrogativa', 'facultad', 'privilegio', 'justicia'],
  'ley': ['norma', 'código', 'regla', 'ordenanza'],
  'libertad': ['independencia', 'autonomía', 'emancipación'],
  'esclavitud': ['servidumbre', 'cautividad', 'opresión'],
  'conocimiento': ['saber', 'ciencia', 'sabiduría', 'información'],
  'ignorancia': ['desconocimiento', 'incultura', 'oscurantismo'],
  'envidia': ['celos', 'rivalidad', 'rencor'],
  'orgullo': ['vanidad', 'soberbia', 'altivez'],
  'humildad': ['modestia', 'sencillez', 'simplicidad'],
  'vergüenza': ['pudor', 'bochorno', 'deshonra'],

  // Temporal
  'tiempo': ['época', 'período', 'era', 'momento'],
  'día': ['jornada', 'luz solar'],
  'noche': ['oscuridad', 'tinieblas', 'penumbra'],
  'año': ['anualidad', 'ejercicio'],
  'mes': ['lunación', 'período mensual'],
  'semana': ['período semanal', 'heptada'],
  'hora': ['momento', 'instante'],

  // Spatial
  'arriba': ['superior', 'elevado', 'alto'],
  'abajo': ['inferior', 'bajo', 'descendido'],
  'dentro': ['interior', 'interno', 'introspectivo'],
  'fuera': ['exterior', 'externo', 'afuera'],
  'derecha': ['diestro', 'derecho'],
  'izquierda': ['siniestro', 'zurdo'],
};

// Antonym mappings for adjectives and some verbs
const antonymMappings = {
  'grande': ['pequeño', 'diminuto', 'minúsculo'],
  'pequeño': ['grande', 'amplio', 'vasto'],
  'largo': ['corto', 'breve'],
  'corto': ['largo', 'extenso', 'prolongado'],
  'bonito': ['feo', 'desagradable', 'horrible'],
  'feo': ['bonito', 'hermoso', 'bello'],
  'bueno': ['malo', 'pésimo', 'mediocre'],
  'malo': ['bueno', 'excelente', 'óptimo'],
  'nuevo': ['viejo', 'antiguo', 'arcaico'],
  'viejo': ['nuevo', 'reciente', 'moderno'],
  'feliz': ['triste', 'infeliz', 'desventurado'],
  'triste': ['feliz', 'alegre', 'joyoso'],
  'fuerte': ['débil', 'frágil', 'delicado'],
  'débil': ['fuerte', 'robusto', 'vigoroso'],
  'rápido': ['lento', 'pausado', 'moroso'],
  'lento': ['rápido', 'veloz', 'acelerado'],
  'fácil': ['difícil', 'complicado', 'arduo'],
  'difícil': ['fácil', 'simple', 'sencillo'],
  'arriba': ['abajo', 'inferior', 'bajo'],
  'abajo': ['arriba', 'superior', 'elevado'],
  'dentro': ['fuera', 'exterior', 'externo'],
  'fuera': ['dentro', 'interior', 'interno'],
  'derecha': ['izquierda', 'siniestro'],
  'izquierda': ['derecha', 'diestro'],
  'blanco': ['negro', 'oscuro'],
  'negro': ['blanco', 'claro', 'luminoso'],
  'claro': ['oscuro', 'sombrío', 'tenebroso'],
  'oscuro': ['claro', 'luminoso', 'resplandeciente'],
  'caliente': ['frío', 'gélido', 'helado'],
  'frío': ['caliente', 'ardiente', 'abrasador'],
  'mojado': ['seco', 'árido'],
  'seco': ['mojado', 'húmedo', 'empapado'],
  'limpio': ['sucio', 'inmundo', 'tiznado'],
  'sucio': ['limpio', 'impoluto', 'reluciente'],
  'dulce': ['amargo', 'acre', 'áspero'],
  'amargo': ['dulce', 'azucarado', 'meloso'],
  'paz': ['guerra', 'conflicto', 'batalla'],
  'guerra': ['paz', 'sosiego', 'tranquilidad'],
  'vida': ['muerte', 'fallecimiento', 'defunción'],
  'muerte': ['vida', 'existencia', 'nacimiento'],
  'amor': ['odio', 'aversión', 'aborrecimiento'],
  'odio': ['amor', 'afecto', 'cariño'],
  'verdad': ['mentira', 'falsedad', 'engaño'],
  'mentira': ['verdad', 'certeza', 'realidad'],
  'libertad': ['esclavitud', 'servidumbre', 'cautividad'],
  'esclavitud': ['libertad', 'independencia', 'autonomía'],
  'riqueza': ['pobreza', 'indigencia', 'miseria'],
  'pobreza': ['riqueza', 'opulencia', 'abundancia'],
  'éxito': ['fracaso', 'derrota', 'ruina'],
  'fracaso': ['éxito', 'triunfo', 'victoria'],
};

// Related word groupings (words that commonly appear together)
const relatedWordGroupings = {
  // Family
  'padre': ['madre', 'hijo', 'abuelo', 'hermano', 'tío'],
  'madre': ['padre', 'hijo', 'abuela', 'hermana', 'tía'],
  'hijo': ['padre', 'madre', 'abuelo', 'hermano', 'tío'],
  'hermano': ['hermana', 'padre', 'madre', 'primo'],
  'abuelo': ['abuela', 'padre', 'madre', 'nieto'],

  // Colors
  'rojo': ['rosado', 'carmesí', 'escarlata', 'bermejo'],
  'azul': ['celeste', 'índigo', 'cobalto'],
  'verde': ['esmeralda', 'oliva', 'salvia'],
  'amarillo': ['oro', 'limón', 'canario'],
  'negro': ['carbón', 'ebano', 'tinta'],
  'blanco': ['nieve', 'perla', 'marfil'],

  // Animals
  'perro': ['gato', 'animal', 'mascota', 'canino'],
  'gato': ['perro', 'animal', 'mascota', 'felino'],
  'caballo': ['potro', 'yegua', 'jinete'],
  'vaca': ['toro', 'buey', 'ternera'],
  'pájaro': ['ave', 'pluma', 'nido'],

  // Food
  'pan': ['trigo', 'harina', 'levadura', 'panadería'],
  'carne': ['res', 'pollo', 'cerdo', 'carnicería'],
  'fruta': ['árbol', 'cosecha', 'dulce', 'jugosa'],
  'verdura': ['huerto', 'hortaliza', 'verde'],

  // Body parts
  'cabeza': ['cara', 'ojo', 'oído', 'nariz'],
  'mano': ['dedo', 'palma', 'brazo'],
  'pie': ['dedo', 'talón', 'pierna'],
  'ojo': ['vista', 'pupila', 'párpado'],
  'corazón': ['pecho', 'sangre', 'latido'],
  'cerebro': ['mente', 'inteligencia', 'pensamiento'],
};

/**
 * Generate synonyms for a word
 * @param {string} word - The Spanish word
 * @returns {string[]} Array of synonyms
 */
function generateSynonyms(word) {
  if (synonymMappings[word]) {
    return synonymMappings[word];
  }
  return [];
}

/**
 * Generate antonyms for a word
 * @param {string} word - The Spanish word
 * @returns {string[]} Array of antonyms
 */
function generateAntonyms(word) {
  if (antonymMappings[word]) {
    return antonymMappings[word];
  }
  return [];
}

/**
 * Generate related words for a word
 * @param {string} word - The Spanish word
 * @returns {string[]} Array of related words
 */
function generateRelatedWords(word) {
  if (relatedWordGroupings[word]) {
    return relatedWordGroupings[word];
  }
  return [];
}

/**
 * Enrich a word object with synonyms and antonyms
 * @param {object} word - Word object from vocabulary
 * @returns {object} Enriched word object
 */
function enrichWordRelations(word) {
  const enriched = { ...word };

  // Initialize relations if not present
  if (!enriched.relations) {
    enriched.relations = {};
  }

  // Add synonyms (avoid duplicates)
  const synonyms = generateSynonyms(word.word);
  if (synonyms.length > 0 && (!enriched.relations.synonyms || enriched.relations.synonyms.length === 0)) {
    enriched.relations.synonyms = synonyms;
  }

  // Add antonyms (avoid duplicates)
  const antonyms = generateAntonyms(word.word);
  if (antonyms.length > 0 && (!enriched.relations.antonyms || enriched.relations.antonyms.length === 0)) {
    enriched.relations.antonyms = antonyms;
  }

  // Add related words (avoid duplicates)
  const related = generateRelatedWords(word.word);
  if (related.length > 0 && (!enriched.relations.related || enriched.relations.related.length === 0)) {
    enriched.relations.related = related;
  }

  return enriched;
}

export {
  generateSynonyms,
  generateAntonyms,
  generateRelatedWords,
  enrichWordRelations,
  synonymMappings,
  antonymMappings,
  relatedWordGroupings
};
