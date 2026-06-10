/**
 * verb-rules.ts
 *
 * Spanish verb conjugation rules engine.
 *
 * Given an infinitive + conjugation_class (+ optional overrides / future_stem),
 * generates all conjugated forms without storing hardcoded tables per verb.
 *
 * Usage:
 *   import { conjugate } from './verb-rules.js';
 *   const forms = conjugate('hablar', 'regular-ar');
 *   const forms = conjugate('tener', 'irregular-tener', { present: [...], ... });
 *
 * Returns an object with keys:
 *   present, preterite, imperfect, future, conditional,
 *   subjunctive, imperative, gerund, past_participle
 */

export interface VerbForms {
  present:         string[];
  preterite:       string[];
  imperfect:       string[];
  future:          string[];
  conditional:     string[];
  subjunctive:     string[];
  imperative:      string[];
  gerund:          string;
  past_participle: string;
}

export type VerbOverrides = Partial<VerbForms>;

// ── Ending tables ──────────────────────────────────────────────────────────────

type Ending = 'ar' | 'er' | 'ir';

const PRES: Record<Ending, string[]> = {
  ar: ['o','as','a','amos','áis','an'],
  er: ['o','es','e','emos','éis','en'],
  ir: ['o','es','e','imos','ís','en'],
};
const PRET: Record<Ending, string[]> = {
  ar: ['é','aste','ó','amos','asteis','aron'],
  er: ['í','iste','ió','imos','isteis','ieron'],
  ir: ['í','iste','ió','imos','isteis','ieron'],
};
const IMPF: Record<Ending, string[]> = {
  ar: ['aba','abas','aba','ábamos','abais','aban'],
  er: ['ía','ías','ía','íamos','íais','ían'],
  ir: ['ía','ías','ía','íamos','íais','ían'],
};
const FUT  = ['é','ás','á','emos','éis','án'];
const COND = ['ía','ías','ía','íamos','íais','ían'];
const SUBJ: Record<Ending, string[]> = {
  ar: ['e','es','e','emos','éis','en'],
  er: ['a','as','a','amos','áis','an'],
  ir: ['a','as','a','amos','áis','an'],
};

const apply = (stem: string, suffixes: string[]): string[] => suffixes.map(s => stem + s);

/** Derive imperative (ustedes) from subjunctive[5], unless already set. */
function finalise(forms: VerbForms): VerbForms {
  const subj = forms.subjunctive;
  if (subj && subj.length > 5 && !forms.imperative?.length) {
    forms.imperative = [subj[5]];
  }
  return forms;
}

// ── Base regular conjugation ───────────────────────────────────────────────────

function regular(inf: string, ending: Ending, stem: string): VerbForms {
  const subj = apply(stem, SUBJ[ending]);
  return {
    present:         apply(stem, PRES[ending]),
    preterite:       apply(stem, PRET[ending]),
    imperfect:       apply(stem, IMPF[ending]),
    future:          apply(inf,  FUT),
    conditional:     apply(inf,  COND),
    subjunctive:     subj,
    imperative:      [subj[5]],
    gerund:          stem + (ending === 'ar' ? 'ando' : 'iendo'),
    past_participle: stem + (ending === 'ar' ? 'ado'  : 'ido'),
  };
}

// ── Class rule functions ───────────────────────────────────────────────────────

type RuleFn = (inf: string, overrides: VerbOverrides) => VerbForms;

function regularAr(inf: string, overrides: VerbOverrides): VerbForms {
  const f = regular(inf, 'ar', inf.slice(0,-2));
  Object.assign(f, overrides);
  return finalise(f);
}

function regularEr(inf: string, overrides: VerbOverrides): VerbForms {
  const f = regular(inf, 'er', inf.slice(0,-2));
  Object.assign(f, overrides);
  return finalise(f);
}

function regularIr(inf: string, overrides: VerbOverrides): VerbForms {
  const f = regular(inf, 'ir', inf.slice(0,-2));
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoCar(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ar', stem);
  const qu   = stem.slice(0,-1) + 'qu';
  f.preterite[0] = qu + 'é';
  f.subjunctive  = apply(qu, SUBJ.ar);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoGar(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ar', stem);
  const gu   = stem + 'u';
  f.preterite[0] = gu + 'é';
  f.subjunctive  = apply(gu, SUBJ.ar);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoZar(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ar', stem);
  const c    = stem.slice(0,-1) + 'c';
  f.preterite[0] = c + 'é';
  f.subjunctive  = apply(c, SUBJ.ar);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoCer(inf: string, overrides: VerbOverrides): VerbForms {
  const stem   = inf.slice(0,-2);
  const ending = inf.endsWith('er') ? 'er' : 'ir';
  const f      = regular(inf, ending, stem);
  const zc     = stem.slice(0,-1) + 'zc';
  f.present[0]   = zc + 'o';
  f.subjunctive  = apply(zc, SUBJ[ending]);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoGer(inf: string, overrides: VerbOverrides): VerbForms {
  const stem   = inf.slice(0,-2);
  const ending = inf.endsWith('er') ? 'er' : 'ir';
  const f      = regular(inf, ending, stem);
  const j      = stem.slice(0,-1) + 'j';
  f.present[0]  = j + 'o';
  f.subjunctive = apply(j, SUBJ[ending]);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoUir(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const y    = stem + 'y';
  for (const i of [0,1,2,5]) f.present[i] = y + PRES.ir[i];
  f.subjunctive  = apply(y, SUBJ.ir);
  f.preterite[2] = stem + 'yó';
  f.preterite[5] = stem + 'yeron';
  f.gerund       = stem + 'yendo';
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoIar(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ar', stem);
  const iAcc = stem.slice(0,-1) + 'í';
  for (const i of [0,1,2,5]) f.present[i] = iAcc + PRES.ar[i];
  f.subjunctive = SUBJ.ar.map((s, i) => ([0,1,2,5].includes(i) ? iAcc : stem) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoDucir(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const zc   = stem.slice(0,-1) + 'zc';
  const uj   = stem.slice(0,-1) + 'j';
  f.present[0]  = zc + 'o';
  f.subjunctive = apply(zc, SUBJ.ir);
  f.preterite   = [uj+'e', uj+'iste', uj+'o', uj+'imos', uj+'isteis', uj+'eron'];
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoEer(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'er', stem);
  f.preterite = [
    stem+'í', stem+'íste', stem+'yó',
    stem+'ímos', stem+'ísteis', stem+'yeron',
  ];
  f.gerund          = stem + 'yendo';
  f.past_participle = stem + 'ído';
  Object.assign(f, overrides);
  return finalise(f);
}

function orthoNcer(inf: string, overrides: VerbOverrides): VerbForms {
  const stem   = inf.slice(0,-2);
  const ending = inf.endsWith('er') ? 'er' : 'ir';
  const f      = regular(inf, ending, stem);
  const nz     = stem.slice(0,-1) + 'z';
  f.present[0]  = nz + 'o';
  f.subjunctive = apply(nz, SUBJ[ending]);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemEIe(inf: string, overrides: VerbOverrides): VerbForms {
  const stem   = inf.slice(0,-2);
  const ending = inf.endsWith('er') ? 'er' : 'ar';
  const f      = regular(inf, ending, stem);
  const idx    = stem.lastIndexOf('e');
  const ie     = idx >= 0 ? stem.slice(0,idx) + 'ie' + stem.slice(idx+1) : stem;
  for (const i of [0,1,2,5]) f.present[i] = ie + PRES[ending][i];
  f.subjunctive = SUBJ[ending].map((s,i) => ([0,1,2,5].includes(i) ? ie : stem) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemOUe(inf: string, overrides: VerbOverrides): VerbForms {
  const stem   = inf.slice(0,-2);
  const ending = inf.endsWith('er') ? 'er' : 'ar';
  const f      = regular(inf, ending, stem);
  const idx    = stem.lastIndexOf('o');
  const ue     = idx >= 0 ? stem.slice(0,idx) + 'ue' + stem.slice(idx+1) : stem;
  for (const i of [0,1,2,5]) f.present[i] = ue + PRES[ending][i];
  f.subjunctive = SUBJ[ending].map((s,i) => ([0,1,2,5].includes(i) ? ue : stem) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemEI(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const idx  = stem.lastIndexOf('e');
  const iS   = idx >= 0 ? stem.slice(0,idx) + 'i' + stem.slice(idx+1) : stem;
  for (const j of [0,1,2,5]) f.present[j] = iS + PRES.ir[j];
  f.preterite[2] = iS + 'ió';
  f.preterite[5] = iS + 'ieron';
  f.gerund       = iS + 'iendo';
  f.subjunctive  = apply(iS, SUBJ.ir);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemEIeIr(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const idx  = stem.lastIndexOf('e');
  const ie   = idx >= 0 ? stem.slice(0,idx) + 'ie' + stem.slice(idx+1) : stem;
  const iS   = idx >= 0 ? stem.slice(0,idx) + 'i'  + stem.slice(idx+1) : stem;
  for (const j of [0,1,2,5]) f.present[j] = ie + PRES.ir[j];
  f.preterite[2] = iS + 'ió';
  f.preterite[5] = iS + 'ieron';
  f.gerund       = iS + 'iendo';
  f.subjunctive  = SUBJ.ir.map((s,j) => ([0,1,2,5].includes(j) ? ie : iS) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemOUeIr(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const idx  = stem.lastIndexOf('o');
  const ue   = idx >= 0 ? stem.slice(0,idx) + 'ue' + stem.slice(idx+1) : stem;
  const u    = idx >= 0 ? stem.slice(0,idx) + 'u'  + stem.slice(idx+1) : stem;
  for (const j of [0,1,2,5]) f.present[j] = ue + PRES.ir[j];
  f.preterite[2] = u + 'ió';
  f.preterite[5] = u + 'ieron';
  f.gerund       = u + 'iendo';
  f.subjunctive  = SUBJ.ir.map((s,j) => ([0,1,2,5].includes(j) ? ue : u) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemEIeZar(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ar', stem);
  const idx  = stem.lastIndexOf('e');
  const ie   = idx >= 0 ? stem.slice(0,idx) + 'ie' + stem.slice(idx+1) : stem;
  const c    = stem.slice(0,-1) + 'c';
  for (const i of [0,1,2,5]) f.present[i] = ie + PRES.ar[i];
  f.preterite[0] = c + 'é';
  const ieC = ie.slice(0,-1) + 'c';
  f.subjunctive  = SUBJ.ar.map((s,i) => ([0,1,2,5].includes(i) ? ieC : c) + s);
  Object.assign(f, overrides);
  return finalise(f);
}

function stemEIGir(inf: string, overrides: VerbOverrides): VerbForms {
  const stem = inf.slice(0,-2);
  const f    = regular(inf, 'ir', stem);
  const idx  = stem.lastIndexOf('e');
  const iS   = idx >= 0 ? stem.slice(0,idx) + 'i' + stem.slice(idx+1) : stem;
  const jS   = iS.slice(0,-1) + 'j';
  f.present[0] = jS + 'o';
  for (const i of [1,2,5]) f.present[i] = iS + PRES.ir[i];
  f.preterite[2] = iS + 'ió';
  f.preterite[5] = iS + 'ieron';
  f.gerund       = iS + 'iendo';
  f.subjunctive  = apply(jS, SUBJ.ir);
  Object.assign(f, overrides);
  return finalise(f);
}

// ── Class registry ─────────────────────────────────────────────────────────────

const CLASS_RULES: Record<string, RuleFn> = {
  'regular-ar':    regularAr,
  'regular-er':    regularEr,
  'regular-ir':    regularIr,
  'ortho-car':     orthoCar,
  'ortho-gar':     orthoGar,
  'ortho-zar':     orthoZar,
  'ortho-cer':     orthoCer,
  'ortho-cir':     orthoCer,
  'ortho-ger':     orthoGer,
  'ortho-gir':     orthoGer,
  'ortho-uir':     orthoUir,
  'ortho-iar':     orthoIar,
  'ortho-ducir':   orthoDucir,
  'ortho-eer':     orthoEer,
  'ortho-ncer':    orthoNcer,
  'stem-e-ie':     stemEIe,
  'stem-o-ue':     stemOUe,
  'stem-e-i':      stemEI,
  'stem-e-ie-ir':  stemEIeIr,
  'stem-o-ue-ir':  stemOUeIr,
  'stem-e-ie-zar': stemEIeZar,
  'stem-e-i-gir':  stemEIGir,
};

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Generate all conjugated forms for a verb.
 *
 * @param inf               - infinitive (e.g. 'hablar')
 * @param conjugationClass  - class name (e.g. 'regular-ar', 'irregular-tener')
 * @param overrides         - tense→forms overrides (partial or full for irregular-*)
 * @param futureStem        - alternate stem for future/conditional
 */
export function conjugate(
  inf: string,
  conjugationClass: string,
  overrides: VerbOverrides = {},
  futureStem: string | null = null,
): VerbForms {
  // Apply future/conditional stem before calling the rule
  if (futureStem) {
    overrides = { ...overrides };
    if (!overrides.future)      overrides.future      = apply(futureStem, FUT);
    if (!overrides.conditional) overrides.conditional = apply(futureStem, COND);
  }

  const rule = CLASS_RULES[conjugationClass];
  if (rule) return rule(inf, overrides);

  // Fully irregular: caller supplies complete forms via overrides
  if (conjugationClass?.startsWith('irregular-')) return overrides as VerbForms;

  throw new Error(`Unknown conjugation_class: '${conjugationClass}'`);
}

export const SUPPORTED_CLASSES = Object.keys(CLASS_RULES);
