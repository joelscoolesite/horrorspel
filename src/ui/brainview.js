// =============================================================
//  brainview.js — kijk live in het brein van één spier
// =============================================================
//
//   ingangen            verborgen (geheugen)        spier
//   clock sin ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
//   ground A  ●──────────── (h1) ━━━━━━━━━━━━━━━━━━━━━━● samentrekken/uitrekken
//   gap ahead ●━━━━━━━━━━━━ (h2) ───────────────────────┛
//
//   • bolletje licht op = grote waarde (oranje +, blauw −)
//   • lijn: oranje = positief gewicht, blauw = negatief, dik = sterk
(function (G) {
  'use strict';
  const LABELS = ['clock sin', 'clock cos', 'ground A', 'ground B', 'step ahead', 'gap ahead',
    'tilt', 'direction', 'side', 'bias', 'neighbours'];

  const pos = '255,179,71', neg = '91,141,239';
  const col = (v, a = 1) => `rgba(${v >= 0 ? pos : neg},${a})`;

  // Welke spier beweegt nu het meest? (handig als je niets kiest)
  function mostActive(ep) {
    let best = -1, bv = -1;
    ep.sticks.forEach((st, k) => {
      if (!st.muscle || !st.lastX) return;
      const v = Math.abs(st.act);
      if (v > bv) { bv = v; best = k; }
    });
    return best;
  }

  function drawBrain(canvas, ep, k) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const st = ep && ep.sticks[k];
    if (!st || !st.muscle || !st.lastX) {
      ctx.fillStyle = muted;
      ctx.fillText(st && !st.muscle ? 'This stick is a bone: no brain.' : 'Brain appears once the creature moves…', 8, h / 2);
      return;
    }
    const x = st.lastX, hid = st.h, hs = st.hs;
    const inX = 70, hidX = Math.round(w * 0.6), outX = w - 22;
    const rowY = i => 10 + i * ((h - 20) / (LABELS.length - 1));
    const hidY = j => h / 2 + (j - (hid.length - 1) / 2) * 34;
    const outY = h / 2;

    // lijnen: ingang → spier (direct) en ingang → verborgen → spier
    const line = (x1, y1, x2, y2, wgt) => {
      const a = Math.min(1, Math.abs(wgt) / 2);
      if (a < 0.03) return;
      ctx.strokeStyle = col(wgt, 0.15 + 0.6 * a);
      ctx.lineWidth = 0.5 + 2.5 * a;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    for (let i = 0; i < 11; i++) line(inX, rowY(i), outX, outY, st.w[i]);
    hid.forEach((n, j) => {
      for (let i = 0; i < 11; i++) line(inX, rowY(i), hidX, hidY(j), n.i[i]);
      line(hidX, hidY(j), outX, outY, n.o);
    });

    // knopen
    const dot = (cx, cy, r, v) => {
      ctx.fillStyle = '#181c23';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col(v, Math.min(1, 0.15 + Math.abs(v)));
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3b4452'; ctx.lineWidth = 1; ctx.stroke();
    };
    LABELS.forEach((lab, i) => {
      dot(inX, rowY(i), 4.5, x[i]);
      ctx.fillStyle = muted; ctx.textAlign = 'right';
      ctx.fillText(lab, inX - 8, rowY(i) + 3);
    });
    ctx.textAlign = 'center';
    hid.forEach((n, j) => {
      dot(hidX, hidY(j), 9, hs[j]);
      // geheugen-lusje
      if (Math.abs(n.r) > 0.05) {
        ctx.strokeStyle = col(n.r, 0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(hidX, hidY(j) - 12, 5, 0.3, Math.PI * 2 - 0.3); ctx.stroke();
      }
    });
    if (!hid.length) {
      ctx.fillStyle = muted;
      ctx.fillText('no hidden neurons (yet)', hidX, h - 4);
    }
    dot(outX, outY, 12, st.act);
    ctx.fillStyle = muted;
    ctx.fillText(st.act >= 0 ? 'stretch' : 'pull', outX, outY + 24);
    ctx.textAlign = 'left';
  }

  G.drawBrain = drawBrain;
  G.brainMostActive = mostActive;
})((globalThis.GROW = globalThis.GROW || {}));
