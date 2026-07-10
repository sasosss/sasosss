/* Procedural world generation: continents, mountains, rivers, climate, biomes,
   natural resources. The map is stored in flat typed arrays for performance. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});
  const { U } = PCS;

  const BIOMES = {
    OCEAN: 0, COAST: 1, ICE: 2, TUNDRA: 3, TAIGA: 4, GRASS: 5, FOREST: 6,
    JUNGLE: 7, SAVANNA: 8, DESERT: 9, MOUNTAIN: 10, PEAK: 11, SWAMP: 12, STEPPE: 13,
  };
  const BIOME_INFO = [
    { name: 'Oceano', col: [16, 42, 78], fert: 0, hab: 0 },
    { name: 'Costa', col: [30, 74, 116], fert: 0.3, hab: 0 },
    { name: 'Ghiacci', col: [225, 233, 240], fert: 0, hab: 0.05 },
    { name: 'Tundra', col: [148, 158, 148], fert: 0.15, hab: 0.3 },
    { name: 'Taiga', col: [72, 100, 78], fert: 0.3, hab: 0.5 },
    { name: 'Prateria', col: [110, 140, 70], fert: 0.85, hab: 1 },
    { name: 'Foresta', col: [56, 96, 52], fert: 0.7, hab: 0.9 },
    { name: 'Giungla', col: [34, 88, 42], fert: 0.55, hab: 0.6 },
    { name: 'Savana', col: [160, 148, 76], fert: 0.5, hab: 0.75 },
    { name: 'Deserto', col: [196, 168, 110], fert: 0.05, hab: 0.15 },
    { name: 'Montagna', col: [122, 112, 104], fert: 0.1, hab: 0.25 },
    { name: 'Vette', col: [200, 200, 206], fert: 0, hab: 0.05 },
    { name: 'Palude', col: [66, 90, 66], fert: 0.4, hab: 0.4 },
    { name: 'Steppa', col: [138, 138, 82], fert: 0.45, hab: 0.7 },
  ];
  const RESOURCES = ['ferro', 'oro', 'gemme', 'cavalli', 'pesce', 'grano', 'legname', 'pietra', 'spezie', 'sale', 'rame', 'argilla'];

  class WorldMap {
    constructor(w, h) {
      this.w = w; this.h = h;
      const n = w * h;
      this.elev = new Float32Array(n);
      this.temp = new Float32Array(n);
      this.moist = new Float32Array(n);
      this.biome = new Uint8Array(n);
      this.river = new Uint8Array(n);
      this.forest = new Float32Array(n); // density 0..1, can burn/regrow
      this.resource = new Int8Array(n).fill(-1);
      this.owner = new Int16Array(n).fill(-1); // civ id claiming the tile
    }
    idx(x, y) { return y * this.w + x; }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    isLand(i) { return this.biome[i] >= 2; }
    isWater(i) { return this.biome[i] < 2; }
  }

  function generateWorld(seed, w, h) {
    const map = new WorldMap(w, h);
    const nElev = new PCS.Noise(seed + ':elev');
    const nRidge = new PCS.Noise(seed + ':ridge');
    const nMoist = new PCS.Noise(seed + ':moist');
    const nTemp = new PCS.Noise(seed + ':temp');
    const nDetail = new PCS.Noise(seed + ':det');
    const rng = new PCS.RNG(seed + ':world');

    // --- continents: several blobs + fbm ---
    const blobs = [];
    const nBlobs = rng.i(4, 7);
    for (let b = 0; b < nBlobs; b++) {
      blobs.push({
        x: rng.f(0.15, 0.85) * w, y: rng.f(0.18, 0.82) * h,
        r: rng.f(0.14, 0.30) * Math.min(w, h),
      });
    }
    const S = 5.2 / Math.min(w, h); // noise scale
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = map.idx(x, y);
        let mask = 0;
        for (const b of blobs) {
          const d = U.dist(x, y, b.x, b.y) / b.r;
          mask = Math.max(mask, 1 - d);
        }
        const base = nElev.fbm(x * S, y * S, 6) * 0.9 + nDetail.fbm(x * S * 4, y * S * 4, 3) * 0.1;
        let e = base * 0.62 + U.clamp(mask, 0, 1) * 0.55 - 0.32;
        // ridged mountain chains on land
        const ridge = nRidge.ridge(x * S * 1.6, y * S * 1.6, 4);
        if (e > 0.16) e += Math.pow(ridge, 3) * 0.9;
        // edges fall into ocean
        const ey = Math.min(y, h - 1 - y) / (h * 0.5);
        const ex = Math.min(x, w - 1 - x) / (w * 0.5);
        e -= Math.pow(1 - Math.min(1, Math.min(ex, ey) * 4), 2) * 0.5;
        map.elev[i] = e;
        // temperature: latitude bands + altitude + noise
        const lat = Math.abs(y / h - 0.5) * 2; // 0 equator, 1 pole
        let t = 1 - lat * 1.15 + (nTemp.fbm(x * S * 2, y * S * 2, 3) - 0.5) * 0.25;
        if (e > 0.2) t -= (e - 0.2) * 0.9;
        map.temp[i] = t;
        map.moist[i] = nMoist.fbm(x * S * 2.3, y * S * 2.3, 4);
      }
    }

    // --- rivers: trace downhill from high, wet tiles ---
    const nRivers = Math.floor(w * h / 900);
    for (let r = 0; r < nRivers; r++) {
      let x = rng.i(2, w - 3), y = rng.i(2, h - 3);
      let i = map.idx(x, y);
      if (map.elev[i] < 0.42 || map.moist[i] < 0.35) continue;
      for (let step = 0; step < 400; step++) {
        i = map.idx(x, y);
        if (map.elev[i] <= 0.02) break; // reached sea
        map.river[i] = 1;
        // move to lowest neighbour (with slight meander)
        let bx = x, by = y, be = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!map.inb(nx, ny)) continue;
          const e = map.elev[map.idx(nx, ny)] + rng.f(0, 0.015);
          if (e < be && !map.river[map.idx(nx, ny)]) { be = e; bx = nx; by = ny; }
        }
        if (bx === x && by === y) break; // stuck in a pit -> lake end
        x = bx; y = by;
      }
    }

    // --- biomes ---
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = map.idx(x, y);
        const e = map.elev[i], t = map.temp[i];
        let m = map.moist[i];
        if (map.river[i]) m = Math.min(1, m + 0.25);
        let b;
        if (e <= 0) b = BIOMES.OCEAN;
        else if (e <= 0.045) b = BIOMES.COAST;
        else if (e > 0.78) b = BIOMES.PEAK;
        else if (e > 0.58) b = BIOMES.MOUNTAIN;
        else if (t < -0.15) b = BIOMES.ICE;
        else if (t < 0.06) b = BIOMES.TUNDRA;
        else if (t < 0.3) b = m > 0.42 ? BIOMES.TAIGA : BIOMES.TUNDRA;
        else if (t > 0.78 && m < 0.3) b = BIOMES.DESERT;
        else if (t > 0.68 && m > 0.62) b = BIOMES.JUNGLE;
        else if (t > 0.62 && m < 0.48) b = BIOMES.SAVANNA;
        else if (m > 0.72 && e < 0.12) b = BIOMES.SWAMP;
        else if (m > 0.52) b = BIOMES.FOREST;
        else if (m < 0.34) b = BIOMES.STEPPE;
        else b = BIOMES.GRASS;
        map.biome[i] = b;
        map.forest[i] = (b === BIOMES.FOREST || b === BIOMES.TAIGA || b === BIOMES.JUNGLE)
          ? 0.6 + m * 0.4 : (b === BIOMES.GRASS && m > 0.45 ? 0.2 : 0);
        // scattered resources on land
        if (e > 0.045 && rng.chance(0.035)) {
          let pool;
          if (b === BIOMES.MOUNTAIN || b === BIOMES.PEAK) pool = [0, 1, 2, 7, 10];
          else if (b === BIOMES.COAST) pool = [4, 9];
          else if (b === BIOMES.DESERT) pool = [9, 8, 1];
          else if (b === BIOMES.GRASS || b === BIOMES.STEPPE) pool = [3, 5, 11, 0];
          else if (b === BIOMES.FOREST || b === BIOMES.TAIGA || b === BIOMES.JUNGLE) pool = [6, 8, 2];
          else pool = [7, 11];
          map.resource[map.idx(x, y)] = rng.pick(pool);
        }
        if (b === BIOMES.COAST && rng.chance(0.06)) map.resource[i] = 4; // fish
      }
    }
    return map;
  }

  // Serialize only what cannot be regenerated (owner/forest mutate; the rest is
  // deterministic from seed, so saves stay small).
  function packMapState(map) {
    return {
      owner: Array.from(map.owner),
      forest: Array.from(map.forest, v => Math.round(v * 100)),
    };
  }
  function unpackMapState(map, st) {
    if (!st) return;
    if (st.owner) map.owner.set(st.owner);
    if (st.forest) for (let i = 0; i < st.forest.length; i++) map.forest[i] = st.forest[i] / 100;
  }

  PCS.BIOMES = BIOMES;
  PCS.BIOME_INFO = BIOME_INFO;
  PCS.RESOURCES = RESOURCES;
  PCS.WorldMap = WorldMap;
  PCS.generateWorld = generateWorld;
  PCS.packMapState = packMapState;
  PCS.unpackMapState = unpackMapState;
})();
