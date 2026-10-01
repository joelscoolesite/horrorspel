// =============================================================
//  main.js — bediening: training + replay + knoppen
// =============================================================
//
//  Elke frame (≈60× per seconde):
//    1. Training: verdeel taken over de Web Workers (alle CPU-kernen),
//       of — als dat niet kan — reken ~10 ms op de hoofd-thread
//    2. Replay: laat de huidige kampioen in real-time zien
//    3. Teken de 3D-scène en werk de cijfers bij
(function (G) {
  'use strict';
  const cfg = G.CONFIG;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'growbot.champion.v1';

  // Rekenen op alle CPU-kernen (één kern blijft over voor het tekenen)
  const cores = navigator.hardwareConcurrency || 2;
  const pool = G.WorkerPool.create(Math.max(1, Math.min(12, cores - 1)));
  if (pool) {
    $('lblTurbo').hidden = true; // niet nodig: de workers rekenen al op volle snelheid
    $('kEps').textContent = `Evaluations/s (${pool.size} CPU core${pool.size > 1 ? 's' : ''})`;
  }

  const sound = new G.Sound();

  let evo = newEvolution();
  const view = new G.SceneView($('viewport'));
  view.buildTrack(evo.track);

  function newEvolution(opts) {
    const e = new G.Evolution(cfg, (Math.random() * 1e9) | 0, opts);
    if (pool) e.setPool(pool);
    return e;
  }

  let training = false;
  let turbo = false;
  let speed = 1;
  let replay = null;
  let replayGenome = null;
  let replayVersion = -1;
  let replayWait = 0;
  let acc = 0;

  // ---------------- replay ----------------
  function startReplay(genome) {
    if (view.trackLevel !== evo.track.level) view.buildTrack(evo.track); // level veranderd?
    replayGenome = genome;
    replay = new G.Episode(genome, evo.track, cfg);
    view.setCreature(genome);
    view.resetCamera(0);
    replayWait = 0;
    acc = 0;
  }

  // Begin met één enkele bol — zo begint elk leven
  startReplay(G.Genome.root(cfg));

  // ---------------- checkpoints-chips ----------------
  const CP_NAMES = { Spleet: 'Gap', Helling: 'Ramp', Horde: 'Hurdle', Trede: 'Step' };
  const cpEls = evo.track.checkpoints.map(c => CP_NAMES[c.label] || c.label).concat(['Finish']).map(label => {
    const el = document.createElement('span');
    el.className = 'cp';
    el.textContent = label;
    $('cps').appendChild(el);
    return el;
  });

  // ---------------- sliders ----------------
  const sliders = [
    { label: 'Growth cost per sphere', obj: cfg.fitness, key: 'nodeCost', min: 0, max: 1, step: 0.01, rescore: true },
    { label: 'Growth cost per stick', obj: cfg.fitness, key: 'stickCost', min: 0, max: 0.5, step: 0.01, rescore: true },
    { label: 'Energy cost', obj: cfg.fitness, key: 'energyCost', min: 0, max: 0.05, step: 0.001, rescore: true },
    { label: 'Checkpoint bonus', obj: cfg.fitness, key: 'checkpointBonus', min: 0, max: 10, step: 0.5, rescore: true },
    { label: 'Grow-sphere mutation rate', obj: cfg.evo.mut, key: 'addNode', min: 0, max: 0.4, step: 0.01 },
    { label: 'Min spheres (bigger = less boring)', obj: cfg.body, key: 'minNodes', min: 1, max: 12, step: 1 },
    { label: 'Max spheres (hard cap)', obj: cfg.body, key: 'maxNodes', min: 2, max: 24, step: 1 },
    { label: 'Population size', obj: cfg.evo, key: 'popSize', min: 10, max: 200, step: 5 }
  ];
  for (const s of sliders) {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    const id = 'sl_' + s.key;
    wrap.innerHTML = `<label for="${id}">${s.label}</label><output></output>
      <input type="range" id="${id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.obj[s.key]}">`;
    const input = wrap.querySelector('input'), out = wrap.querySelector('output');
    const show = () => { out.textContent = (+input.value).toString(); };
    input.addEventListener('input', () => {
      s.obj[s.key] = +input.value;
      show();
      if (s.rescore) evo.rescore();
    });
    show();
    $('sliders').appendChild(wrap);
  }

  // ---------------- knoppen ----------------
  function setTraining(on) {
    training = on;
    $('btnTrain').textContent = on ? '❚❚ Pause training' : '▶ Start training';
  }
  $('btnTrain').onclick = () => setTraining(!training);
  const showSound = () => { $('btnSound').textContent = sound.enabled ? '🔊' : '🔇'; };
  $('btnSound').onclick = () => { sound.unlock(); sound.setEnabled(!sound.enabled); showSound(); };
  $('slVolume').value = sound.volume;
  $('slVolume').oninput = e => { sound.setVolume(+e.target.value); if (!sound.enabled) { sound.setEnabled(true); showSound(); } };
  showSound();
  $('chkTurbo').onchange = e => { turbo = e.target.checked; };
  $('chkCurriculum').checked = !!cfg.evo.curriculum;
  $('chkCurriculum').onchange = e => {
    cfg.evo.curriculum = e.target.checked ? 1 : 0;
    if (!e.target.checked) { evo.setLevel(1); toast('Full course from now on'); }
    else toast('Curriculum on: press Reset to start again from an easy course');
  };
  $('chkFollow').onchange = e => { view.follow = e.target.checked; };
  $('selSpeed').onchange = e => { speed = +e.target.value; };
  $('btnReplay').onclick = () => replayGenome && startReplay(replayGenome);

  $('btnReset').onclick = () => {
    cfg.evo.lockBody = 0; // weer gewone evolutie (ook het lichaam)
    evo = newEvolution();
    replayVersion = -1;
    lastLevel = evo.level;
    startReplay(G.Genome.root(cfg));
    drawChart();
    toast('New random population');
  };

  $('btnSave').onclick = () => {
    const data = evo.champion || (replayGenome && { genome: replayGenome });
    if (!data) return toast('Nothing to save yet');
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `growbot-gen${evo.generation}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('fileLoad').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      adoptGenome(data.genome || data, file.name, data.level);
    } catch (err) {
      toast('Could not read that file: ' + err.message);
    }
  };

  // Elke klik: volgend voorbeeld (champions/example.js)
  let exampleIdx = 0;
  $('btnExample').onclick = () => {
    const list = G.EXAMPLES || [];
    if (!list.length) return toast('No example champion bundled');
    const ex = list[exampleIdx++ % list.length];
    adoptGenome(G.Genome.clone(ex.genome), `example ${(exampleIdx - 1) % list.length + 1}/${list.length} (${ex.name})`, ex.level);
  };

  $('btnRestore').onclick = () => {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) { /* opslag geblokkeerd */ }
    if (!raw) return toast('No saved champion in this browser');
    const data = JSON.parse(raw);
    adoptGenome(data.genome, 'last session', data.level);
  };

  // Geladen genoom: meten, in de populatie zetten, en laten zien.
  // level = het parcours-level waarop hij getraind is (oudere bestanden: volledig)
  function adoptGenome(genome, name, level = 1) {
    if (!genome || !Array.isArray(genome.nodes) || !Array.isArray(genome.sticks)) {
      return toast('That file is not a GrowBot genome');
    }
    G.Genome.normalize(genome);
    if (level > evo.level) evo.setLevel(level);
    const { stats, fitness } = evo.evaluate(genome);
    evo.inject(genome);
    if (!evo.champion || fitness > evo.champion.fitness) {
      evo.champion = { genome: G.Genome.clone(genome), fitness, stats, generation: evo.generation, level: evo.level };
      evo.championVersion++;
      replayVersion = evo.championVersion;
    }
    startReplay(G.Genome.clone(genome));
    toast(`Loaded ${name}: ${stats.maxX.toFixed(1)} m, fitness ${fitness.toFixed(1)}`);
  }

  function saveChampion() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(evo.champion)); } catch (_) { /* geen opslag */ }
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------------- bouw-modus ----------------
  const editor = new G.Editor(view, cfg, {
    toast: msg => { sound.ui('error'); toast(msg); },
    sound: kind => sound.ui(kind),
    onChange: info => {
      $('bInfo').textContent = info.text;
      $('bProblem').textContent = info.problem;
      $('btnTrainDesign').disabled = !!info.problem;
    }
  });
  let wasTraining = false;
  function setBuildMode(on) {
    $('buildPanel').hidden = !on;
    $('mainPanel').hidden = on;
    $('hud').hidden = on;
    if (on) {
      wasTraining = training;
      setTraining(false);
      editor.open();
    } else {
      editor.close();
      view.follow = $('chkFollow').checked;
      setTraining(wasTraining);
    }
  }
  $('btnBuild').onclick = () => setBuildMode(true);
  $('btnCancelBuild').onclick = () => setBuildMode(false);
  $('btnPreset').onclick = () => {
    const name = $('selPreset').value;
    if (name === 'current') {
      const d = G.Genome.toDesign(replayGenome, [0, cfg.body.rootRadius + 0.01, 0]);
      const lift = Math.max(0, -Math.min(...d.nodes.map(n => n.y - n.r))); // niets onder de grond
      for (const n of d.nodes) n.y += lift;
      editor.open(d);
    } else editor.loadPreset(name);
  };
  $('btnBigger').onclick = () => editor.resizeSelected(0.02);
  $('btnSmaller').onclick = () => editor.resizeSelected(-0.02);
  $('btnDelete').onclick = () => editor.deleteSelected();
  $('btnLink').onclick = () => {
    editor.linkMode = !editor.linkMode;
    $('btnLink').classList.toggle('on', editor.linkMode);
  };
  $('btnTrainDesign').onclick = () => {
    const res = editor.toGenome(new G.RNG((Math.random() * 1e9) | 0));
    if (res.error) return toast(res.error);
    const evolveBody = $('chkEvolveBody').checked;
    cfg.evo.lockBody = evolveBody ? 0 : 1;
    evo = newEvolution({ seedGenome: res.genome });
    replayVersion = -1;
    lastLevel = evo.level;
    wasTraining = true;
    setBuildMode(false);
    startReplay(G.Genome.clone(res.genome));
    drawChart();
    toast(evolveBody ? 'Training your creature (body may evolve too)' : 'Training a brain for your creature');
  };

  // ---------------- UI bijwerken ----------------
  const REASONS = { 'gevallen': 'fell into a gap', 'finish!': '🏁 finished!', 'vastgelopen': 'stuck',
    'tijd op': 'time is up', 'instabiel': 'unstable' };
  function describeBody(g) {
    const muscles = g.sticks.filter(s => s.m).length;
    const weak = g.sticks.filter(s => s.k !== undefined && s.k < 0.3).length;
    return `${g.nodes.length} spheres · ${g.sticks.length} sticks (${muscles} muscles` +
      (weak ? `, ${weak} still weak)` : ')');
  }

  function drawChart() { G.drawChart($('chart'), evo.history); }

  let evalCounter = { t: performance.now(), n: 0, rate: 0 };
  function updatePanel() {
    $('sGen').textContent = evo.generation;
    $('evalBar').style.width = (evo.progress * 100).toFixed(1) + '%';
    const now = performance.now();
    if (now - evalCounter.t > 1000) {
      evalCounter.rate = ((evo.evaluations - evalCounter.n) * 1000) / (now - evalCounter.t);
      evalCounter = { t: now, n: evo.evaluations, rate: evalCounter.rate };
      $('sEps').textContent = training ? Math.max(0, evalCounter.rate).toFixed(0) : '0';
    }
    const c = evo.champion;
    if (c) {
      $('sFit').textContent = c.fitness.toFixed(1);
      $('sDist').textContent = c.stats.maxX.toFixed(1) + ' m' +
        (c.stats.finishRate > 0 ? ` · 🏁${(c.stats.finishRate * 100).toFixed(0)}%` : '');
      $('sBody').textContent = describeBody(c.genome);
      $('sChampGen').textContent = c.generation;
    }
    const h = evo.history[evo.history.length - 1];
    if (h) $('sSpecies').textContent = h.species;
    $('sLevel').textContent = evo.level >= 1 ? 'full' : `${Math.round(evo.level * 100)}%`;
  }

  function updateHud() {
    if (!replay) return;
    const growing = replay.t < replay.growEnd;
    const grown = replay.world.nodes.filter(n => n.active).length;
    let state;
    if (replay.done) state = REASONS[replay.reason] || replay.reason;
    else if (growing) state = `growing… ${grown}/${replay.genome.nodes.length} spheres`;
    else if (replay.genome.sticks.length === 0) state = 'one sphere (needs to grow!)';
    else state = 'moving';
    $('hState').textContent = state;
    $('hDist').textContent = replay.maxX.toFixed(2) + ' m';
    $('hTime').textContent = `t = ${Math.max(0, replay.t - replay.growEnd).toFixed(1)} s`;
    $('hStep').textContent = replay.sensors[0].toFixed(1);
    $('hGap').textContent = replay.sensors[1] ? 'YES' : 'no';
    $('hSide').textContent = replay.sensors[2].toFixed(1);
    const reached = replay.startX + replay.maxX;
    evo.track.checkpoints.forEach((c, i) => cpEls[i].classList.toggle('done', reached >= c.x));
    cpEls[cpEls.length - 1].classList.toggle('done', replay.finished);
  }

  // ---------------- geluid bij de replay ----------------
  // Eén simulatiestap + kijken wat er gebeurde: botsing, groei, checkpoint…
  const vyBefore = [];
  function stepReplayWithSound() {
    const W = replay.world, dt = cfg.physics.dt;
    const wasContact = W.nodes.map(n => n.contact);
    for (let i = 0; i < W.nodes.length; i++) vyBefore[i] = (W.nodes[i].y - W.nodes[i].oy) / dt;
    const grown = replay.nextGrow, cpsBefore = replayCps(), wasDone = replay.done;
    replay.step();
    // botsing: bol had geen contact en nu wel → tik, harder bij hogere snelheid
    // (bij 10×/20× snelheid alleen de flinke klappen, anders wordt het herrie)
    const minHit = speed > 4 ? 2.5 : speed > 1 ? 1.2 : 0.4;
    for (let i = 0; i < W.nodes.length; i++) {
      const n = W.nodes[i];
      if (n.active && n.contact && !wasContact[i] && -vyBefore[i] > minHit) sound.impact(-vyBefore[i], n.r);
    }
    if (replay.nextGrow > grown) sound.grow(replay.nextGrow - 1);
    const cps = replayCps();
    if (cps > cpsBefore) sound.checkpoint(cps - 1);
    if (replay.done && !wasDone) {
      if (replay.finished) sound.finish();
      else if (replay.dead) sound.fall();
      else if (replay.reason === 'vastgelopen') sound.stuck();
    }
  }
  function replayCps() {
    const x = replay.startX + replay.maxX;
    return evo.track.checkpoints.filter(c => x >= c.x).length;
  }

  // ---------------- hoofd-lus ----------------
  let last = performance.now(), frameNo = 0, lastLevel = evo.level;
  function frame(now) {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // 1. training
    if (training && !editor.active && evo.pump(pool ? 2 : turbo ? 40 : 10)) {
      drawChart();
      if (evo.championVersion !== replayVersion) {
        replayVersion = evo.championVersion;
        saveChampion();
        startReplay(G.Genome.clone(evo.champion.genome));
        if (lastLevel !== evo.level) sound.levelUp(); else sound.champion();
        toast(lastLevel !== evo.level ? `Course level up → ${Math.round(evo.level * 100)}%`
          : `New champion! fitness ${evo.champion.fitness.toFixed(1)}`);
        lastLevel = evo.level;
      }
    }

    // 2. replay (vaste tijdstap → zelfde resultaat als tijdens training)
    if (replay) {
      if (!replay.done) {
        acc += realDt * speed;
        const dt = cfg.physics.dt;
        let n = 0;
        while (acc >= dt && n < 400) { stepReplayWithSound(); acc -= dt; n++; }
      } else if ((replayWait += realDt) > 2) {
        startReplay(replayGenome);
      }
      view.update(replay);
    }

    // 3. tekenen
    view.render();
    if (frameNo++ % 6 === 0) { updatePanel(); updateHud(); }
    requestAnimationFrame(frame);
  }
  drawChart();
  requestAnimationFrame(frame);

  // voor in de browser-console: GROW.app.evo enz.
  G.app = { get evo() { return evo; }, view, sound, startReplay, replayEpisode: () => replay };
})((globalThis.GROW = globalThis.GROW || {}));
