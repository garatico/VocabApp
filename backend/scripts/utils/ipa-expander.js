/**
 * ipa-expander.js
 *
 * Spanish IPA pronunciation rules and lookup table
 * Fills in missing IPA transcriptions using phonetic rules
 */

// Explicit IPA mappings for common words and irregular pronunciations
const ipaLookup = {
  // Common articles
  'el': '[el]',
  'la': '[la]',
  'los': '[los]',
  'las': '[las]',
  'un': '[un]',
  'una': '[ˈu.na]',
  'unos': '[ˈu.nos]',
  'unas': '[ˈu.nas]',

  // Common prepositions
  'de': '[de]',
  'en': '[en]',
  'a': '[a]',
  'por': '[por]',
  'para': '[ˈpa.ra]',
  'con': '[kon]',
  'sin': '[sin]',
  'desde': '[ˈdes.de]',
  'hasta': '[ˈas.ta]',
  'entre': '[ˈen.tre]',
  'según': '[seˈɡun]',
  'durante': '[duˈɾan.te]',
  'mediante': '[meˈðjan.te]',

  // Common verbs
  'ser': '[ser]',
  'estar': '[esˈtar]',
  'haber': '[aˈβeɾ]',
  'tener': '[teˈneɾ]',
  'hacer': '[aˈθeɾ]',
  'ir': '[iɾ]',
  'poder': '[poˈðeɾ]',
  'decir': '[deˈθiɾ]',
  'dar': '[daɾ]',
  'saber': '[saˈβeɾ]',
  'querer': '[keˈɾeɾ]',
  'deber': '[deˈβeɾ]',
  'poner': '[poˈneɾ]',
  'parecer': '[paˈɾeθeɾ]',
  'dejar': '[deˈxaɾ]',
  'seguir': '[seˈɣiɾ]',
  'encontrar': '[enkonˈtɾaɾ]',
  'llamar': '[ʎaˈmaɾ]',
  'venir': '[beˈniɾ]',
  'pensar': '[penˈsaɾ]',
  'salir': '[saˈliɾ]',
  'volver': '[bolˈbeɾ]',
  'tomar': '[toˈmaɾ]',
  'conocer': '[konoˈθeɾ]',
  'vivir': '[biˈβiɾ]',
  'sentir': '[senˈtiɾ]',
  'tratar': '[tɾaˈtaɾ]',
  'mirar': '[miˈɾaɾ]',
  'contar': '[konˈtaɾ]',
  'empezar': '[empeˈθaɾ]',
  'esperar': '[espeˈɾaɾ]',
  'buscar': '[busˈkaɾ]',
  'existir': '[ekˈsis.tiɾ]',
  'entrar': '[enˈtɾaɾ]',
  'trabajar': '[tɾaˈβa.xaɾ]',
  'escribir': '[eskɾiˈβiɾ]',
  'perder': '[peɾˈðeɾ]',
  'producir': '[pɾoðuˈθiɾ]',
  'ocurrir': '[okuˈɾiɾ]',
  'entender': '[entenˈdeɾ]',
  'pedir': '[peˈðiɾ]',
  'recibir': '[reθiˈβiɾ]',
  'recordar': '[ɾekoɾˈðaɾ]',
  'terminar': '[teɾmiˈnaɾ]',
  'considerar': '[konsiðeˈɾaɾ]',
  'servir': '[seɾˈβiɾ]',
  'sacar': '[saˈkaɾ]',
  'necesitar': '[neθesiˈtaɾ]',
  'mantener': '[manteˈneɾ]',
  'resultar': '[ɾesulˈtaɾ]',
  'leer': '[leˈeɾ]',
  'caer': '[kaˈeɾ]',
  'cambiar': '[kamˈbjaɾ]',
  'llevar': '[ʎeˈβaɾ]',
  'dejar': '[deˈxaɾ]',
  'seguir': '[seˈɣiɾ]',
  'crear': '[kɾeˈaɾ]',
  'abrir': '[aˈβɾiɾ]',
  'comenzar': '[koˈmeθaɾ]',
  'aumentar': '[awˈmen.taɾ]',

  // Common nouns
  'hombre': '[ˈom.bɾe]',
  'mujer': '[muˈxeɾ]',
  'niño': '[ˈni.ɲo]',
  'niña': '[ˈni.ɲa]',
  'día': '[ˈdi.a]',
  'año': '[ˈa.ɲo]',
  'tiempo': '[ˈtjɛm.po]',
  'cuerpo': '[ˈkweɾ.po]',
  'parte': '[ˈpaɾ.te]',
  'caso': '[ˈka.so]',
  'forma': '[ˈfoɾ.ma]',
  'vida': '[ˈβi.ða]',
  'mano': '[ˈma.no]',
  'lugar': '[luˈɣaɾ]',
  'momento': '[moˈmen.to]',
  'mes': '[mes]',
  'semana': '[seˈma.na]',
  'hora': '[ˈo.ɾa]',
  'minuto': '[miˈnu.to]',
  'segundo': '[seˈɣun.do]',
  'palabra': '[paˈla.βɾa]',
  'ejemplo': '[eˈxem.plo]',
  'razón': '[ɾaˈθon]',
  'lado': '[ˈla.ðo]',
  'centro': '[ˈθen.tɾo]',
  'fuerza': '[ˈfweɾ.θa]',
  'muerte': '[ˈmweɾ.te]',
  'guerra': '[ˈɡe.ɾa]',
  'problema': '[pɾoˈβle.ma]',
  'empresa': '[emˈpɾe.sa]',
  'dinero': '[diˈne.ɾo]',
  'precio': '[ˈpɾe.θjo]',
  'producto': '[pɾoˈðuk.to]',
  'resultado': '[ɾesulˈta.ðo]',
  'tipo': '[ˈti.po]',
  'nivel': '[niˈβel]',
  'mesa': '[ˈme.sa]',
  'puerta': '[ˈpweɾ.ta]',
  'ventana': '[benˈta.na]',
  'calle': '[ˈka.ʎe]',
  'ciudad': '[θiuˈðað]',
  'país': '[paˈis]',
  'pueblo': '[ˈpwe.βlo]',
  'casa': '[ˈka.sa]',
  'agua': '[ˈa.ɣwa]',
  'fuego': '[ˈfwe.ɣo]',
  'aire': '[ˈa.i.ɾe]',
  'tierra': '[ˈtje.ɾa]',
  'árbol': '[ˈaɾ.bol]',
  'flor': '[floɾ]',
  'sol': '[sol]',
  'luna': '[ˈlu.na]',
  'estrella': '[esˈtɾe.ʎa]',

  // Common adjectives
  'grande': '[ˈɡɾan.de]',
  'pequeño': '[peˈke.ɲo]',
  'bueno': '[ˈbwe.no]',
  'malo': '[ˈma.lo]',
  'nuevo': '[ˈnwe.βo]',
  'viejo': '[ˈβje.xo]',
  'largo': '[ˈlaɾ.ɡo]',
  'corto': '[ˈkoɾ.to]',
  'alto': '[ˈal.to]',
  'bajo': '[ˈba.xo]',
  'fuerte': '[ˈfweɾ.te]',
  'débil': '[ˈde.βil]',
  'fácil': '[ˈfa.θil]',
  'difícil': '[diˈfi.θil]',
  'rápido': '[ˈɾa.pi.ðo]',
  'lento': '[ˈlen.to]',
  'oscuro': '[osˈku.ɾo]',
  'claro': '[ˈkla.ɾo]',
  'blanco': '[ˈblan.ko]',
  'negro': '[ˈne.ɣɾo]',
  'rojo': '[ˈɾo.xo]',
  'azul': '[aˈθul]',
  'verde': '[ˈbeɾ.de]',
  'amarillo': '[amaˈɾi.ʎo]',
  'gris': '[ɡɾis]',
  'llamada': '[ʎaˈma.ða]',
  'profundo': '[pɾoˈfun.do]',
  'superficial': '[supeɾfiˈθjal]',
  'importante': '[impoɾˈtan.te]',
  'público': '[ˈpu.βli.ko]',
  'privado': '[pɾiˈβa.ðo]',
  'especial': '[espeˈθjal]',
  'general': '[xeneˈɾal]',
  'único': '[ˈu.ni.ko]',
  'doble': '[ˈðo.βle]',
  'triple': '[ˈtɾi.ple]',
  'múltiple': '[ˈmul.ti.ple]',
  'igual': '[iˈɡwal]',
  'distinto': '[disˈtin.to]',
  'diferente': '[difeˈɾen.te]',
  'mismo': '[ˈmis.mo]',
  'otro': '[ˈo.tɾo]',
  'próximo': '[ˈpɾok.si.mo]',
  'lejano': '[leˈxa.no]',
  'cercano': '[θeɾˈka.no]',
  'presente': '[pɾeˈsen.te]',
  'pasado': '[paˈsa.ðo]',
  'futuro': '[fuˈtu.ɾo]',

  // Numbers
  'uno': '[ˈu.no]',
  'dos': '[dos]',
  'tres': '[tɾes]',
  'cuatro': '[ˈkwa.tɾo]',
  'cinco': '[ˈθin.ko]',
  'seis': '[sejs]',
  'siete': '[ˈsje.te]',
  'ocho': '[ˈo.tʃo]',
  'nueve': '[ˈnwe.βe]',
  'diez': '[ˈdjes]',
  'cien': '[θjen]',
  'mil': '[mil]',

  // Common adverbs
  'aquí': '[aˈki]',
  'allá': '[aˈʎa]',
  'ahora': '[aˈo.ɾa]',
  'entonces': '[enˈton.θes]',
  'todavía': '[toðaˈβi.a]',
  'ya': '[ja]',
  'siempre': '[ˈsjem.pɾe]',
  'nunca': '[ˈnun.ka]',
  'jamás': '[xaˈmas]',
  'apenas': '[aˈpe.nas]',
  'apenas': '[aˈpe.nas]',
  'solamente': '[solaˈmen.te]',
  'solo': '[ˈso.lo]',
  'también': '[tamˈbjen]',
  'tampoco': '[tamˈpo.ko]',
  'bien': '[bjen]',
  'mal': '[mal]',
  'mejor': '[meˈxoɾ]',
  'peor': '[peˈoɾ]',
  'más': '[mas]',
  'menos': '[ˈme.nos]',
  'mucho': '[ˈmu.tʃo]',
  'poco': '[ˈpo.ko]',
  'muy': '[muj]',
  'bastante': '[basˈtan.te]',
};

/**
 * Spanish phonetic rules for generating IPA
 * These rules help generate IPA for words not in the lookup table
 */
const phoneticRules = [
  // Consonant rules
  { pattern: /z(?=[e,i])/, replacement: 'θ' },  // z -> th before e/i
  { pattern: /z/, replacement: 'θ' },            // z -> th (generally)
  { pattern: /j/, replacement: 'x' },            // j -> x (Spanish j sound)
  { pattern: /ll/, replacement: 'ʎ' },           // ll -> ʎ (lateral palatal)
  { pattern: /ñ/, replacement: 'ɲ' },            // ñ -> ɲ
  { pattern: /qu(?=[e,i])/, replacement: 'k' }, // qu -> k before e/i
  { pattern: /h/, replacement: '' },             // h is silent
  { pattern: /c(?=[e,i])/, replacement: 'θ' },  // c -> θ before e/i
  { pattern: /c/, replacement: 'k' },            // c -> k otherwise
  { pattern: /g(?=[e,i])/, replacement: 'x' },  // g -> x before e/i
  { pattern: /g/, replacement: 'ɡ' },            // g -> ɡ otherwise
  { pattern: /v/, replacement: 'β' },            // v -> β (Spanish b/v)
  { pattern: /b/, replacement: 'β' },            // b -> β
  { pattern: /d$/, replacement: 'ð' },           // d -> ð at end
  { pattern: /d/, replacement: 'ð' },            // d -> ð in general
  { pattern: /r(?=[a-z])/, replacement: 'ɾ' },  // r -> ɾ (tap)
  { pattern: /rr/, replacement: 'ɾ' },           // rr -> ɾ (rolled r)

  // Vowel rules (Spanish vowels are generally pure)
  { pattern: /ae/, replacement: 'ae' },
  { pattern: /oa/, replacement: 'oa' },
  { pattern: /ie/, replacement: 'je' },
  { pattern: /ue/, replacement: 'we' },
];

/**
 * Generate IPA for a Spanish word using phonetic rules
 * @param {string} word - Spanish word
 * @returns {string} IPA transcription
 */
function generateIPA(word) {
  // Check if word is in lookup table first
  if (ipaLookup[word.toLowerCase()]) {
    return ipaLookup[word.toLowerCase()];
  }

  // Apply phonetic rules
  let ipa = word.toLowerCase();

  // Apply rules in order
  for (const rule of phoneticRules) {
    ipa = ipa.replace(rule.pattern, rule.replacement);
  }

  // Add basic stress mark on typical Spanish stress patterns
  // Rule: stress on penultimate syllable unless word ends in consonant other than s/n
  const syllables = ipa.split(/(?=[aeiou])/);
  if (syllables.length > 1) {
    const endsInStressableConsonant = /[^sns]$/.test(ipa);
    const stressPos = endsInStressableConsonant ? syllables.length - 2 : syllables.length - 2;

    if (stressPos >= 0 && stressPos < syllables.length) {
      if (!syllables[stressPos].startsWith('ˈ')) {
        syllables[stressPos] = 'ˈ' + syllables[stressPos];
      }
    }
  }

  ipa = syllables.join('');

  // Wrap in brackets
  return `[${ipa}]`;
}

/**
 * Enrich a word with IPA pronunciation
 * @param {object} word - Word object from vocabulary
 * @returns {object} Enriched word object
 */
function enrichWordIPA(word) {
  const enriched = { ...word };

  // Initialize linguistic if not present
  if (!enriched.linguistic) {
    enriched.linguistic = {};
  }

  // Add IPA if missing
  if (!enriched.linguistic.ipa || enriched.linguistic.ipa === '') {
    enriched.linguistic.ipa = generateIPA(word.word);
  }

  return enriched;
}

/**
 * Batch process words to add IPA
 * @param {array} words - Array of word objects
 * @returns {array} Words with IPA enrichment
 */
function enrichWordsWithIPA(words) {
  return words.map(word => enrichWordIPA(word));
}

export {
  generateIPA,
  enrichWordIPA,
  enrichWordsWithIPA,
  ipaLookup,
  phoneticRules
};
