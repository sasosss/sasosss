/* Seeded 2D value-noise with fractal Brownian motion, used by world generation. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  class Noise {
    constructor(seed) {
      // permutation-based lattice noise
      const rng = new PCS.RNG(seed);
      this.perm = new Uint8Array(512);
      const p = [];
      for (let i = 0; i < 256; i++) p[i] = i;
      rng.shuffle(p);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    latt(ix, iy) {
      return this.perm[(this.perm[ix & 255] + iy) & 255] / 255;
    }
    at(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = U.smooth(x - ix), fy = U.smooth(y - iy);
      const a = this.latt(ix, iy), b = this.latt(ix + 1, iy);
      const c = this.latt(ix, iy + 1), d = this.latt(ix + 1, iy + 1);
      return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
    }
    // fractal noise in [0,1]
    fbm(x, y, octaves = 5, lac = 2, gain = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * this.at(x * freq, y * freq);
        norm += amp;
        amp *= gain; freq *= lac;
      }
      return sum / norm;
    }
    // ridged noise for mountain chains
    ridge(x, y, octaves = 4) {
      let amp = 0.5, freq = 1, sum = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * (1 - Math.abs(2 * this.at(x * freq, y * freq) - 1));
        amp *= 0.5; freq *= 2.1;
      }
      return sum;
    }
  }

  PCS.Noise = Noise;
})();
