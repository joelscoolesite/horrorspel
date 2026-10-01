// =============================================================
//  gallery.js — je eigen verzameling wezens
// =============================================================
//  Bewaard in deze browser (localStorage): naam, plaatje, score, het
//  DNA en op welk parcours/level hij getraind is. Per wezen kun je:
//    ▶ kijken · 🧬 verder trainen · ✏ bewerken in de bouw-modus
//    ⬇ downloaden als JSON · 🗑 weggooien
(function (G) {
  'use strict';
  const KEY = 'growbot.gallery.v1', MAX = 40;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class Gallery {
    constructor(app) {
      this.app = app; // { el, view, toast, sound, champion(), watch(item), train(item), edit(item), close() }
      this.el = app.el;
      try { this.items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { this.items = []; }
    }

    _store() {
      try { localStorage.setItem(KEY, JSON.stringify(this.items)); return true; } catch (_) {
        this.app.toast('Browser storage is full: delete a few creatures first');
        return false;
      }
    }

    saveChampion(name) {
      const ch = this.app.champion();
      if (!ch) return this.app.toast('No champion yet: train first (or load an example)');
      if (this.items.length >= MAX) return this.app.toast(`Gallery is full (max ${MAX})`);
      const item = {
        id: Date.now().toString(36),
        name: (name || `Creature ${this.items.length + 1}`).slice(0, 30),
        date: new Date().toISOString().slice(0, 10),
        thumb: this.app.view.snapshot(160, 100),
        genome: G.Genome.clone(ch.genome),
        level: ch.level !== undefined ? ch.level : 1,
        track: ch.track || null,
        fitness: ch.fitness,
        dist: ch.stats.maxX,
        finishRate: ch.stats.finishRate || 0
      };
      this.items.unshift(item);
      if (!this._store()) { this.items.shift(); return; }
      this.app.sound.ui('add');
      this.app.toast(`Saved "${item.name}" to your gallery`);
      this.render();
    }

    remove(id) {
      this.items = this.items.filter(i => i.id !== id);
      this._store();
      this.app.sound.ui('delete');
      this.render();
    }

    download(item) {
      const data = { name: item.name, genome: item.genome, level: item.level, track: item.track, fitness: item.fitness };
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${item.name.replace(/[^\w-]+/g, '_') || 'creature'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    render() {
      const cards = this.items.map(it => `
        <div class="gcard" data-id="${esc(it.id)}">
          <img src="${it.thumb || ''}" alt="">
          <div class="gname">${esc(it.name)}</div>
          <div class="gmeta">${it.dist.toFixed(1)} m${it.finishRate ? ` · 🏁${Math.round(it.finishRate * 100)}%` : ''} · ${it.genome.nodes.length} spheres</div>
          <div class="gmeta">${esc(it.track ? it.track.name : 'Classic')} · ${esc(it.date)}</div>
          <div class="gbtns">
            <button class="mini" data-act="watch" title="Watch">▶</button>
            <button class="mini" data-act="train" title="Train further">🧬</button>
            <button class="mini" data-act="edit" title="Edit body">✏</button>
            <button class="mini" data-act="dl" title="Download JSON">⬇</button>
            <button class="mini" data-act="del" title="Delete">🗑</button>
          </div>
        </div>`).join('');
      this.el.innerHTML = `
        <h1>Your <span>gallery</span></h1>
        <div class="sub">Creatures you saved in this browser.</div>
        <label class="pp">Name <input type="text" id="gName" maxlength="30" placeholder="e.g. Speedy Spider"></label>
        <div class="row"><button id="gSave" class="primary grow">💾 Save current champion</button></div>
        <div class="gallery">${cards || '<div class="hint">Nothing saved yet.</div>'}</div>
        <div class="row" style="margin-top:12px"><button id="gClose" class="grow">← Back</button></div>`;
      this.el.querySelector('#gSave').onclick = () => this.saveChampion(this.el.querySelector('#gName').value.trim());
      this.el.querySelector('#gClose').onclick = () => this.app.close();
      this.el.querySelectorAll('.gcard').forEach(card => {
        const item = this.items.find(i => i.id === card.dataset.id);
        card.querySelectorAll('[data-act]').forEach(b => {
          b.onclick = () => {
            const act = b.dataset.act;
            if (act === 'watch') this.app.watch(item);
            else if (act === 'train') this.app.train(item);
            else if (act === 'edit') this.app.edit(item);
            else if (act === 'dl') this.download(item);
            else if (act === 'del') this.remove(item.id);
          };
        });
      });
    }
  }

  G.Gallery = Gallery;
})((globalThis.GROW = globalThis.GROW || {}));
