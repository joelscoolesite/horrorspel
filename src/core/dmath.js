// =============================================================
//  dmath.js — deterministische wiskunde
// =============================================================
//
//  Waarom? Math.sin, Math.tanh, Math.hypot… mogen per browser een
//  heel klein beetje verschillen (laatste decimaal). In een CHAOTISCH
//  systeem (een tuimelend organisme) groeit zo'n piepklein verschil
//  binnen 2 seconden uit tot een compleet andere run. Dan zou een
//  kampioen die in Node getraind is in Chrome ineens in het gat vallen.
//
//  + − × ÷ en √ zijn volgens de IEEE-754-standaard op ELKE computer
//  bit-voor-bit gelijk. Daarom bouwen we sin/cos/tanh zelf, alleen
//  met die bewerkingen.
(function (G) {
  'use strict';
  const PI = 3.141592653589793, TWO_PI = 6.283185307179586, HALF_PI = 1.5707963267948966;

  // sin via Taylor-reeks na het terugbrengen naar [-π/2, π/2]
  function sin(x) {
    x -= Math.round(x / TWO_PI) * TWO_PI;     // nu in [-π, π]
    if (x > HALF_PI) x = PI - x;
    else if (x < -HALF_PI) x = -PI - x;       // nu in [-π/2, π/2]
    const x2 = x * x;
    return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 +
      x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
  }
  const cos = x => sin(x + HALF_PI);

  // tanh via een Padé-benadering (breuk van veeltermen), begrensd op ±1
  function tanh(x) {
    if (x > 4.97) return 1;
    if (x < -4.97) return -1;
    const x2 = x * x;
    const r = x * (135135 + x2 * (17325 + x2 * (378 + x2))) /
      (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
    return r > 1 ? 1 : r < -1 ? -1 : r;
  }

  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

  G.M = { sin, cos, tanh, len3, PI, TWO_PI };
})((globalThis.GROW = globalThis.GROW || {}));
