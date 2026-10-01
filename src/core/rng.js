// =============================================================
//  rng.js — reproduceerbare random getallen (met een "seed")
// =============================================================
// Zelfde seed = exact dezelfde evolutie. Handig om te debuggen.
(function (G) {
  'use strict';

  class RNG {
    constructor(seed = 1) { this.s = (seed >>> 0) || 1; }

    // Mulberry32: klein, snel en goed genoeg voor simulaties
    next() {
      let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(n) { return Math.floor(this.next() * n); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }

    // Normaal verdeeld (gemiddelde 0, spreiding 1) — Box-Muller
    gauss() {
      let u = 0;
      while (u === 0) u = this.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
    }

    // Willekeurige richting (lengte 1)
    unitVec() {
      const x = this.gauss(), y = this.gauss(), z = this.gauss();
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    }
  }

  G.RNG = RNG;
})((globalThis.GROW = globalThis.GROW || {}));
