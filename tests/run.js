#!/usr/bin/env node
// =============================================================
//  tests/run.js — automatische tests:  npm test   (of: node tests/run.js)
// =============================================================
// Bewaakt vooral dat de simulatie DETERMINISTISCH blijft en dat oude
// organismen (de voorbeeld-kampioenen) bit-voor-bit hetzelfde lopen.
'use strict';
const path = require('path');
const G = require('./load.js');
const traceHash = require('./trace.js');
const golden = require('./golden.json');
const cfg = G.CONFIG;

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} verwacht ${b}, kreeg ${a}`); }

// ---------------------------------------------------------------
test('dmath: sin/tanh exact gelijk aan opgeslagen waarden', () => {
  eq(JSON.stringify([G.M.sin(0.3), G.M.sin(4.1), G.M.sin(-12.7)]), JSON.stringify(golden.dmath.sin));
  eq(JSON.stringify([G.M.tanh(0.3), G.M.tanh(-2.2), G.M.tanh(4)]), JSON.stringify(golden.dmath.tanh));
});

test('voorbeeld-kampioenen lopen bit-voor-bit hetzelfde (golden traces)', () => {
  const track = G.buildParkour(cfg, 1);
  G.EXAMPLES.forEach((ex, i) => {
    G.VALIDATION.slice(0, 3).forEach((v, k) => {
      const t = traceHash(G, G.Genome.normalize(G.Genome.clone(ex.genome)), track, cfg, v);
      eq(t.hash, golden.examples[i].traces[k].hash, `voorbeeld ${i} start ${k}:`);
    });
  });
});

test('voorbeeld-kampioenen halen hun opgeslagen fitness exact', () => {
  const saved = cfg.evo.curriculum;
  cfg.evo.curriculum = 0;
  const evo = new G.Evolution(cfg, 1);
  cfg.evo.curriculum = saved;
  for (const ex of G.EXAMPLES) {
    const r = evo.evaluate(G.Genome.normalize(G.Genome.clone(ex.genome)), G.VALIDATION);
    eq(r.fitness, ex.fitness, `${ex.name}:`);
  }
});

test('evolutie is reproduceerbaar (zelfde seed = zelfde geschiedenis)', () => {
  const run = () => {
    const evo = new G.Evolution(cfg, 42);
    for (let i = 0; i < 3; i++) evo.runGeneration();
    return JSON.stringify(evo.history);
  };
  eq(run(), run());
});

test('mutaties houden genomen geldig (fuzz, 3000 mutaties, ook met verborgen neuronen)', () => {
  const mode = cfg.evo.aiMode || 'smart';
  G.applyAIMode(cfg, 'experimental'); // alle onderdelen aan, ook verborgen neuronen
  try {
  const rng = new G.RNG(7);
  let g = G.Genome.initial(rng, cfg);
  for (let i = 0; i < 3000; i++) {
    g = G.Genome.mutate(g, rng, cfg);
    G.Genome.validate(g, cfg);
    if (i % 300 === 0) g = G.Genome.initial(rng, cfg);
  }
  } finally { G.applyAIMode(cfg, mode); }
});

test('bouw-modus: ontwerp → genoom → ontwerp houdt de posities', () => {
  const design = {
    nodes: [{ x: 0, y: 0.3, z: 0, r: 0.3 }, { x: 0.6, y: 0.2, z: 0.3, r: 0.13 }, { x: 0.6, y: 0.2, z: -0.3, r: 0.13 }, { x: 1.1, y: 0.5, z: 0, r: 0.13 }],
    sticks: [{ a: 0, b: 1, m: true }, { a: 0, b: 2, m: true }, { a: 1, b: 3, m: false }, { a: 2, b: 3, m: true }]
  };
  const g = G.Genome.fromDesign(design, new G.RNG(1));
  G.Genome.validate(g, cfg);
  const back = G.Genome.toDesign(g, [0, 0.3, 0]);
  for (const n of design.nodes) {
    assert(back.nodes.some(b => Math.hypot(b.x - n.x, b.y - n.y, b.z - n.z) < 1e-9), 'positie kwijt');
  }
  eq(back.sticks.length, design.sticks.length, 'aantal stokjes');
});

test('symmetrie: spiegel-bollen liggen exact gespiegeld en delen hun brein', () => {
  const rng = new G.RNG(11);
  let mirrored = 0;
  for (let t = 0; t < 200; t++) {
    let g = G.Genome.initial(rng, cfg);
    for (let i = 0; i < 10; i++) g = G.Genome.mutate(g, rng, cfg);
    const bp = G.Genome.blueprint(g);
    g.nodes.forEach((n, i) => {
      if (n.mirOf === undefined) return;
      const m = G.Genome.nodeIndexByUid(g, n.mirOf);
      if (!G.Genome.mirrorParentOk(g, m, i, bp)) return;
      mirrored++;
      assert(Math.abs(bp[i][0] - bp[m][0]) < 1e-9 && Math.abs(bp[i][1] - bp[m][1]) < 1e-9 &&
        Math.abs(bp[i][2] + bp[m][2]) < 1e-9, `bol ${i} is geen spiegelbeeld van ${m}`);
    });
  }
  assert(mirrored > 50, `te weinig gespiegelde bollen gevonden (${mirrored})`);
});

test('berichten: met zender-gewichten verandert het gedrag, zonder niet', () => {
  const track = G.buildParkour(cfg, 1);
  const base = G.Genome.normalize(G.Genome.clone(G.EXAMPLES[1].genome));
  const withMsg = G.Genome.clone(base);
  for (const s of withMsg.sticks) { s.u = s.u.map((_, i) => (i === 0 ? 1.5 : 0)); s.w[10] = 1.2; }
  const a = traceHash(G, base, track, cfg, G.NOMINAL), b = traceHash(G, withMsg, track, cfg, G.NOMINAL);
  eq(a.hash, golden.examples[1].traces[0].hash, 'zonder berichten:');
  assert(a.hash !== b.hash, 'berichten hebben geen effect');
});

test('verborgen neuronen: nieuw neuron is neutraal, met gewicht verandert het gedrag', () => {
  const track = G.buildParkour(cfg, 1), rng = new G.RNG(4);
  const base = G.Genome.normalize(G.Genome.clone(G.EXAMPLES[1].genome));
  const neutral = G.Genome.clone(base);
  for (const st of neutral.sticks) if (st.m) st.h = [G.Genome.newHidden(rng), G.Genome.newHidden(rng)];
  G.Genome.validate(neutral, null);
  eq(traceHash(G, neutral, track, cfg, G.NOMINAL).hash, golden.examples[1].traces[0].hash, 'neutraal neuron:');
  const active = G.Genome.clone(neutral);
  for (const st of active.sticks) for (const h of st.h) h.o = 1.0;
  assert(traceHash(G, active, track, cfg, G.NOMINAL).hash !== golden.examples[1].traces[0].hash, 'neuron doet niets');
  // brein als lijst getallen eruit en er weer in = hetzelfde
  const v = G.Genome.getBrain(active);
  const copy = G.Genome.setBrain(G.Genome.clone(active), v);
  eq(JSON.stringify(G.Genome.getBrain(copy)), JSON.stringify(v));
});

test('gradiënt-stap: maakt geldige getunede kinderen met een ander brein', () => {
  const saved = cfg.evo.popSize, mode = cfg.evo.aiMode || 'smart';
  cfg.evo.popSize = 12;
  G.applyAIMode(cfg, 'basic'); cfg.evo.esTune = 1;
  try {
    const evo = new G.Evolution(cfg, 21);
    for (let i = 0; i < 3; i++) evo.runGeneration();
    assert(evo.tuneStats.made >= 4, `te weinig getunede kinderen (${evo.tuneStats.made})`);
    const tuned = evo.population.filter(p => p.genome.tuned === evo.generation - 1);
    assert(tuned.length === 2, `getunede kinderen niet in de populatie (${tuned.length})`);
    for (const t of tuned) {
      G.Genome.validate(t.genome, cfg);
      assert(JSON.stringify(G.Genome.getBrain(t.genome)) !== JSON.stringify(G.Genome.getBrain(evo.champion.genome)), 'brein niet veranderd');
    }
  } finally { cfg.evo.popSize = saved; G.applyAIMode(cfg, mode); }
});

test('parcoursen: alle uitdagingen bouwen goed en zijn speelbaar', () => {
  for (const ch of G.CHALLENGES) {
    if (ch.classic) continue;
    const saved = cfg.track;
    cfg.track = { name: ch.name, segments: ch.segments };
    try {
      for (const level of [0, 0.5, 1]) {
        const tr = G.buildParkour(cfg, level);
        assert(tr.colliders.length > 5 && tr.finishX > 10, `${ch.name}: te kort`);
        assert(tr.heightAt(1, 0) === 0, `${ch.name}: geen grond bij de start`);
        const ep = new G.Episode(G.EXAMPLES[0].genome, tr, cfg, G.NOMINAL);
        while (!ep.run(5000));
        assert(Number.isFinite(ep.maxX) && ep.reason !== 'instabiel', `${ch.name} level ${level}: ${ep.reason}`);
      }
    } finally { cfg.track = saved; }
  }
});

test('bewegend obstakel beweegt deterministisch', () => {
  const tr = G.buildCustomTrack({ segments: [G.makeSegment('flat', { len: 2 }), G.makeSegment('sweeper', { speed: 2 })] }, cfg, 1);
  const mover = tr.colliders.find(c => c.kind === 'mover');
  assert(mover && mover.czAt(0) !== mover.czAt(0.5), 'sweeper beweegt niet');
  eq(mover.czAt(1.234), mover.czAt(1.234));
});

test('parallel (worker_threads) geeft exact hetzelfde als één kern', async () => {
  const NodePool = require(path.join(__dirname, '..', 'tools', 'pool-node.js'));
  // kleine populatie, veel generaties: zo komen ook de wisselende test (elke 3
  // generaties) en novelty search (na 10 generaties zonder verbetering) aan bod
  const saved = { pop: cfg.evo.popSize, refresh: cfg.evo.validationRefresh, race: cfg.evo.raceTop, rec: cfg.evo.recombine };
  cfg.evo.popSize = 14; cfg.evo.validationRefresh = 3;
  cfg.evo.raceTop = 4; cfg.evo.recombine = 1; // ook racing en recombinatie moeten deterministisch zijn
  const GENS = 14;
  try {
    const a = new G.Evolution(cfg, 9);
    for (let i = 0; i < GENS; i++) a.runGeneration();
    const b = new G.Evolution(cfg, 9);
    const pool = new NodePool(3);
    b.setPool(pool);
    for (let i = 0; i < GENS; i++) await b.runGenerationAsync();
    await pool.close();
    eq(JSON.stringify(b.history), JSON.stringify(a.history));
    // (id/parent zijn volgnummers die in dit proces doortellen → niet vergelijken)
    const strip = c => JSON.stringify({ ...c, genome: { ...c.genome, id: 0, parent: 0 } });
    eq(strip(b.champion), strip(a.champion), 'kampioen:');
  } finally {
    cfg.evo.popSize = saved.pop; cfg.evo.validationRefresh = saved.refresh;
    cfg.evo.raceTop = saved.race; cfg.evo.recombine = saved.rec;
  }
});

test('parallel op een eigen parcours (met sweepers) = één kern', async () => {
  const NodePool = require(path.join(__dirname, '..', 'tools', 'pool-node.js'));
  const saved = { pop: cfg.evo.popSize, track: cfg.track };
  cfg.evo.popSize = 10;
  const def = G.CHALLENGES.find(c => c.id === 'sweepers');
  try {
    const a = new G.Evolution(cfg, 5); a.setTrack({ name: def.name, segments: def.segments }, 1);
    for (let i = 0; i < 3; i++) a.runGeneration();
    const b = new G.Evolution(cfg, 5); b.setTrack({ name: def.name, segments: def.segments }, 1);
    const pool = new NodePool(2); b.setPool(pool);
    for (let i = 0; i < 3; i++) await b.runGenerationAsync();
    await pool.close();
    eq(JSON.stringify(b.history), JSON.stringify(a.history));
  } finally { cfg.evo.popSize = saved.pop; cfg.track = saved.track; }
});

// ---------------------------------------------------------------
(async () => {
  for (const t of tests) {
    const t0 = Date.now();
    try {
      await t.fn();
      passed++;
      console.log(`  ✔ ${t.name}  (${Date.now() - t0} ms)`);
    } catch (e) {
      failed++;
      console.log(`  ✘ ${t.name}\n      ${e.message}`);
    }
  }
  console.log(`\n${passed} geslaagd, ${failed} mislukt`);
  process.exit(failed ? 1 : 0);
})();
