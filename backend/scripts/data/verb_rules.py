"""
Spanish Verb Conjugation Rules Engine
======================================
Given infinitive + conjugation_class + optional overrides/future_stem,
generates all conjugated forms.

Usage:
    from verb_rules import conjugate
    forms = conjugate("hablar", "regular-ar")
    forms = conjugate("tener", "irregular-tener", overrides={...})
"""

# ── Ending tables ──────────────────────────────────────────────────────────────

_PRES = {
    "ar": ["o","as","a","amos","áis","an"],
    "er": ["o","es","e","emos","éis","en"],
    "ir": ["o","es","e","imos","ís","en"],
}
_PRET = {
    "ar": ["é","aste","ó","amos","asteis","aron"],
    "er": ["í","iste","ió","imos","isteis","ieron"],
    "ir": ["í","iste","ió","imos","isteis","ieron"],
}
_IMPF = {
    "ar": ["aba","abas","aba","ábamos","abais","aban"],
    "er": ["ía","ías","ía","íamos","íais","ían"],
    "ir": ["ía","ías","ía","íamos","íais","ían"],
}
_FUT  = ["é","ás","á","emos","éis","án"]
_COND = ["ía","ías","ía","íamos","íais","ían"]
_SUBJ = {
    "ar": ["e","es","e","emos","éis","en"],
    "er": ["a","as","a","amos","áis","an"],
    "ir": ["a","as","a","amos","áis","an"],
}

def _apply(stem, suffixes):
    return [stem + s for s in suffixes]

def _stem_end(inf):
    for e in ("ar","er","ir"):
        if inf.endswith(e): return inf[:-2], e
    return inf[:-2], inf[-2:]

def _finalise(forms):
    """Derive imperative from subjunctive[5] unless already set."""
    subj = forms.get("subjunctive", [])
    if subj and len(subj) > 5:
        forms["imperative"] = [subj[5]]
    return forms

# ── Base regular conjugation ───────────────────────────────────────────────────

def _regular(inf, ending, stem):
    subj = _apply(stem, _SUBJ[ending])
    forms = {
        "present":         _apply(stem, _PRES[ending]),
        "preterite":       _apply(stem, _PRET[ending]),
        "imperfect":       _apply(stem, _IMPF[ending]),
        "future":          _apply(inf,  _FUT),
        "conditional":     _apply(inf,  _COND),
        "subjunctive":     subj,
        "imperative":      [subj[5]],
        "gerund":          stem + ("ando" if ending == "ar" else "iendo"),
        "past_participle": stem + ("ado"  if ending == "ar" else "ido"),
    }
    return forms

# ── Class rule functions ───────────────────────────────────────────────────────

CLASS_RULES = {}

def _reg_ar(inf, overrides=None):
    f = _regular(inf, "ar", inf[:-2])
    if overrides: f.update(overrides)
    return _finalise(f)

def _reg_er(inf, overrides=None):
    f = _regular(inf, "er", inf[:-2])
    if overrides: f.update(overrides)
    return _finalise(f)

def _reg_ir(inf, overrides=None):
    f = _regular(inf, "ir", inf[:-2])
    if overrides: f.update(overrides)
    return _finalise(f)

CLASS_RULES.update({"regular-ar": _reg_ar, "regular-er": _reg_er, "regular-ir": _reg_ir})

def _ortho_car(inf, overrides=None):
    stem = inf[:-2]
    f = _regular(inf, "ar", stem)
    qu = stem[:-1] + "qu"
    f["preterite"][0] = qu + "é"
    f["subjunctive"] = _apply(qu, _SUBJ["ar"])
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_gar(inf, overrides=None):
    stem = inf[:-2]
    f = _regular(inf, "ar", stem)
    gu = stem + "u"
    f["preterite"][0] = gu + "é"
    f["subjunctive"] = _apply(gu, _SUBJ["ar"])
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_zar(inf, overrides=None):
    stem = inf[:-2]
    f = _regular(inf, "ar", stem)
    c = stem[:-1] + "c"
    f["preterite"][0] = c + "é"
    f["subjunctive"] = _apply(c, _SUBJ["ar"])
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_cer(inf, overrides=None):
    """Verbs in -cer/-cir with yo: c→zc (conocer→conozco)."""
    stem = inf[:-2]
    ending = "er" if inf.endswith("er") else "ir"
    f = _regular(inf, ending, stem)
    zc = stem[:-1] + "zc"
    f["present"][0] = zc + "o"
    f["subjunctive"] = _apply(zc, _SUBJ[ending])
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_ger(inf, overrides=None):
    """Verbs in -ger/-gir: yo g→j (coger→cojo)."""
    stem = inf[:-2]
    ending = "er" if inf.endswith("er") else "ir"
    f = _regular(inf, ending, stem)
    j = stem[:-1] + "j"
    f["present"][0] = j + "o"
    f["subjunctive"] = _apply(j, _SUBJ[ending])
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_uir(inf, overrides=None):
    """Verbs in -uir: insert y before vowel (huir→huyo)."""
    stem = inf[:-2]
    f = _regular(inf, "ir", stem)
    y = stem + "y"
    for i in (0,1,2,5): f["present"][i] = y + _PRES["ir"][i]
    f["subjunctive"] = _apply(y, _SUBJ["ir"])
    f["preterite"][2] = stem + "yó"
    f["preterite"][5] = stem + "yeron"
    f["gerund"] = stem + "yendo"
    if overrides: f.update(overrides)
    return _finalise(f)

CLASS_RULES.update({
    "ortho-car": _ortho_car, "ortho-gar": _ortho_gar, "ortho-zar": _ortho_zar,
    "ortho-cer": _ortho_cer, "ortho-cir": _ortho_cer,
    "ortho-ger": _ortho_ger, "ortho-gir": _ortho_ger,
    "ortho-uir": _ortho_uir,
})

def _stem_e_ie(inf, overrides=None):
    """e→ie in present 1,2,3,6 (-ar or -er)."""
    stem = inf[:-2]
    ending = "er" if inf.endswith("er") else "ar"
    f = _regular(inf, ending, stem)
    idx = stem.rfind("e")
    ie = stem[:idx] + "ie" + stem[idx+1:] if idx >= 0 else stem
    for i in (0,1,2,5): f["present"][i] = ie + _PRES[ending][i]
    f["subjunctive"] = [ie + _SUBJ[ending][i] if i in (0,1,2,5) else stem + _SUBJ[ending][i] for i in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_o_ue(inf, overrides=None):
    """o→ue in present 1,2,3,6 (-ar or -er)."""
    stem = inf[:-2]
    ending = "er" if inf.endswith("er") else "ar"
    f = _regular(inf, ending, stem)
    idx = stem.rfind("o")
    ue = stem[:idx] + "ue" + stem[idx+1:] if idx >= 0 else stem
    for i in (0,1,2,5): f["present"][i] = ue + _PRES[ending][i]
    f["subjunctive"] = [ue + _SUBJ[ending][i] if i in (0,1,2,5) else stem + _SUBJ[ending][i] for i in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_e_i(inf, overrides=None):
    """e→i in all stressed forms + preterite 3rd + gerund (-ir only)."""
    stem = inf[:-2]
    f = _regular(inf, "ir", stem)
    idx = stem.rfind("e")
    i_s = stem[:idx] + "i" + stem[idx+1:] if idx >= 0 else stem
    for j in (0,1,2,5): f["present"][j] = i_s + _PRES["ir"][j]
    f["preterite"][2] = i_s + "ió"
    f["preterite"][5] = i_s + "ieron"
    f["gerund"] = i_s + "iendo"
    f["subjunctive"] = _apply(i_s, _SUBJ["ir"])
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_e_ie_ir(inf, overrides=None):
    """e→ie present + e→i preterite 3rd/gerund (sentir, advertir, convertir)."""
    stem = inf[:-2]
    f = _regular(inf, "ir", stem)
    idx = stem.rfind("e")
    ie = stem[:idx] + "ie" + stem[idx+1:] if idx >= 0 else stem
    i_s = stem[:idx] + "i"  + stem[idx+1:] if idx >= 0 else stem
    for j in (0,1,2,5): f["present"][j] = ie + _PRES["ir"][j]
    f["preterite"][2] = i_s + "ió"
    f["preterite"][5] = i_s + "ieron"
    f["gerund"] = i_s + "iendo"
    f["subjunctive"] = [ie + _SUBJ["ir"][j] if j in (0,1,2,5) else i_s + _SUBJ["ir"][j] for j in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_o_ue_ir(inf, overrides=None):
    """o→ue present + o→u preterite 3rd/gerund (dormir, morir)."""
    stem = inf[:-2]
    f = _regular(inf, "ir", stem)
    idx = stem.rfind("o")
    ue = stem[:idx] + "ue" + stem[idx+1:] if idx >= 0 else stem
    u  = stem[:idx] + "u"  + stem[idx+1:] if idx >= 0 else stem
    for j in (0,1,2,5): f["present"][j] = ue + _PRES["ir"][j]
    f["preterite"][2] = u + "ió"
    f["preterite"][5] = u + "ieron"
    f["gerund"] = u + "iendo"
    f["subjunctive"] = [ue + _SUBJ["ir"][j] if j in (0,1,2,5) else u + _SUBJ["ir"][j] for j in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

CLASS_RULES.update({
    "stem-e-ie": _stem_e_ie, "stem-o-ue": _stem_o_ue,
    "stem-e-i": _stem_e_i, "stem-e-ie-ir": _stem_e_ie_ir, "stem-o-ue-ir": _stem_o_ue_ir,
})

# ── Main entry point ───────────────────────────────────────────────────────────

def conjugate(inf, conjugation_class, overrides=None, future_stem=None):
    """
    Generate all conjugated forms.
    
    Args:
        inf:               infinitive (e.g. "hablar")
        conjugation_class: class name (e.g. "regular-ar", "stem-e-ie", "irregular-ser")
        overrides:         dict of tense→forms that override the rule output
        future_stem:       if provided, future/conditional use this stem instead of infinitive
    
    Returns:
        dict with keys: present, preterite, imperfect, future, conditional,
                        subjunctive, imperative, gerund, past_participle
    """
    overrides = overrides or {}

    if future_stem:
        overrides.setdefault("future",      _apply(future_stem, _FUT))
        overrides.setdefault("conditional", _apply(future_stem, _COND))

    rule = CLASS_RULES.get(conjugation_class)
    if rule:
        return rule(inf, overrides)

    if conjugation_class.startswith("irregular-"):
        # Fully irregular: caller supplies complete forms via overrides
        return overrides

    raise ValueError(f"Unknown conjugation_class: '{conjugation_class}'")


if __name__ == "__main__":
    tests = [
        ("hablar","regular-ar",None,None),
        ("beber","regular-er",None,None),
        ("buscar","ortho-car",None,None),
        ("llegar","ortho-gar",None,None),
        ("rezar","ortho-zar",None,None),
        ("conocer","ortho-cer",None,None),
        ("coger","ortho-ger",None,None),
        ("construir","ortho-uir",None,None),
        ("entender","stem-e-ie",None,None),
        ("contar","stem-o-ue",None,None),
        ("pedir","stem-e-i",None,None),
        ("sentir","stem-e-ie-ir",None,None),
        ("dormir","stem-o-ue-ir",None,None),
    ]
    for inf,cls,ov,fs in tests:
        f = conjugate(inf,cls,ov,fs)
        print(f"{inf:15s}  pres:{f['present'][:3]}  imp:{f['imperative']}")


def _ortho_iar(inf, overrides=None):
    """Verbs in -iar where i is stressed: confiar, enviar (confío, confías...)."""
    stem = inf[:-2]   # e.g. confi, envi
    f = _regular(inf, "ar", stem)
    # accent on í in stressed persons (1,2,3,6)
    i_stem = stem[:-1] + "í"   # confi→confí
    for j in (0,1,2,5): f["present"][j] = i_stem + _PRES["ar"][j]
    f["subjunctive"] = [i_stem + _SUBJ["ar"][j] if j in (0,1,2,5) else stem + _SUBJ["ar"][j] for j in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_ducir(inf, overrides=None):
    """Verbs in -ducir: c→zc in yo present + strong preterite -uje."""
    stem = inf[:-2]   # e.g. reduc
    f = _regular(inf, "ir", stem)
    # yo present: c→zc
    zc = stem[:-1] + "zc"
    f["present"][0] = zc + "o"
    f["subjunctive"] = _apply(zc, _SUBJ["ir"])
    # strong preterite: -uje, -ujiste, -ujo, -ujimos, -ujisteis, -ujeron
    uj = stem[:-1] + "j"    # reduc→reduj
    f["preterite"] = [uj+"e", uj+"iste", uj+"o", uj+"imos", uj+"isteis", uj+"eron"]
    if overrides: f.update(overrides)
    return _finalise(f)

CLASS_RULES.update({"ortho-iar": _ortho_iar, "ortho-ducir": _ortho_ducir})


def _ortho_eer(inf, overrides=None):
    """Verbs in -eer/-aer: i→y in preterite 3rd/gerund (creer→creyó, leer→leyó).
    Accent required on í to break diphthong in preterite tú/nosotros/vosotros and pp."""
    stem = inf[:-2]
    f = _regular(inf, "er", stem)
    f["preterite"] = [
        stem + "í",
        stem + "íste",
        stem + "yó",
        stem + "ímos",
        stem + "ísteis",
        stem + "yeron",
    ]
    f["gerund"]          = stem + "yendo"
    f["past_participle"] = stem + "ído"
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_e_ie_zar(inf, overrides=None):
    """e→ie stem change + z→c orthographic (empezar, comenzar)."""
    stem = inf[:-2]   # empez, comenz
    f = _regular(inf, "ar", stem)
    idx = stem.rfind("e")
    ie  = stem[:idx] + "ie" + stem[idx+1:] if idx >= 0 else stem
    c   = stem[:-1] + "c"   # z→c for preterite yo + subjunctive
    # present stem change
    for i in (0,1,2,5): f["present"][i] = ie + _PRES["ar"][i]
    # preterite yo: z→c
    f["preterite"][0] = c + "é"
    # subjunctive: ie_stem + c for subj root
    ie_c = ie[:-1] + "c"   # empiec
    f["subjunctive"] = [ie_c + _SUBJ["ar"][j] if j in (0,1,2,5) else c + _SUBJ["ar"][j] for j in range(6)]
    if overrides: f.update(overrides)
    return _finalise(f)

def _ortho_ncer(inf, overrides=None):
    """Verbs in -ncer/-ncir: nc→nz before a/o (convencer→convenzo, vencer→venzo)."""
    stem = inf[:-2]   # convenc, venc
    ending = "er" if inf.endswith("er") else "ir"
    f = _regular(inf, ending, stem)
    nz = stem[:-1] + "z"   # convenc→convenz
    f["present"][0]  = nz + "o"
    f["subjunctive"] = _apply(nz, _SUBJ[ending])
    if overrides: f.update(overrides)
    return _finalise(f)

def _stem_e_i_gir(inf, overrides=None):
    """e→i stem change + g→j orthographic (elegir→elijo)."""
    stem = inf[:-2]
    f = _regular(inf, "ir", stem)
    idx = stem.rfind("e")
    i_s = stem[:idx] + "i" + stem[idx+1:] if idx >= 0 else stem
    j_s = i_s[:-1] + "j"   # g→j
    # present: j_s for yo, i_s for others
    f["present"][0] = j_s + "o"
    for i in (1,2,5): f["present"][i] = i_s + _PRES["ir"][i]
    # preterite 3rd: e→i
    f["preterite"][2] = i_s + "ió"
    f["preterite"][5] = i_s + "ieron"
    f["gerund"] = i_s + "iendo"
    f["subjunctive"] = _apply(j_s, _SUBJ["ir"])
    if overrides: f.update(overrides)
    return _finalise(f)

CLASS_RULES.update({
    "ortho-eer":       _ortho_eer,
    "stem-e-ie-zar":   _stem_e_ie_zar,
    "ortho-ncer":      _ortho_ncer,
    "stem-e-i-gir":    _stem_e_i_gir,
})
