// =============================================================
//  courses.js — parcours-editor, uitdagingen en ranglijst
// =============================================================
//
//   ┌ Challenges ───────────────┐   ┌ Editor ────────────────────┐
//   │ Classic       🏆 12.3 s   │   │ 1. Flat     length ▬▬▬○    │
//   │ Gap Jumper    🏆 —        │   │ 2. Gap      width  ▬○▬▬    │
//   │ [Train] [Test] [Edit]     │   │ 3. Ramp ... [↑][↓][✕]      │
//   └───────────────────────────┘   │ + Add [Stairs ▾]           │
//                                   └────────────────────────────┘
//  "Test champion" laat de kampioen één keer vanaf de standaardstart
//  lopen (eerlijk: voor iedereen dezelfde start) en zet het resultaat
//  in de ranglijst van dat parcours (opgeslagen in deze browser).
(function (G) {
  'use strict';
  const COURSES_KEY = 'growbot.courses.v1', BOARD_KEY = 'growbot.leaderboard.v1';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class CoursePanel {
    constructor(app) {
      this.app = app; // { cfg, view, evo(), champion(), showCourse(def), trainOn(def), toast, sound, el }
      this.el = app.el;
      this.myCourses = load(COURSES_KEY, []);
      this.board = load(BOARD_KEY, {});
      this.selected = 'classic';
      this.draft = { name: 'My course', segments: G.CLASSIC_SEGMENTS.map(s => ({ ...s })) };
      this.render();
    }

    // alle parcoursen: uitdagingen + eigen
    all() {
      return G.CHALLENGES.concat(this.myCourses.map(c => ({ ...c, mine: true })));
    }
    find(id) { return this.all().find(c => c.id === id); }
    defOf(c) { return c.classic ? null : { name: c.name, segments: c.segments }; }

    // ---------- ranglijst ----------
    best(id) {
      const list = this.board[id] || [];
      return list[0] || null;
    }
    static fmt(r) { return r.finished ? `🏁 ${r.time.toFixed(1)} s` : `${r.dist.toFixed(1)} m`; }
    static better(a, b) { // sorteren: finish eerst (snelste), dan verste afstand
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return a.finished ? a.time - b.time : b.dist - a.dist;
    }

    // Kampioen 1× laten lopen op dit parcours (standaardstart, volle moeilijkheid)
    testChampion(id) {
      const ch = this.app.champion();
      if (!ch) return this.app.toast('No champion yet: train first (or load an example)');
      const c = this.find(id), cfg = this.app.cfg;
      const saved = cfg.track;
      cfg.track = this.defOf(c);
      const track = G.buildParkour(cfg, 1);
      cfg.track = saved;
      const ep = new G.Episode(G.Genome.clone(ch.genome), track, cfg, G.NOMINAL);
      while (!ep.run(20000));
      const name = (document.getElementById('cName').value || 'My creature').slice(0, 24);
      const entry = {
        name, finished: ep.finished, time: ep.finishTime, dist: ep.maxX,
        date: new Date().toISOString().slice(0, 10), genome: G.Genome.clone(ch.genome)
      };
      const list = (this.board[id] || []).concat([entry]).sort(CoursePanel.better).slice(0, 10);
      this.board[id] = list;
      if (!save(BOARD_KEY, this.board)) this.app.toast('Could not save the leaderboard (browser storage full?)');
      const rank = list.indexOf(entry) + 1;
      this.app.toast(`${name} on ${c.name}: ${CoursePanel.fmt(entry)}` + (rank ? ` · rank #${rank}` : ' · not in top 10'));
      if (ep.finished) this.app.sound.finish();
      this.selected = id;
      this.app.watch(entry.genome, this.defOf(c));
      this.render();
    }

    // ---------- editor ----------
    editCopy(id) {
      const c = this.find(id);
      this.draft = {
        name: c.mine ? c.name : `${c.name} (copy)`,
        segments: (c.classic ? G.CLASSIC_SEGMENTS : c.segments).map(s => ({ ...s })),
        id: c.mine ? c.id : undefined
      };
      this.previewDraft();
      this.render();
    }

    previewDraft() { this.app.showCourse({ name: this.draft.name, segments: this.draft.segments }); }

    saveDraft() {
      const d = this.draft;
      if (!d.segments.length) return this.app.toast('Add at least one part');
      const id = d.id || 'my-' + Date.now().toString(36);
      const course = { id, name: (d.name || 'My course').slice(0, 30), desc: `${d.segments.length} parts`, segments: d.segments.map(s => ({ ...s })) };
      const i = this.myCourses.findIndex(c => c.id === id);
      if (i >= 0) this.myCourses[i] = course; else this.myCourses.push(course);
      d.id = id;
      save(COURSES_KEY, this.myCourses);
      this.selected = id;
      this.app.sound.ui('add');
      this.app.toast(`Saved course "${course.name}"`);
      this.render();
    }

    deleteCourse(id) {
      this.myCourses = this.myCourses.filter(c => c.id !== id);
      delete this.board[id];
      save(COURSES_KEY, this.myCourses);
      save(BOARD_KEY, this.board);
      if (this.selected === id) this.selected = 'classic';
      this.app.sound.ui('delete');
      this.render();
    }

    // ---------- tekenen ----------
    render() {
      const sel = this.find(this.selected) || G.CHALLENGES[0];
      const list = this.all().map(c => {
        const b = this.best(c.id);
        return `<div class="course ${c.id === sel.id ? 'sel' : ''}" data-id="${esc(c.id)}">
          <div class="cname">${c.mine ? '✏ ' : ''}${esc(c.name)}<span class="cbest">${b ? '🏆 ' + CoursePanel.fmt(b) : ''}</span></div>
          <div class="cdesc">${esc(c.desc || '')}</div>
        </div>`;
      }).join('');
      const board = (this.board[sel.id] || []).map((r, i) =>
        `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${CoursePanel.fmt(r)}</td><td class="muted">${esc(r.date)}</td>
         <td><button class="mini" data-watch="${i}" title="Watch this run">▶</button></td></tr>`).join('');

      const segRows = this.draft.segments.map((s, i) => {
        const spec = G.TRACK_SEGMENTS[s.type];
        const params = Object.entries(spec.params).map(([k, p]) =>
          `<label class="pp">${esc(p.label)} <output>${s[k]}</output>
            <input type="range" data-seg="${i}" data-key="${k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${s[k]}"></label>`).join('');
        return `<div class="seg"><div class="seghead"><b>${i + 1}. ${esc(spec.label)}</b>
          <span><button class="mini" data-up="${i}">↑</button><button class="mini" data-down="${i}">↓</button><button class="mini" data-del="${i}">✕</button></span></div>${params}</div>`;
      }).join('');
      const typeOpts = Object.entries(G.TRACK_SEGMENTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');

      this.el.innerHTML = `
        <h1>Courses <span>&amp; challenges</span></h1>
        <div class="sub">Pick a course to train on, test your champion, or build your own.</div>
        <div class="courses">${list}</div>
        <div class="row" style="margin-top:8px">
          <button id="cTrain" class="primary grow">▶ Train here</button>
          <button id="cTest" title="Run the champion once from the standard start">⏱ Test champion</button>
        </div>
        <div class="row" style="margin-top:6px">
          <button id="cView">👁 Preview</button>
          <button id="cEdit">✏ Edit ${sel.mine ? '' : 'a copy'}</button>
          ${sel.mine ? '<button id="cDel">🗑 Delete</button>' : ''}
        </div>
        <label class="pp" style="margin-top:8px">Creature name for the leaderboard
          <input type="text" id="cName" maxlength="24" value="${esc(this.creatureName || 'My creature')}"></label>
        <h2>Leaderboard · ${esc(sel.name)}</h2>
        ${board ? `<table class="board"><tr><th>#</th><th>Creature</th><th>Result</th><th>Date</th><th></th></tr>${board}</table>`
          : '<div class="hint">No results yet. Press ⏱ Test champion.</div>'}

        <h2>Course editor</h2>
        <label class="pp">Name <input type="text" id="dName" maxlength="30" value="${esc(this.draft.name)}"></label>
        <div class="segs">${segRows || '<div class="hint">No parts yet.</div>'}</div>
        <div class="row" style="margin-top:6px">
          <select id="dType" class="grow">${typeOpts}</select>
          <button id="dAdd">＋ Add part</button>
        </div>
        <div class="row" style="margin-top:6px">
          <button id="dPreview">👁 Preview</button>
          <button id="dSave" class="grow">💾 Save course</button>
        </div>
        <div class="row" style="margin-top:12px"><button id="cClose" class="grow">← Back</button></div>`;
      this._wire(sel);
    }

    _wire(sel) {
      const $ = id => this.el.querySelector('#' + id);
      this.el.querySelectorAll('.course').forEach(div => {
        div.onclick = () => { this.selected = div.dataset.id; this.app.sound.ui('select'); this.render(); };
      });
      $('cName').oninput = e => { this.creatureName = e.target.value; };
      $('cTrain').onclick = () => this.app.trainOn(this.defOf(sel), sel.name);
      $('cTest').onclick = () => this.testChampion(sel.id);
      $('cView').onclick = () => this.app.showCourse(this.defOf(sel));
      $('cEdit').onclick = () => this.editCopy(sel.id);
      if ($('cDel')) $('cDel').onclick = () => this.deleteCourse(sel.id);
      $('cClose').onclick = () => this.app.close();
      this.el.querySelectorAll('[data-watch]').forEach(b => {
        b.onclick = () => this.app.watch(this.board[sel.id][+b.dataset.watch].genome, this.defOf(sel));
      });
      // editor
      $('dName').oninput = e => { this.draft.name = e.target.value; };
      this.el.querySelectorAll('input[data-seg]').forEach(inp => {
        inp.oninput = () => {
          this.draft.segments[+inp.dataset.seg][inp.dataset.key] = +inp.value;
          inp.previousElementSibling.textContent = inp.value;
          clearTimeout(this._pt);
          this._pt = setTimeout(() => this.previewDraft(), 120); // live voorbeeld
        };
      });
      const move = (i, d) => {
        const S = this.draft.segments, j = i + d;
        if (j < 0 || j >= S.length) return;
        [S[i], S[j]] = [S[j], S[i]];
        this.previewDraft(); this.render();
      };
      this.el.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => move(+b.dataset.up, -1); });
      this.el.querySelectorAll('[data-down]').forEach(b => { b.onclick = () => move(+b.dataset.down, 1); });
      this.el.querySelectorAll('[data-del]').forEach(b => {
        b.onclick = () => { this.draft.segments.splice(+b.dataset.del, 1); this.app.sound.ui('delete'); this.previewDraft(); this.render(); };
      });
      $('dAdd').onclick = () => {
        if (this.draft.segments.length >= 24) return this.app.toast('Max 24 parts');
        this.draft.segments.push(G.makeSegment($('dType').value));
        this.app.sound.ui('add');
        this.previewDraft(); this.render();
      };
      $('dPreview').onclick = () => this.previewDraft();
      $('dSave').onclick = () => this.saveDraft();
    }
  }

  G.CoursePanel = CoursePanel;
})((globalThis.GROW = globalThis.GROW || {}));
