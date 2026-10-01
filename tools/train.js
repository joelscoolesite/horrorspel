#!/usr/bin/env node
// =============================================================
//  train.js — supersnel trainen zonder graphics (Node.js)
// =============================================================
//  Gebruik (Windows: Command Prompt of PowerShell in deze map):
//
//    node tools/train.js                     (100 generaties)
//    node tools/train.js --gens 300 --pop 80 --seed 7
//    node tools/train.js --from champions/champion.json
//    node tools/train.js --set fitness.nodeCost=0.3 --set evo.tournament=4
//    node tools/train.js --set evo.curriculum=0      (meteen het volledige parcours)
//    node tools/train.js --level 0.5                 (start op halve moeilijkheid)
//    node tools/train.js --workers 1                 (maar één CPU-kern gebruiken)
//
//  Het beste organisme wordt opgeslagen in champions/champion.json.
//  In de browser laad je dat met de knop "Load JSON".
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const f of ['config', 'dmath', 'rng', 'physics', 'parkour', 'tracks', 'genome', 'episode', 'evolution']) {
  require(path.join(root, 'src', 'core', f + '.js'));
}
const G = globalThis.GROW;

// ---- argumenten ----
const args = { set: [] };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, ''), val = process.argv[i + 1];
  if (key === 'set') args.set.push(val); else args[key] = val;
}
const gens = parseInt(args.gens || '100', 10);
const seed = parseInt(args.seed || '1', 10);
if (args.pop) G.CONFIG.evo.popSize = parseInt(args.pop, 10);
// --set groep.naam=waarde  (bv. fitness.nodeCost=0.3)
for (const kv of args.set) {
  const [k, v] = kv.split('=');
  const parts = k.split('.');
  let obj = G.CONFIG;
  for (let j = 0; j < parts.length - 1; j++) obj = obj[parts[j]];
  if (!obj || !(parts[parts.length - 1] in obj)) { console.error('Onbekende instelling:', k); process.exit(1); }
  obj[parts[parts.length - 1]] = parseFloat(v);
  console.log(`  ${k} = ${v}`);
}
const out = args.out || path.join(root, 'champions', 'champion.json');

const os = require('os');
const NodePool = require('./pool-node.js');
const nWorkers = args.workers !== undefined ? parseInt(args.workers, 10) : os.cpus().length;

const evo = new G.Evolution(G.CONFIG, seed);
if (args.level !== undefined) evo.setLevel(parseFloat(args.level));
if (args.from) {
  const data = JSON.parse(fs.readFileSync(args.from, 'utf8'));
  if (args.level === undefined && data.level !== undefined) evo.setLevel(data.level);
  evo.inject(data.genome || data);
  console.log('Start-genoom geladen uit', args.from, '(level', evo.level + ')');
}

const pool = nWorkers > 1 ? new NodePool(nWorkers) : null;
if (pool) evo.setPool(pool);
console.log(`Training: ${gens} generaties, populatie ${G.CONFIG.evo.popSize}, seed ${seed}, ` +
  `${pool ? nWorkers + ' CPU-kernen' : '1 CPU-kern'}`);
console.log('gen | level | kampioen | beste  | gem.   | afstand | finish | bollen/stokjes | soorten | tijd');
console.log('    |       | (8 vaste | (deze generatie, gemiddeld over 3 willekeurige starts)');
console.log('    |       |  starts) |');
const t0 = Date.now();
let savedVersion = 0;

(async () => {
for (let g = 0; g < gens; g++) {
  const tg = Date.now();
  await evo.runGenerationAsync();
  const h = evo.history[evo.history.length - 1];
  console.log(
    `${String(h.gen).padStart(3)} | ${(h.level * 100).toFixed(0).padStart(4)}% | ${h.champ.toFixed(2).padStart(8)} | ${h.best.toFixed(2).padStart(6)} | ${h.avg.toFixed(2).padStart(6)} | ` +
    `${h.dist.toFixed(2).padStart(6)}m | ${(h.finishRate * 100).toFixed(0).padStart(5)}% | ${String(h.nodes).padStart(6)}/${String(h.sticks).padEnd(7)} | ` +
    `${String(h.species).padStart(7)} | ${((Date.now() - tg) / 1000).toFixed(1)}s`
  );
  if (evo.championVersion !== savedVersion) {
    savedVersion = evo.championVersion;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ ...evo.champion, savedAt: new Date().toISOString() }, null, 1));
  }
}

const c = evo.champion;
console.log(`\nKlaar in ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
console.log(`Kampioen (gen ${c.generation}, gemeten op parcours-level ${Math.round(evo.level * 100)}%): ` +
  `fitness ${c.fitness.toFixed(2)}, gem. ${c.stats.maxX.toFixed(2)} m, ` +
  `${c.stats.checkpoints.toFixed(1)} checkpoints, finish in ${(c.stats.finishRate * 100).toFixed(0)}% van de ${c.stats.trials} testritten`);
console.log(`Vorm: ${G.Genome.describe(c.genome)}`);
console.log(`Opgeslagen: ${out}`);
if (pool) await pool.close();
})();
