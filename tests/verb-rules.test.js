/**
 * tests/verb-rules.test.js
 *
 * Unit tests for the Spanish verb conjugation engine (verb-rules.js).
 *
 * Each conjugation class is tested with at least one representative verb and
 * spot-checked against the forms that vary most between classes. Full 6-form
 * arrays are only asserted where needed to document the exact output — most
 * tests focus on the forms that the class rule actually changes.
 */

import { describe, it, expect } from 'vitest';
import { conjugate, SUPPORTED_CLASSES } from '../src/server/lib/verb-rules.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** All returned tense keys. */
const TENSES = [
  'present','preterite','imperfect','future','conditional',
  'subjunctive','imperative','gerund','past_participle',
];

function assertShape(forms) {
  for (const t of TENSES) {
    expect(forms, `missing tense: ${t}`).toHaveProperty(t);
  }
  // Scalar tenses
  expect(typeof forms.gerund).toBe('string');
  expect(typeof forms.past_participle).toBe('string');
  // Array tenses have 6 forms
  for (const t of ['present','preterite','imperfect','future','conditional','subjunctive']) {
    expect(Array.isArray(forms[t]), `${t} should be array`).toBe(true);
    expect(forms[t]).toHaveLength(6);
  }
  expect(Array.isArray(forms.imperative)).toBe(true);
}

// ── Regular classes ──────────────────────────────────────────────────────────

describe('regular-ar (hablar)', () => {
  const f = conjugate('hablar', 'regular-ar');

  it('has the correct shape', () => assertShape(f));

  it('present tense', () => {
    expect(f.present).toEqual(['hablo','hablas','habla','hablamos','habláis','hablan']);
  });

  it('preterite tense', () => {
    expect(f.preterite).toEqual(['hablé','hablaste','habló','hablamos','hablasteis','hablaron']);
  });

  it('imperfect tense', () => {
    expect(f.imperfect).toEqual(['hablaba','hablabas','hablaba','hablábamos','hablabais','hablaban']);
  });

  it('future tense', () => {
    expect(f.future).toEqual(['hablaré','hablarás','hablará','hablaremos','hablaréis','hablarán']);
  });

  it('subjunctive', () => {
    expect(f.subjunctive).toEqual(['hable','hables','hable','hablemos','habléis','hablen']);
  });

  it('gerund and past participle', () => {
    expect(f.gerund).toBe('hablando');
    expect(f.past_participle).toBe('hablado');
  });
});

describe('regular-er (comer)', () => {
  const f = conjugate('comer', 'regular-er');

  it('has the correct shape', () => assertShape(f));

  it('present tense', () => {
    expect(f.present).toEqual(['como','comes','come','comemos','coméis','comen']);
  });

  it('preterite tense', () => {
    expect(f.preterite).toEqual(['comí','comiste','comió','comimos','comisteis','comieron']);
  });

  it('gerund and past participle', () => {
    expect(f.gerund).toBe('comiendo');
    expect(f.past_participle).toBe('comido');
  });
});

describe('regular-ir (vivir)', () => {
  const f = conjugate('vivir', 'regular-ir');

  it('has the correct shape', () => assertShape(f));

  it('present tense (ir endings differ at nosotros/vosotros)', () => {
    expect(f.present[3]).toBe('vivimos');
    expect(f.present[4]).toBe('vivís');
  });

  it('gerund and past participle', () => {
    expect(f.gerund).toBe('viviendo');
    expect(f.past_participle).toBe('vivido');
  });
});

// ── Orthographic classes ─────────────────────────────────────────────────────

describe('ortho-car (tocar)', () => {
  const f = conjugate('tocar', 'ortho-car');

  it('has the correct shape', () => assertShape(f));

  it('preterite yo uses qu-', () => {
    expect(f.preterite[0]).toBe('toqué');
  });

  it('subjunctive uses qu- stem', () => {
    expect(f.subjunctive[0]).toBe('toque');
    expect(f.subjunctive[3]).toBe('toquemos');
  });

  it('rest of preterite is regular-ar', () => {
    expect(f.preterite[1]).toBe('tocaste');
    expect(f.preterite[5]).toBe('tocaron');
  });
});

describe('ortho-gar (pagar)', () => {
  const f = conjugate('pagar', 'ortho-gar');

  it('preterite yo uses gu-', () => {
    expect(f.preterite[0]).toBe('pagué');
  });

  it('subjunctive uses gu- stem', () => {
    expect(f.subjunctive[0]).toBe('pague');
  });
});

describe('ortho-zar (empezar) — note: also stem-e-ie', () => {
  // empezar is both ortho-zar and has e→ie, but for this class test
  // use a plain -zar verb: rezar
  const f = conjugate('rezar', 'ortho-zar');

  it('preterite yo uses c instead of z', () => {
    expect(f.preterite[0]).toBe('recé');
  });

  it('subjunctive uses c stem', () => {
    expect(f.subjunctive[0]).toBe('rece');
    expect(f.subjunctive[3]).toBe('recemos');
  });
});

describe('ortho-cer (conocer)', () => {
  const f = conjugate('conocer', 'ortho-cer');

  it('present yo adds -zc-', () => {
    expect(f.present[0]).toBe('conozco');
  });

  it('subjunctive built on -zc- stem', () => {
    expect(f.subjunctive[0]).toBe('conozca');
    expect(f.subjunctive[3]).toBe('conozcamos');
  });

  it('other present forms are regular', () => {
    expect(f.present[1]).toBe('conoces');
    expect(f.present[5]).toBe('conocen');
  });
});

describe('ortho-cir (producir via ortho-cer rule)', () => {
  // ortho-cir is mapped to the same function as ortho-cer
  const f = conjugate('conducir', 'ortho-cir');

  it('present yo adds -zc-', () => {
    expect(f.present[0]).toBe('conduzco');
  });
});

describe('ortho-ger (proteger)', () => {
  const f = conjugate('proteger', 'ortho-ger');

  it('present yo changes g→j', () => {
    expect(f.present[0]).toBe('protejo');
  });

  it('subjunctive uses j stem', () => {
    expect(f.subjunctive[0]).toBe('proteja');
  });

  it('other present forms retain g', () => {
    expect(f.present[1]).toBe('proteges');
  });
});

describe('ortho-uir (construir)', () => {
  const f = conjugate('construir', 'ortho-uir');

  it('present inserts y for yo/tú/él/ellos', () => {
    expect(f.present[0]).toBe('construyo');
    expect(f.present[1]).toBe('construyes');
    expect(f.present[2]).toBe('construye');
    expect(f.present[5]).toBe('construyen');
  });

  it('nosotros/vosotros stay plain', () => {
    expect(f.present[3]).toBe('construimos');
    expect(f.present[4]).toBe('construís');
  });

  it('preterite él/ellos use -yó/-yeron', () => {
    expect(f.preterite[2]).toBe('construyó');
    expect(f.preterite[5]).toBe('construyeron');
  });

  it('gerund uses -yendo', () => {
    expect(f.gerund).toBe('construyendo');
  });
});

describe('ortho-iar (enviar)', () => {
  const f = conjugate('enviar', 'ortho-iar');

  it('present inserts accent on í for yo/tú/él/ellos', () => {
    expect(f.present[0]).toBe('envío');
    expect(f.present[1]).toBe('envías');
    expect(f.present[2]).toBe('envía');
    expect(f.present[5]).toBe('envían');
  });

  it('nosotros/vosotros stay plain', () => {
    expect(f.present[3]).toBe('enviamos');
    expect(f.present[4]).toBe('enviáis');
  });
});

describe('ortho-ducir (traducir)', () => {
  const f = conjugate('traducir', 'ortho-ducir');

  it('present yo uses -zc-', () => {
    expect(f.present[0]).toBe('traduzco');
  });

  it('preterite uses -j- stem throughout', () => {
    expect(f.preterite[0]).toBe('traduje');
    expect(f.preterite[1]).toBe('tradujiste');
    expect(f.preterite[2]).toBe('tradujo');
    expect(f.preterite[5]).toBe('tradujeron');
  });
});

describe('ortho-eer (leer)', () => {
  const f = conjugate('leer', 'ortho-eer');

  it('preterite él/ellos use -yó/-yeron', () => {
    expect(f.preterite[2]).toBe('leyó');
    expect(f.preterite[5]).toBe('leyeron');
  });

  it('preterite yo/tú use accented í', () => {
    expect(f.preterite[0]).toBe('leí');
    expect(f.preterite[1]).toBe('leíste');
  });

  it('gerund uses -yendo', () => {
    expect(f.gerund).toBe('leyendo');
  });

  it('past participle has accent', () => {
    expect(f.past_participle).toBe('leído');
  });
});

describe('ortho-ncer (vencer)', () => {
  const f = conjugate('vencer', 'ortho-ncer');

  it('present yo changes nc→nz', () => {
    expect(f.present[0]).toBe('venzo');
  });

  it('subjunctive uses nz stem', () => {
    expect(f.subjunctive[0]).toBe('venza');
    expect(f.subjunctive[3]).toBe('venzamos');
  });
});

// ── Stem-change classes ──────────────────────────────────────────────────────

describe('stem-e-ie (querer)', () => {
  const f = conjugate('querer', 'stem-e-ie');

  it('present yo/tú/él/ellos have e→ie', () => {
    expect(f.present[0]).toBe('quiero');
    expect(f.present[1]).toBe('quieres');
    expect(f.present[2]).toBe('quiere');
    expect(f.present[5]).toBe('quieren');
  });

  it('nosotros/vosotros stay plain', () => {
    expect(f.present[3]).toBe('queremos');
    expect(f.present[4]).toBe('queréis');
  });

  it('subjunctive follows the same dipthong pattern', () => {
    expect(f.subjunctive[0]).toBe('quiera');
    expect(f.subjunctive[3]).toBe('queramos');
  });
});

describe('stem-o-ue (poder)', () => {
  const f = conjugate('poder', 'stem-o-ue');

  it('present yo/tú/él/ellos have o→ue', () => {
    expect(f.present[0]).toBe('puedo');
    expect(f.present[1]).toBe('puedes');
    expect(f.present[2]).toBe('puede');
    expect(f.present[5]).toBe('pueden');
  });

  it('nosotros/vosotros stay plain', () => {
    expect(f.present[3]).toBe('podemos');
    expect(f.present[4]).toBe('podéis');
  });
});

describe('stem-e-i (pedir)', () => {
  const f = conjugate('pedir', 'stem-e-i');

  it('present yo/tú/él/ellos have e→i', () => {
    expect(f.present[0]).toBe('pido');
    expect(f.present[1]).toBe('pides');
    expect(f.present[2]).toBe('pide');
    expect(f.present[5]).toBe('piden');
  });

  it('preterite él/ellos have e→i', () => {
    expect(f.preterite[2]).toBe('pidió');
    expect(f.preterite[5]).toBe('pidieron');
  });

  it('gerund has e→i', () => {
    expect(f.gerund).toBe('pidiendo');
  });
});

describe('stem-e-ie-ir (sentir)', () => {
  const f = conjugate('sentir', 'stem-e-ie-ir');

  it('present yo/tú/él/ellos have e→ie', () => {
    expect(f.present[0]).toBe('siento');
    expect(f.present[1]).toBe('sientes');
    expect(f.present[2]).toBe('siente');
    expect(f.present[5]).toBe('sienten');
  });

  it('preterite él/ellos have e→i', () => {
    expect(f.preterite[2]).toBe('sintió');
    expect(f.preterite[5]).toBe('sintieron');
  });

  it('gerund has e→i', () => {
    expect(f.gerund).toBe('sintiendo');
  });
});

describe('stem-o-ue-ir (dormir)', () => {
  const f = conjugate('dormir', 'stem-o-ue-ir');

  it('present yo/tú/él/ellos have o→ue', () => {
    expect(f.present[0]).toBe('duermo');
    expect(f.present[1]).toBe('duermes');
    expect(f.present[2]).toBe('duerme');
    expect(f.present[5]).toBe('duermen');
  });

  it('preterite él/ellos have o→u', () => {
    expect(f.preterite[2]).toBe('durmió');
    expect(f.preterite[5]).toBe('durmieron');
  });

  it('gerund has o→u', () => {
    expect(f.gerund).toBe('durmiendo');
  });
});

describe('stem-e-ie-zar (empezar)', () => {
  const f = conjugate('empezar', 'stem-e-ie-zar');

  it('present yo/tú/él/ellos have e→ie', () => {
    expect(f.present[0]).toBe('empiezo');
    expect(f.present[1]).toBe('empiezas');
    expect(f.present[2]).toBe('empieza');
    expect(f.present[5]).toBe('empiezan');
  });

  it('preterite yo uses -c- (ortho-zar rule)', () => {
    expect(f.preterite[0]).toBe('empecé');
  });

  it('subjunctive uses ie+c combination', () => {
    expect(f.subjunctive[0]).toBe('empiece');
    expect(f.subjunctive[3]).toBe('empecemos');
  });
});

describe('stem-e-i-gir (elegir)', () => {
  const f = conjugate('elegir', 'stem-e-i-gir');

  it('present yo has e→i AND g→j', () => {
    expect(f.present[0]).toBe('elijo');
  });

  it('present tú/él/ellos have e→i only', () => {
    expect(f.present[1]).toBe('eliges');
    expect(f.present[2]).toBe('elige');
    expect(f.present[5]).toBe('eligen');
  });

  it('preterite él/ellos have e→i', () => {
    expect(f.preterite[2]).toBe('eligió');
    expect(f.preterite[5]).toBe('eligieron');
  });

  it('subjunctive uses j stem', () => {
    expect(f.subjunctive[0]).toBe('elija');
    expect(f.subjunctive[3]).toBe('elijamos');
  });
});

// ── Irregular passthrough ────────────────────────────────────────────────────

describe('irregular- classes (fully irregular passthrough)', () => {
  it('returns supplied overrides directly', () => {
    const overrides = {
      present:     ['soy','eres','es','somos','sois','son'],
      preterite:   ['fui','fuiste','fue','fuimos','fuisteis','fueron'],
      imperfect:   ['era','eras','era','éramos','erais','eran'],
      future:      ['seré','serás','será','seremos','seréis','serán'],
      conditional: ['sería','serías','sería','seríamos','seríais','serían'],
      subjunctive: ['sea','seas','sea','seamos','seáis','sean'],
      imperative:  ['sean'],
      gerund:      'siendo',
      past_participle: 'sido',
    };
    const f = conjugate('ser', 'irregular-ser', overrides);
    expect(f).toEqual(overrides);
  });

  it('returns empty object when no overrides supplied', () => {
    const f = conjugate('ir', 'irregular-ir');
    expect(f).toEqual({});
  });
});

// ── futureStem override ──────────────────────────────────────────────────────

describe('futureStem parameter', () => {
  it('replaces future and conditional with supplied stem (tener → tendr-)', () => {
    const f = conjugate('tener', 'regular-er', {}, 'tendr');
    expect(f.future).toEqual(['tendré','tendrás','tendrá','tendremos','tendréis','tendrán']);
    expect(f.conditional).toEqual(['tendría','tendrías','tendría','tendríamos','tendríais','tendrían']);
  });

  it('does not overwrite future/conditional if already set in overrides', () => {
    const overrides = { future: ['X','X','X','X','X','X'] };
    const f = conjugate('hablar', 'regular-ar', overrides, 'habldr');
    expect(f.future).toEqual(['X','X','X','X','X','X']);
  });
});

// ── Tense-level overrides ────────────────────────────────────────────────────

describe('per-tense overrides', () => {
  it('overrides replace generated tense entirely', () => {
    const customPresent = ['voy','vas','va','vamos','vais','van'];
    const f = conjugate('ir', 'regular-ar', { present: customPresent });
    expect(f.present).toEqual(customPresent);
  });
});

// ── Error paths ──────────────────────────────────────────────────────────────

describe('unknown conjugation_class', () => {
  it('throws for an unrecognised class', () => {
    expect(() => conjugate('hablar', 'nonexistent-class')).toThrow(/Unknown conjugation_class/);
  });
});

// ── SUPPORTED_CLASSES export ─────────────────────────────────────────────────

describe('SUPPORTED_CLASSES', () => {
  it('lists all registered class names', () => {
    expect(Array.isArray(SUPPORTED_CLASSES)).toBe(true);
    expect(SUPPORTED_CLASSES.length).toBeGreaterThan(0);
    // Spot-check a few expected entries
    expect(SUPPORTED_CLASSES).toContain('regular-ar');
    expect(SUPPORTED_CLASSES).toContain('ortho-car');
    expect(SUPPORTED_CLASSES).toContain('stem-e-ie');
  });
});
