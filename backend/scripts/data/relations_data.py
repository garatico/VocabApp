"""
relations_data.py — Synonym / antonym / related-word data for VocabApp pipeline
================================================================================
Provides get_relations(word, lang) for use during corpus enrichment.

Resolution: hand-curated lookup only — returns None for unknown words.
Only fills empty relation arrays; won't overwrite anything already in the DB.

Currently supports: 'spa' (Spanish)
To add a language: add entries to SYNONYMS, ANTONYMS, and RELATED below.
"""

from typing import Optional

# ══════════════════════════════════════════════════════════════════════════════
# SYNONYMS  — all entries must be valid Spanish words / phrases of the same POS
# ══════════════════════════════════════════════════════════════════════════════

SYNONYMS: dict[str, dict[str, list[str]]] = {

    'spa': {

        # ── Adjectives: size ──────────────────────────────────────────────────
        'grande':    ['amplio', 'vasto', 'extenso', 'inmenso', 'colosal'],
        'pequeño':   ['diminuto', 'minúsculo', 'chico', 'reducido', 'menudo'],
        'largo':     ['extenso', 'prolongado', 'dilatado'],
        'corto':     ['breve', 'reducido', 'ceñido'],

        # ── Adjectives: quality ───────────────────────────────────────────────
        'bonito':    ['hermoso', 'bello', 'precioso', 'lindo', 'atractivo'],
        'feo':       ['desagradable', 'horrible', 'repugnante', 'grotesco'],
        'bueno':     ['excelente', 'óptimo', 'magnífico', 'espléndido', 'superior'],
        'malo':      ['pésimo', 'horrible', 'terrible', 'execrable', 'mediocre'],
        'nuevo':     ['reciente', 'flamante', 'moderno', 'inédito'],
        'viejo':     ['antiguo', 'arcaico', 'obsoleto', 'vetusto'],   # was 'vetustez' (noun)

        # ── Adjectives: emotion / state ───────────────────────────────────────
        'feliz':     ['alegre', 'contento', 'joyoso', 'dichoso', 'radiante'],
        'triste':    ['melancólico', 'infeliz', 'desventurado', 'lúgubre', 'sombrío'],
        'fuerte':    ['robusto', 'vigoroso', 'potente', 'musculoso', 'resistente'],
        'débil':     ['frágil', 'endeble', 'decrépito', 'delicado'],
        'cansado':   ['fatigado', 'exhausto', 'agotado', 'extenuado'],
        'tranquilo': ['sereno', 'apacible', 'sosegado', 'plácido', 'imperturbable'],

        # ── Verbs: communication ──────────────────────────────────────────────
        'hablar':    ['conversar', 'charlar', 'dialogar', 'platicar', 'comunicar'],
        'decir':     ['afirmar', 'expresar', 'manifestar', 'articular'],
        'llamar':    ['invocar', 'convocar', 'evocar', 'nombrar'],
        'gritar':    ['vociferar', 'exclamar', 'clamar', 'berrear'],   # was 'berrea' (conjugated)
        'susurrar':  ['murmurar', 'cuchichear', 'bisbisear'],          # was 'murmura' (conjugated) + 'susurro' (noun)
        'cantar':    ['entonar', 'tararear', 'modular', 'trinar'],

        # ── Verbs: motion ─────────────────────────────────────────────────────
        'ir':        ['partir', 'marcharse', 'dirigirse', 'encaminarse'],
        'venir':     ['arribar', 'llegar', 'presentarse', 'acudir'],
        'caminar':   ['andar', 'marchar', 'transitar', 'desplazarse'],
        'correr':    ['trotar', 'galopar', 'precipitarse'],            # removed 'velocidad' (noun)
        'saltar':    ['brincar', 'botar', 'lanzarse'],
        'nadar':     ['flotar', 'sumergirse', 'bucear'],
        'volar':     ['planear', 'revolotear', 'ascender'],
        'traer':     ['conducir', 'portar', 'acarrear', 'transportar'],
        'llevar':    ['conducir', 'transportar', 'cargar', 'arrastrar'],

        # ── Verbs: action / general ───────────────────────────────────────────
        'hacer':     ['realizar', 'ejecutar', 'efectuar', 'llevar a cabo'],
        'dar':       ['otorgar', 'regalar', 'entregar', 'conferir', 'facilitar'],
        'tomar':     ['coger', 'asir', 'agarrar', 'capturar'],
        'poner':     ['colocar', 'situar', 'depositar', 'instalar', 'ubicar'],
        'quitar':    ['sacar', 'despojar', 'arrebatar', 'sustraer'],
        'buscar':    ['indagar', 'investigar', 'explorar', 'rastrear', 'perseguir'],
        'encontrar': ['hallar', 'descubrir', 'ubicar', 'localizar'],
        'empezar':   ['iniciar', 'comenzar', 'principiar', 'arrancar'],
        'terminar':  ['finalizar', 'concluir', 'acabar', 'culminar'],  # removed 'cesación' (noun)
        'continuar': ['proseguir', 'persistir', 'seguir', 'mantener'],
        'cambiar':   ['transformar', 'mudar', 'alterar', 'variar', 'modificar'],
        'dejar':     ['abandonar', 'desistir', 'renunciar', 'ceder'],
        'esperar':   ['aguardar', 'posponer', 'aplazar', 'confiar'],
        'trabajar':  ['laborar', 'ocuparse', 'trajinar'],              # removed 'faenas' (noun)
        'estudiar':  ['aprender', 'investigar', 'analizar', 'examinar'],
        'enseñar':   ['instruir', 'educar', 'capacitar', 'mostrar'],
        'aprender':  ['asimilar', 'memorizar', 'adquirir conocimiento'],
        'ganar':     ['obtener', 'conseguir', 'lograr', 'vencer'],
        'perder':    ['extraviarse', 'descaminarse', 'fracasar', 'malgastar'],
        'producir':  ['fabricar', 'manufacturar', 'originar', 'engendrar'],
        'vender':    ['comercializar', 'negociar', 'traficar'],
        'comprar':   ['adquirir', 'procurar', 'mercadear'],
        'recibir':   ['aceptar', 'admitir', 'obtener'],               # removed 'acogida' (noun)
        'pelear':    ['combatir', 'luchar', 'batallar', 'contender'],
        'bailar':    ['danzar', 'moverse'],
        'jugar':     ['divertirse', 'recrearse', 'participar'],

        # ── Verbs: perception / cognition ─────────────────────────────────────
        'ver':       ['observar', 'mirar', 'contemplar', 'visualizar', 'percibir'],
        'mirar':     ['observar', 'contemplar', 'examinar', 'escudriñar', 'avistar'],
        'oír':       ['escuchar', 'percibir', 'auscultar'],
        'sentir':    ['experimentar', 'padecer', 'percibir'],
        'pensar':    ['reflexionar', 'meditar', 'considerar', 'rumiar', 'cavilar'],
        'saber':     ['conocer', 'estar enterado', 'dominar', 'comprender'],  # was 'dominir'
        'poder':     ['ser capaz', 'tener capacidad', 'lograr'],
        'querer':    ['desear', 'anhelar', 'apetecer', 'aspirar'],
        'deber':     ['estar obligado', 'tener que', 'ser necesario'],
        'creer':     ['opinar', 'juzgar', 'estimar', 'suponer'],
        'parecer':   ['aparentar', 'asemejarse', 'semejar'],          # removed 'semejanza'/'apariencia' (nouns)
        'entender':  ['comprender', 'captar', 'descifrar'],

        # ── Verbs: life / physical state ──────────────────────────────────────
        'vivir':     ['existir', 'habitar', 'residir', 'perdurar'],
        'morir':     ['fallecer', 'expirar', 'perecer', 'sucumbir'],
        'nacer':     ['originarse', 'surgir', 'emerger', 'brotar'],
        'beber':     ['sorber', 'tragar', 'ingerir'],
        'comer':     ['consumir', 'devorar', 'saborear', 'alimentarse'],
        'dormir':    ['reposar', 'descansar', 'yacer'],
        'reír':      ['sonreír', 'carcajearse', 'bromear'],           # removed 'carcajada' (noun) + 'reírse' (reflexive duplicate)
        'llorar':    ['sollozar', 'lamentar', 'deplorar'],
        'cansar':    ['agotar', 'extenuarse', 'fatigar'],
        'descansar': ['reposar', 'recuperarse', 'recobrar fuerzas'],

        # ── Nouns: common objects ─────────────────────────────────────────────
        'casa':      ['hogar', 'vivienda', 'domicilio', 'morada'],
        'puerta':    ['entrada', 'acceso', 'portal'],
        'ventana':   ['abertura', 'hueco'],
        'calle':     ['vía', 'camino', 'sendero', 'carrera'],
        'árbol':     ['planta', 'vegetal'],
        'flor':      ['floración', 'capullo', 'florecilla'],          # removed 'blossom' (English!)
        'agua':      ['líquido', 'fluido', 'caudal'],
        'pan':       ['alimento', 'sustento', 'bollo'],
        'carne':     ['alimento', 'materia'],
        'fruta':     ['producto', 'cosecha'],
        'verdura':   ['hortaliza', 'legumbre'],

        # ── Nouns: abstract ───────────────────────────────────────────────────
        'amor':          ['afecto', 'pasión', 'cariño', 'ternura', 'devoción'],
        'odio':          ['aversión', 'aborrecimiento', 'enemistad', 'rencor'],
        'alegría':       ['felicidad', 'regocijo', 'júbilo', 'contento'],
        'tristeza':      ['melancolía', 'pesar', 'desventura', 'congoja'],
        'miedo':         ['terror', 'pánico', 'espanto', 'fobia', 'aprensión'],
        'esperanza':     ['ilusión', 'expectativa', 'optimismo', 'confianza'],
        'verdad':        ['certeza', 'realidad', 'veracidad', 'exactitud'],
        'mentira':       ['falsedad', 'engaño', 'impostura', 'patraña'],
        'belleza':       ['hermosura', 'gracia', 'esplendor', 'atractivo'],
        'fealdad':       ['deformidad', 'aspecto desagradable'],
        'trabajo':       ['labor', 'tarea', 'ocupación', 'faena', 'empleo'],
        'descanso':      ['reposo', 'ocio', 'relajación', 'pausa'],
        'guerra':        ['conflicto', 'batalla', 'combate', 'contienda'],
        'paz':           ['sosiego', 'tranquilidad', 'armonía', 'concordia'],
        'muerte':        ['fallecimiento', 'defunción', 'óbito', 'término'],
        'vida':          ['existencia', 'vivencia', 'vitalidad'],     # removed 'biología' (wrong sense)
        'dinero':        ['moneda', 'capital', 'fondos', 'recursos'],
        'poder':         ['autoridad', 'dominio', 'control', 'influencia'],
        'derecho':       ['prerrogativa', 'facultad', 'privilegio', 'justicia'],
        'ley':           ['norma', 'código', 'regla', 'ordenanza'],
        'libertad':      ['independencia', 'autonomía', 'emancipación'],
        'esclavitud':    ['servidumbre', 'cautividad', 'opresión'],
        'conocimiento':  ['saber', 'ciencia', 'sabiduría', 'información'],
        'ignorancia':    ['desconocimiento', 'incultura', 'oscurantismo'],
        'envidia':       ['celos', 'rivalidad', 'rencor'],
        'orgullo':       ['vanidad', 'soberbia', 'altivez'],
        'humildad':      ['modestia', 'sencillez', 'simplicidad'],
        'vergüenza':     ['pudor', 'bochorno', 'deshonra'],

        # ── Temporal ──────────────────────────────────────────────────────────
        'tiempo':    ['época', 'período', 'era', 'momento'],
        'día':       ['jornada', 'luz solar'],
        'noche':     ['oscuridad', 'tinieblas', 'penumbra'],
        'año':       ['anualidad', 'ejercicio'],
        'mes':       ['lunación'],
        'semana':    ['heptada'],
        'hora':      ['momento', 'instante'],

        # ── Spatial ───────────────────────────────────────────────────────────
        'arriba':    ['superior', 'elevado', 'alto'],
        'abajo':     ['inferior', 'bajo'],
        'dentro':    ['interior', 'interno'],
        'fuera':     ['exterior', 'externo', 'afuera'],
        'derecha':   ['diestro'],
        'izquierda': ['siniestro', 'zurdo'],
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# ANTONYMS
# ══════════════════════════════════════════════════════════════════════════════

ANTONYMS: dict[str, dict[str, list[str]]] = {

    'spa': {
        # Size / length
        'grande':   ['pequeño', 'diminuto', 'minúsculo'],
        'pequeño':  ['grande', 'amplio', 'vasto'],
        'largo':    ['corto', 'breve'],
        'corto':    ['largo', 'extenso', 'prolongado'],

        # Quality
        'bonito':   ['feo', 'desagradable', 'horrible'],
        'feo':      ['bonito', 'hermoso', 'bello'],
        'bueno':    ['malo', 'pésimo', 'mediocre'],
        'malo':     ['bueno', 'excelente', 'óptimo'],
        'nuevo':    ['viejo', 'antiguo', 'arcaico'],
        'viejo':    ['nuevo', 'reciente', 'moderno'],

        # Emotion / state
        'feliz':    ['triste', 'infeliz', 'desventurado'],
        'triste':   ['feliz', 'alegre', 'joyoso'],
        'fuerte':   ['débil', 'frágil', 'delicado'],
        'débil':    ['fuerte', 'robusto', 'vigoroso'],
        'cansado':  ['descansado', 'activo', 'enérgico'],
        'tranquilo':['agitado', 'inquieto', 'nervioso'],

        # Speed / difficulty
        'rápido':   ['lento', 'pausado', 'moroso'],
        'lento':    ['rápido', 'veloz', 'acelerado'],
        'fácil':    ['difícil', 'complicado', 'arduo'],
        'difícil':  ['fácil', 'simple', 'sencillo'],

        # Direction / position
        'arriba':   ['abajo', 'inferior', 'bajo'],
        'abajo':    ['arriba', 'superior', 'elevado'],
        'dentro':   ['fuera', 'exterior', 'externo'],
        'fuera':    ['dentro', 'interior', 'interno'],
        'derecha':  ['izquierda', 'siniestro'],
        'izquierda':['derecha', 'diestro'],

        # Colour / light
        'blanco':   ['negro', 'oscuro'],
        'negro':    ['blanco', 'claro', 'luminoso'],
        'claro':    ['oscuro', 'sombrío', 'tenebroso'],
        'oscuro':   ['claro', 'luminoso', 'resplandeciente'],

        # Temperature / texture
        'caliente': ['frío', 'gélido', 'helado'],
        'frío':     ['caliente', 'ardiente', 'abrasador'],
        'mojado':   ['seco', 'árido'],
        'seco':     ['mojado', 'húmedo', 'empapado'],
        'limpio':   ['sucio', 'inmundo'],
        'sucio':    ['limpio', 'impoluto', 'reluciente'],
        'dulce':    ['amargo', 'acre', 'áspero'],
        'amargo':   ['dulce', 'azucarado', 'meloso'],

        # Abstract nouns
        'paz':         ['guerra', 'conflicto', 'batalla'],
        'guerra':      ['paz', 'sosiego', 'tranquilidad'],
        'vida':        ['muerte', 'fallecimiento', 'defunción'],
        'muerte':      ['vida', 'existencia', 'nacimiento'],
        'amor':        ['odio', 'aversión', 'aborrecimiento'],
        'odio':        ['amor', 'afecto', 'cariño'],
        'verdad':      ['mentira', 'falsedad', 'engaño'],
        'mentira':     ['verdad', 'certeza', 'realidad'],
        'libertad':    ['esclavitud', 'servidumbre', 'cautividad'],
        'esclavitud':  ['libertad', 'independencia', 'autonomía'],
        'riqueza':     ['pobreza', 'indigencia', 'miseria'],
        'pobreza':     ['riqueza', 'opulencia', 'abundancia'],
        'éxito':       ['fracaso', 'derrota', 'ruina'],
        'fracaso':     ['éxito', 'triunfo', 'victoria'],
        'alegría':     ['tristeza', 'melancolía', 'pesar'],
        'tristeza':    ['alegría', 'felicidad', 'regocijo'],
        'esperanza':   ['desesperanza', 'pesimismo', 'desesperación'],
        'conocimiento':['ignorancia', 'desconocimiento'],
        'ignorancia':  ['conocimiento', 'saber', 'sabiduría'],
        'orgullo':     ['humildad', 'modestia', 'sencillez'],
        'humildad':    ['orgullo', 'vanidad', 'soberbia'],
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# RELATED WORDS  — semantically associated, not synonymous
# ══════════════════════════════════════════════════════════════════════════════

RELATED: dict[str, dict[str, list[str]]] = {

    'spa': {
        # Family
        'padre':    ['madre', 'hijo', 'abuelo', 'hermano', 'tío'],
        'madre':    ['padre', 'hijo', 'abuela', 'hermana', 'tía'],
        'hijo':     ['padre', 'madre', 'abuelo', 'hermano'],
        'hermano':  ['hermana', 'padre', 'madre', 'primo'],
        'abuelo':   ['abuela', 'padre', 'madre', 'nieto'],

        # Colours (related shades)
        'rojo':     ['rosado', 'carmesí', 'escarlata', 'bermejo'],
        'azul':     ['celeste', 'índigo', 'cobalto'],
        'verde':    ['esmeralda', 'oliva', 'salvia'],
        'amarillo': ['dorado', 'limón', 'canario'],
        'negro':    ['carbón', 'ébano', 'tinta'],
        'blanco':   ['nieve', 'perla', 'marfil'],

        # Animals
        'perro':    ['gato', 'animal', 'mascota', 'canino'],
        'gato':     ['perro', 'animal', 'mascota', 'felino'],
        'caballo':  ['potro', 'yegua', 'jinete'],
        'vaca':     ['toro', 'buey', 'ternera'],
        'pájaro':   ['ave', 'pluma', 'nido'],

        # Food
        'pan':      ['trigo', 'harina', 'levadura', 'panadería'],
        'carne':    ['res', 'pollo', 'cerdo', 'carnicería'],
        'fruta':    ['árbol', 'cosecha', 'dulce'],
        'verdura':  ['huerto', 'hortaliza'],

        # Body parts
        'cabeza':   ['cara', 'ojo', 'oído', 'nariz'],
        'mano':     ['dedo', 'palma', 'brazo'],
        'pie':      ['dedo', 'talón', 'pierna'],
        'ojo':      ['vista', 'pupila', 'párpado'],
        'corazón':  ['pecho', 'sangre', 'latido'],
        'cerebro':  ['mente', 'inteligencia', 'pensamiento'],
    },
}

# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def get_relations(word: str, lang: str) -> Optional[dict]:
    """
    Return a relations dict for `word` in `lang` (3-letter code, e.g. 'spa').

    Returns a dict with keys 'synonyms', 'antonyms', 'related' — each a list
    of strings. Only includes keys that have at least one entry.
    Returns None if no relation data exists for this word.
    """
    if not word or not lang:
        return None

    w = word.lower()
    result: dict[str, list[str]] = {}

    syns = SYNONYMS.get(lang, {}).get(w)
    if syns:
        result['synonyms'] = syns

    ants = ANTONYMS.get(lang, {}).get(w)
    if ants:
        result['antonyms'] = ants

    rel = RELATED.get(lang, {}).get(w)
    if rel:
        result['related'] = rel

    return result if result else None
