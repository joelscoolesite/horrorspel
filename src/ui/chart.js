// =============================================================
//  chart.js — simpele lijngrafiek van de fitness per generatie
// =============================================================
(function (G) {
  'use strict';

  function drawChart(canvas, history) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const col = name => css.getPropertyValue(name).trim();

    const pad = { l: 34, r: 8, t: 8, b: 18 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = col('--muted');

    if (history.length < 2) {
      ctx.fillText('Chart appears after 2 generations…', pad.l, pad.t + ph / 2);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const p of history) { lo = Math.min(lo, p.avg, p.champ); hi = Math.max(hi, p.champ, p.best); }
    lo = Math.min(0, lo); if (hi - lo < 1) hi = lo + 1;
    hi += (hi - lo) * 0.08; // beetje ruimte boven de lijn
    const X = i => pad.l + (i / (history.length - 1)) * pw;
    const Y = v => pad.t + ph - ((v - lo) / (hi - lo)) * ph;

    // rasterlijnen
    ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (k / 4) * (hi - lo), y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(0), 4, y + 3);
    }
    ctx.fillText(`gen ${history[0].gen}`, pad.l, h - 4);
    const last = `gen ${history[history.length - 1].gen}`;
    ctx.fillText(last, w - pad.r - ctx.measureText(last).width, h - 4);

    const line = (key, color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath();
      history.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p[key])) : ctx.moveTo(X(i), Y(p[key]))));
      ctx.stroke();
    };
    line('avg', col('--series-2'), 1.5);
    line('champ', col('--series-1'), 2);
  }

  G.drawChart = drawChart;
})((globalThis.GROW = globalThis.GROW || {}));
