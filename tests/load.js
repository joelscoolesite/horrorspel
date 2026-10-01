// Laadt de simulatie-kern in Node (zelfde volgorde als index.html)
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['config', 'dmath', 'rng', 'physics', 'parkour', 'tracks', 'genome', 'episode', 'evolution']) {
  require(path.join(root, 'src', 'core', f + '.js'));
}
// voorbeeld-kampioenen (champions/example.js zet GROW.EXAMPLES)
require(path.join(root, 'champions', 'example.js'));
module.exports = globalThis.GROW;
