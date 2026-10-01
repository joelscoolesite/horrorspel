// "Vingerafdruk" van een run: hash over alle posities van alle bollen, elke stap.
// Verandert er ook maar 1 bit in de physics, dan verandert de hash.
'use strict';
module.exports = function traceHash(G, genome, track, cfg, variant, maxSteps = 4000) {
  const ep = new G.Episode(genome, track, cfg, variant);
  const buf = new Float64Array(1), bytes = new Uint8Array(buf.buffer);
  let h = 2166136261 >>> 0, steps = 0;
  while (!ep.done && steps < maxSteps) {
    ep.step(); steps++;
    for (const n of ep.world.nodes) {
      for (const v of [n.x, n.y, n.z]) {
        buf[0] = v;
        for (let i = 0; i < 8; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
      }
    }
  }
  return { hash: h.toString(16), steps, maxX: ep.maxX, reason: ep.reason };
};
