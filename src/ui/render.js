// =============================================================
//  render.js — 3D-weergave met Three.js
// =============================================================
// De fysica weet niets van graphics. Deze file "kijkt" alleen naar
// de posities in de World en tekent bollen/stokjes op die plekken.
(function (G) {
  'use strict';
  const T = globalThis.THREE;

  const COLORS = {
    ground: 0x3a4250, ramp: 0x4a5568, block: 0xc0563a, rail: 0x2b313b, wall: 0x2b313b, pit: 0x14161b,
    root: 0xffb347, node: 0x5ad1c8, bone: 0xe8e4da,
    muscleA: new T.Color(0x3b82f6), muscleB: new T.Color(0xef4444)
  };

  class SceneView {
    constructor(container) {
      this.container = container;
      const r = (this.renderer = new T.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      container.appendChild(r.domElement);

      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color(0x0e1116);
      scene.fog = new T.Fog(0x0e1116, 18, 45);

      this.camera = new T.PerspectiveCamera(50, 1, 0.05, 200);
      this.camera.position.set(-3, 3.5, 7);
      this.controls = new T.OrbitControls(this.camera, r.domElement);
      this.controls.enableDamping = true;
      this.controls.target.set(0, 0.5, 0);
      this.follow = true;

      scene.add(new T.HemisphereLight(0xbfd4ff, 0x20242c, 0.75));
      const sun = (this.sun = new T.DirectionalLight(0xffffff, 0.9));
      sun.position.set(-4, 10, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 30;
      scene.add(sun, sun.target);

      this.sphereGeo = new T.SphereGeometry(1, 24, 16);
      this.cylGeo = new T.CylinderGeometry(1, 1, 1, 10, 1);
      this.creature = new T.Group();
      scene.add(this.creature);
      this.nodeMeshes = [];
      this.stickMeshes = [];
      this._tmpA = new T.Vector3(); this._tmpB = new T.Vector3();
      this._up = new T.Vector3(0, 1, 0);

      window.addEventListener('resize', () => this.resize());
      this.resize();
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }

    // (Her)bouw de baan. Wordt opnieuw aangeroepen als het curriculum-level verandert.
    buildTrack(track) {
      if (this.trackGroup) {
        this.scene.remove(this.trackGroup);
        this.trackGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      }
      const group = (this.trackGroup = new T.Group());
      this.scene.add(group);
      this.trackLevel = track.level;
      for (const c of track.colliders) {
        const geo = new T.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2);
        const mat = new T.MeshStandardMaterial({ color: COLORS[c.kind] || COLORS.ground, roughness: 0.9 });
        const m = new T.Mesh(geo, mat);
        m.position.set(c.cx, c.cy, c.cz);
        m.rotation.z = c.angle;
        m.receiveShadow = true;
        m.castShadow = c.kind === 'block' || c.kind === 'rail';
        group.add(m);
      }
      // Rand-lijntjes op de grond: geven gevoel van snelheid/afstand
      const lineMat = new T.LineBasicMaterial({ color: 0x566070 });
      for (let x = -4; x <= 32; x += 1) {
        const y = track.heightAt(x, 0);
        if (y === -Infinity) continue;
        const g = new T.BufferGeometry().setFromPoints([
          new T.Vector3(x, y + 0.002, -track.halfWidth), new T.Vector3(x, y + 0.002, track.halfWidth)]);
        group.add(new T.Line(g, lineMat));
      }
      // Checkpoint-poortjes + finish
      const gates = track.checkpoints.map(c => ({ x: c.x, color: 0x5ad1c8 }))
        .concat([{ x: track.finishX, color: 0x7ee787, finish: true }]);
      for (const gt of gates) {
        const y = track.heightAt(gt.x, 0);
        const mat = new T.MeshStandardMaterial({ color: gt.color, emissive: gt.color, emissiveIntensity: 0.35 });
        const H = gt.finish ? 2.6 : 1.8, Wd = track.halfWidth;
        for (const z of [-Wd, Wd]) {
          const post = new T.Mesh(new T.BoxGeometry(0.06, H, 0.06), mat);
          post.position.set(gt.x, y + H / 2, z);
          group.add(post);
        }
        const bar = new T.Mesh(new T.BoxGeometry(0.06, 0.06, Wd * 2), mat);
        bar.position.set(gt.x, y + H, 0);
        group.add(bar);
        if (gt.finish) {
          const flag = new T.Mesh(new T.PlaneGeometry(0.02, 1), mat);
          flag.position.set(gt.x, y + H - 0.3, 0);
          group.add(flag);
        }
      }
    }

    // Maak meshes voor een (nieuw) genoom
    setCreature(genome) {
      for (const m of this.nodeMeshes.concat(this.stickMeshes)) {
        this.creature.remove(m);
        m.material.dispose();
      }
      this.nodeMeshes = genome.nodes.map((n, i) => {
        const isRoot = i === 0;
        const mat = new T.MeshStandardMaterial({
          color: isRoot ? COLORS.root : COLORS.node, roughness: 0.35, metalness: 0.1,
          emissive: isRoot ? COLORS.root : COLORS.node, emissiveIntensity: isRoot ? 0.25 : 0.08
        });
        const m = new T.Mesh(this.sphereGeo, mat);
        m.castShadow = true;
        m.userData.r = n.r;
        this.creature.add(m);
        return m;
      });
      this.stickMeshes = genome.sticks.map(s => {
        const mat = new T.MeshStandardMaterial({ color: s.m ? 0xef4444 : COLORS.bone, roughness: 0.5 });
        const m = new T.Mesh(this.cylGeo, mat);
        m.castShadow = true;
        m.userData.muscle = s.m;
        m.userData.k = s.k === undefined ? 1 : s.k; // zwak stokje = dun
        this.creature.add(m);
        return m;
      });
    }

    update(ep) {
      const W = ep.world;
      for (let i = 0; i < this.nodeMeshes.length; i++) {
        const m = this.nodeMeshes[i], n = W.nodes[i];
        m.visible = n.active;
        if (!n.active) continue;
        // "plop"-animatie bij het groeien
        const age = ep.t - ep.nodeBorn[i];
        const s = n.r * Math.min(1, 0.3 + age * 4);
        m.scale.set(s, s, s);
        m.position.set(n.x, n.y, n.z);
      }
      for (let k = 0; k < this.stickMeshes.length; k++) {
        const m = this.stickMeshes[k], ws = W.sticks[k];
        m.visible = ws.active;
        if (!ws.active) continue;
        const a = W.nodes[ws.a], b = W.nodes[ws.b];
        const A = this._tmpA.set(a.x, a.y, a.z), B = this._tmpB.set(b.x, b.y, b.z);
        const len = A.distanceTo(B);
        m.position.copy(A).add(B).multiplyScalar(0.5);
        B.sub(A).divideScalar(len || 1);
        m.quaternion.setFromUnitVectors(this._up, B);
        const st = ep.sticks[k];
        const thick = (m.userData.muscle ? 0.045 : 0.035) * (0.25 + 0.75 * m.userData.k);
        m.scale.set(thick, len, thick);
        if (m.userData.muscle) {
          // blauw = samengetrokken, rood = uitgerekt
          m.material.color.copy(COLORS.muscleA).lerp(COLORS.muscleB, (st.act + 1) / 2);
        }
      }

      // camera volgt de hoofdbol
      const root = W.nodes[0];
      if (this.follow && Number.isFinite(root.x)) {
        const tgt = this.controls.target;
        const dx = (root.x - tgt.x) * 0.06, dy = (root.y + 0.3 - tgt.y) * 0.06, dz = (root.z - tgt.z) * 0.06;
        tgt.x += dx; tgt.y += dy; tgt.z += dz;
        this.camera.position.x += dx; this.camera.position.y += dy; this.camera.position.z += dz;
        this.sun.position.set(tgt.x - 4, tgt.y + 10, tgt.z + 6);
        this.sun.target.position.copy(tgt);
      }
    }

    resetCamera(x = 0) {
      this.controls.target.set(x, 0.5, 0);
      this.camera.position.set(x - 3, 3.5, 7);
    }

    render() {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  G.SceneView = SceneView;
})((globalThis.GROW = globalThis.GROW || {}));
