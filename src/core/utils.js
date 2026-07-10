/* Persistent Civilization Simulator — core utilities */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});

  const U = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    // smooth interpolation curve
    smooth(t) { return t * t * (3 - 2 * t); },
    dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); },
    // Format big numbers compactly (12 400 -> "12,4k")
    fmt(n) {
      if (n === null || n === undefined || isNaN(n)) return '–';
      const abs = Math.abs(n);
      if (abs >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' mld';
      if (abs >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' mln';
      if (abs >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + 'k';
      return String(Math.round(n));
    },
    cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; },
    // Italian year label (negative years = "a.F." avanti Fondazione)
    yearLabel(y) { return y < 0 ? `${-y} a.F.` : `anno ${y}`; },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    sum(arr, f) { let s = 0; for (let i = 0; i < arr.length; i++) s += f ? f(arr[i]) : arr[i]; return s; },
    maxBy(arr, f) {
      let best = null, bv = -Infinity;
      for (const x of arr) { const v = f(x); if (v > bv) { bv = v; best = x; } }
      return best;
    },
    minBy(arr, f) {
      let best = null, bv = Infinity;
      for (const x of arr) { const v = f(x); if (v < bv) { bv = v; best = x; } }
      return best;
    },
    removeItem(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); },
    // Italian plural article for animal/thing names ("i lupi", "gli orsi", "le tigri")
    artPl(word) {
      const w = String(word || '');
      if (/^(tigri|antilopi|capre|pecore|aquile|volpi)/.test(w)) return 'le';
      if (/^[aeiou]/i.test(w) || /^(gn|ps|z|x|s[bcdfglmnpqrtvz])/i.test(w)) return 'gli';
      return 'i';
    },
    // Normalize text for NLU: lowercase, strip accents & punctuation
    norm(s) {
      return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s']/g, ' ')
        .replace(/\s+/g, ' ').trim();
    },
  };

  // Minimal event bus for UI <-> sim decoupling
  class Bus {
    constructor() { this.map = new Map(); }
    on(ev, fn) {
      if (!this.map.has(ev)) this.map.set(ev, []);
      this.map.get(ev).push(fn);
      return () => U.removeItem(this.map.get(ev), fn);
    }
    emit(ev, data) {
      const l = this.map.get(ev);
      if (l) for (const fn of l.slice()) fn(data);
    }
  }

  // LZW compression for localStorage saves. Input is any JS string (converted
  // to a byte-string first); output chars stay below the surrogate range so
  // the result is always a valid UTF-16 string.
  const LZ_OFFSET = 32, LZ_MAX = 0xD800 - LZ_OFFSET - 1;
  const LZ = {
    compress(input) {
      const s = unescape(encodeURIComponent(input)); // -> byte string
      let dict = new Map();
      let dictSize = 256;
      const out = [];
      let w = '';
      const codeOf = (str) => str.length === 1 ? str.charCodeAt(0) : dict.get(str);
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        const wc = w + c;
        if (wc.length === 1 || dict.has(wc)) w = wc;
        else {
          out.push(String.fromCharCode(codeOf(w) + LZ_OFFSET));
          if (dictSize < LZ_MAX) dict.set(wc, dictSize++);
          else { dict = new Map(); dictSize = 256; }
          w = c;
        }
      }
      if (w) out.push(String.fromCharCode(codeOf(w) + LZ_OFFSET));
      return out.join('');
    },
    decompress(input) {
      let dict = [];
      for (let i = 0; i < 256; i++) dict[i] = String.fromCharCode(i);
      let dictSize = 256;
      const first = input.charCodeAt(0) - LZ_OFFSET;
      let w = dict[first];
      const out = [w];
      for (let i = 1; i < input.length; i++) {
        const k = input.charCodeAt(i) - LZ_OFFSET;
        let entry;
        if (dict[k] !== undefined) entry = dict[k];
        else if (k === dictSize) entry = w + w[0];
        else throw new Error('LZ: dato corrotto');
        out.push(entry);
        if (dictSize < LZ_MAX) dict[dictSize++] = w + entry[0];
        else { dict = dict.slice(0, 256); dictSize = 256; }
        w = entry;
      }
      return decodeURIComponent(escape(out.join('')));
    },
  };

  PCS.U = U;
  PCS.LZ = LZ;
  PCS.bus = new Bus();
})();
