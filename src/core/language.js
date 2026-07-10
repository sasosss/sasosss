/* Procedural language generator.
   Each culture owns a Language: a phoneme inventory + syllable patterns.
   From it we derive personal names, surnames, city names, god names, words.
   Languages drift over time producing dialects. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});

  const CONS_SETS = [
    ['k', 't', 'r', 'n', 'm', 's', 'l', 'd', 'v'],
    ['th', 'g', 'r', 'd', 'b', 'k', 'v', 'z', 'n'],
    ['sh', 'k', 'm', 'n', 't', 'z', 'r', 'h', 'y'],
    ['p', 'l', 'f', 'w', 'n', 't', 'k', 'm', 'h'],
    ['b', 'r', 'g', 'd', 'z', 'n', 'm', 'kh', 'l'],
    ['s', 'v', 'l', 'r', 'n', 'd', 'j', 'm', 't'],
    ['q', 'r', 'x', 'n', 'm', 'l', 't', 's', 'd'],
    ['c', 'ss', 'r', 'll', 'n', 'm', 'd', 't', 'v'],
  ];
  const VOW_SETS = [
    ['a', 'e', 'i', 'o', 'u'],
    ['a', 'i', 'u', 'ai', 'ia'],
    ['a', 'e', 'o', 'ae', 'ei'],
    ['e', 'i', 'y', 'a', 'io'],
    ['a', 'o', 'u', 'ou', 'ua'],
    ['a', 'e', 'i', 'ea', 'ao'],
  ];
  const PATTERNS = [
    ['CV', 'CVC', 'CV', 'VC'],
    ['CVC', 'CV', 'CVCC'],
    ['V', 'CV', 'CVC', 'VC'],
    ['CV', 'CVV', 'CVC'],
    ['CVC', 'CCV', 'CV'],
  ];
  const ENDINGS_M = [['on', 'ar', 'us', 'ek'], ['im', 'or', 'an', 'eth'], ['o', 'is', 'ur', 'ax'], ['as', 'en', 'ir', 'ul']];
  const ENDINGS_F = [['a', 'ia', 'is', 'ea'], ['ith', 'ara', 'ei', 'una'], ['e', 'ina', 'ys', 'ail'], ['ah', 'iel', 'ora', 'yn']];
  const CITY_SUFFIX = [['grad', 'burg', 'holm', 'stad'], ['ath', 'or', 'ium', 'polis'], ['kar', 'dun', 'mir', 'vek'],
    ['a', 'ara', 'eth', 'os'], ['nia', 'ria', 'tis', 'ium'], ['fell', 'mark', 'wick', 'thorp']];

  class Language {
    constructor(seed) {
      this.seed = seed;
      const rng = new PCS.RNG(seed);
      this.cons = rng.pick(CONS_SETS).slice();
      this.vows = rng.pick(VOW_SETS).slice();
      this.patterns = rng.pick(PATTERNS).slice();
      this.endM = rng.pick(ENDINGS_M).slice();
      this.endF = rng.pick(ENDINGS_F).slice();
      this.citySuf = rng.pick(CITY_SUFFIX).slice();
      this.apostrophe = rng.chance(0.18);
      this.doubleVowel = rng.chance(0.25);
      // small stable lexicon cache word->translation, grows lazily
      this.lexicon = {};
      this.drift = 0; // increases over centuries -> dialects
    }
    static fromJSON(o) {
      const l = Object.create(Language.prototype);
      Object.assign(l, o);
      return l;
    }
    syllable(rng) {
      const pat = rng.pick(this.patterns);
      let s = '';
      for (const ch of pat) {
        if (ch === 'C') s += rng.pick(this.cons);
        else s += rng.pick(this.vows);
      }
      return s;
    }
    word(rng, syls) {
      syls = syls || rng.i(1, 3);
      let w = '';
      for (let i = 0; i < syls; i++) {
        w += this.syllable(rng);
        if (this.apostrophe && i === 0 && syls > 1 && rng.chance(0.3)) w += "'";
      }
      if (this.doubleVowel && rng.chance(0.2)) {
        const v = rng.pick(this.vows.filter(x => x.length === 1));
        if (v) w += v + v;
      }
      return w;
    }
    firstName(rng, sex) {
      let n = this.word(rng, rng.i(1, 2));
      n += rng.pick(sex === 'F' ? this.endF : this.endM);
      return cleanup(PCS.U.cap(n));
    }
    surname(rng) {
      const n = this.word(rng, rng.i(2, 3));
      return cleanup(PCS.U.cap(n));
    }
    cityName(rng) {
      let n = this.word(rng, rng.i(1, 2)) + rng.pick(this.citySuf);
      return cleanup(PCS.U.cap(n));
    }
    godName(rng) {
      let n = this.word(rng, rng.i(2, 3));
      return cleanup(PCS.U.cap(n));
    }
    // stable translated word for a concept, e.g. "pane" in this language
    concept(key) {
      if (!this.lexicon[key]) {
        const rng = new PCS.RNG(this.seed + '|' + key);
        this.lexicon[key] = cleanup(this.word(rng, rng.i(1, 3)));
      }
      return this.lexicon[key];
    }
  }

  function cleanup(w) {
    return w
      .replace(/'{2,}/g, "'")
      .replace(/(.)\1{2,}/g, '$1$1')
      .replace(/'$/, '');
  }

  PCS.Language = Language;
})();
