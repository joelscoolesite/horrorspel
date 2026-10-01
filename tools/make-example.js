#!/usr/bin/env node
// Zet één of meer kampioen-JSON's om naar champions/example.js, zodat de
// browser ze kan laden zonder webserver (file:// mag geen JSON ophalen).
//   node tools/make-example.js champions/champion.json [nog-een.json ...]
// De knop "Example champion" in de app wisselt tussen deze voorbeelden.
'use strict';
const fs = require('fs');
const path = require('path');
const files = process.argv.slice(2);
if (!files.length) files.push(path.join(__dirname, '..', 'champions', 'champion.json'));
const examples = files.map(f => {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const g = data.genome;
  return {
    name: `${g.nodes.length} spheres · ${g.sticks.length} sticks`,
    level: data.level !== undefined ? data.level : 1,
    fitness: data.fitness, stats: data.stats, generation: data.generation, genome: g
  };
});
const out = path.join(__dirname, '..', 'champions', 'example.js');
fs.writeFileSync(out,
  '// Automatisch gemaakt door tools/make-example.js — voorbeeld-kampioenen\n' +
  'GROW.EXAMPLES = ' + JSON.stringify(examples) + ';\n');
console.log(`Geschreven: ${out} (${examples.length} voorbeeld${examples.length > 1 ? 'en' : ''})`);
