/* Seeded deterministic RNG (sfc32) + distribution helpers.
   Every random draw in the simulation flows through an RNG instance so that
   worlds are reproducible from their seed. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});

  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  class RNG {
    constructor(seed) {
      if (typeof seed === 'string') seed = hashStr(seed);
      seed = (seed >>> 0) || 0x9e3779b9;
      this.a = seed; this.b = seed ^ 0x2545f491; this.c = seed ^ 0x8f4a3c11; this.d = seed ^ 0x1c69b3f7;
      for (let i = 0; i < 12; i++) this.next(); // warm-up
    }
    next() {
      let { a, b, c, d } = this;
      const t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      c = c + t | 0;
      this.a = a; this.b = b; this.c = c; this.d = d;
      return (t >>> 0) / 4294967296;
    }
    // state save/restore for persistence
    getState() { return [this.a, this.b, this.c, this.d]; }
    setState(s) { this.a = s[0] | 0; this.b = s[1] | 0; this.c = s[2] | 0; this.d = s[3] | 0; }

    f(min, max) { return min + this.next() * (max - min); }
    i(min, max) { return Math.floor(this.f(min, max + 1)); } // inclusive
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    // Gaussian via Box-Muller, clamped
    gauss(mean, sd, lo, hi) {
      const u = Math.max(this.next(), 1e-9), v = this.next();
      let g = mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      if (lo !== undefined) g = Math.max(lo, Math.min(hi, g));
      return g;
    }
    // weighted pick from [{w, ...}] or (arr, weightFn)
    weighted(arr, wf) {
      let total = 0;
      for (const x of arr) total += wf ? wf(x) : x.w;
      if (total <= 0) return this.pick(arr);
      let r = this.next() * total;
      for (const x of arr) { r -= wf ? wf(x) : x.w; if (r <= 0) return x; }
      return arr[arr.length - 1];
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    id() { return Math.floor(this.next() * 0xffffffff).toString(36) + Math.floor(this.next() * 0xffffff).toString(36); }
  }

  RNG.hashStr = hashStr;
  PCS.RNG = RNG;
})();
