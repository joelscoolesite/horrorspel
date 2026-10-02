// =============================================================
//  failchart.js — "Waarom faalt hij?"
// =============================================================
//
//  De kampioen wordt op 8–10 starts getest. Voor elke testrun tekenen we
//  waar hij eindigde, op een zijaanzicht van het parcours:
//
//     ▲ hoogte                         🔴 = viel in een gat
//     │        ●●●     ●               🟠 = liep vast
//     │   ____ ┃  ┃___╱‾‾‾‾‾‾‾‾‾‾🏁    ⚪ = tijd op
//     │__╱    ┗━━┛                     🟢 = finish
//     └────────────────────────▶ x
//
//  Plus een zin als: "Valt meestal in de Gap (5 van de 10 runs)".
(function (G) {
  'use strict';

  const REASON = {
    'gevallen': { label: 'fell', color: '#ff7b72' },
    'vastgelopen': { label: 'got stuck', color: '#ffb347' },
    'tijd op': { label: 'ran out of time', color: '#8b93a1' },
    'finish!': { label: 'finished', color: '#7ee787' },
    'instabiel': { label: 'became unstable', color: '#d946ef' }
  };
  const CP_NAMES = { Spleet: 'Gap', Helling: 'Ramp', Horde: 'Hurdle', Trede: 'Step' };

  // Bij welk obstakel hield hij op? Vastgelopen: het eerstvolgende obstakel.
  // Gevallen: het dichtstbijzijnde (vaak net over een gat en teruggegleden).
  function obstacleAt(track, x, reason) {
    if (reason === 'gevallen' && track.checkpoints.length) {
      const near = track.checkpoints.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
      if (Math.abs(near.x - x) < 2.5) return 'the ' + (CP_NAMES[near.label] || near.label);
    }
    const cp = track.checkpoints.find(c => c.x > x);
    if (!cp) return x >= track.finishX ? 'the finish' : 'the last stretch';
    return 'the ' + (CP_NAMES[cp.label] || cp.label);
  }

  function summary(track, runs) {
    if (!runs || !runs.length) return '';
    const fin = runs.filter(r => r.finished).length;
    const fails = runs.filter(r => !r.finished);
    if (!fails.length) return `Finishes in all ${runs.length} test runs! 🏁`;
    // meest voorkomende combinatie (reden + obstakel)
    const count = new Map();
    for (const r of fails) {
      const key = `${(REASON[r.reason] || { label: r.reason }).label} at ${obstacleAt(track, r.maxX, r.reason)}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
    const [what, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return `Most common problem: ${what} (${n} of ${runs.length} runs)` + (fin ? ` · finishes ${fin}×` : '');
  }

  function drawFailChart(canvas, track, champion) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim();
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    if (!champion || !champion.stats || !champion.stats.runs) {
      ctx.fillStyle = muted;
      ctx.fillText('Appears once there is a champion…', 8, h / 2);
      return;
    }
    // zijaanzicht van het parcours (hoogte langs x)
    const x0 = -1, x1 = track.finishX + 2, pad = 6;
    const xs = [], ys = [];
    for (let x = x0; x <= x1; x += 0.1) { xs.push(x); ys.push(track.heightAt(x, 0)); }
    const finite = ys.filter(Number.isFinite);
    const lo = Math.min(...finite) - 0.6, hi = Math.max(...finite) + 1.2;
    const X = x => pad + ((x - x0) / (x1 - x0)) * (w - 2 * pad);
    const Y = y => h - 14 - ((y - lo) / (hi - lo)) * (h - 22);
    ctx.fillStyle = '#2a313d';
    ctx.beginPath();
    let open = false;
    xs.forEach((x, i) => {
      const y = ys[i];
      if (!Number.isFinite(y)) { if (open) { ctx.lineTo(X(x), h); ctx.closePath(); ctx.fill(); ctx.beginPath(); open = false; } return; }
      if (!open) { ctx.moveTo(X(x), h); open = true; }
      ctx.lineTo(X(x), Y(y));
    });
    if (open) { ctx.lineTo(X(x1), h); ctx.closePath(); ctx.fill(); }
    // checkpoints + finish
    ctx.strokeStyle = '#5ad1c8'; ctx.globalAlpha = 0.5;
    for (const c of track.checkpoints) { ctx.beginPath(); ctx.moveTo(X(c.x), 4); ctx.lineTo(X(c.x), h - 12); ctx.stroke(); }
    ctx.strokeStyle = '#7ee787'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(X(track.finishX), 4); ctx.lineTo(X(track.finishX), h - 12); ctx.stroke();
    ctx.globalAlpha = 1;
    // één stip per testrun op zijn verste punt; gestapeld als ze dicht bij elkaar liggen
    const stack = new Map();
    for (const r of champion.stats.runs) {
      const x = Math.min(r.maxX, track.finishX);
      const bucket = Math.round(X(x) / 7);
      const k = stack.get(bucket) || 0;
      stack.set(bucket, k + 1);
      const gy = track.heightAt(x, 0);
      const base = Number.isFinite(gy) ? Y(gy) : h - 14;
      ctx.fillStyle = (REASON[r.reason] || { color: '#fff' }).color;
      ctx.beginPath();
      ctx.arc(X(x), base - 6 - k * 7, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = muted;
    ctx.fillText('start', X(0) - 8, h - 2);
    ctx.fillText('finish', X(track.finishX) - 14, h - 2);
  }

  G.drawFailChart = drawFailChart;
  G.failSummary = summary;
  G.FAIL_REASONS = REASON;
})((globalThis.GROW = globalThis.GROW || {}));
