#!/usr/bin/env node
// Zet een kampioen-JSON om naar champions/example.js, zodat de browser hem
// kan laden zonder webserver (file:// mag geen JSON-bestanden ophalen).
//   node tools/make-example.js champions/champion.json
'use strict';
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'champions', 'champion.json');
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = path.join(__dirname, '..', 'champions', 'example.js');
fs.writeFileSync(out,
  '// Automatisch gemaakt door tools/make-example.js — voorbeeld-kampioen\n' +
  'GROW.EXAMPLE_CHAMPION = ' + JSON.stringify(data) + ';\n');
console.log('Geschreven:', out);
