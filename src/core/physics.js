// =============================================================
//  physics.js — mini fysica-engine (Verlet + Position Based Dynamics)
// =============================================================
//
//  Waarom een eigen engine i.p.v. Rapier/Cannon?
//   - Volledig deterministisch (zelfde genoom = zelfde score)
//   - Supersnel voor bollen + stokjes (duizenden simulaties per minuut)
//   - Alles is leesbaar: je ziet precies wat zwaartekracht/wrijving doen
//
//  Model:
//    Bol (node)    = puntmassa met straal  → botst met de omgeving
//    Stokje (stick) = afstandsbeperking tussen 2 bollen
//                     bot   = stijve vaste lengte
//                     spier = lengte die de AI elke stap verandert
//
//    ┌──────────── één stap ────────────┐
//    │ 1. Verlet: x += (x - x_oud) + g·dt² │
//    │ 2. herhaal N keer:                 │
//    │      a. stokjes op lengte duwen    │
//    │      b. bollen uit muren duwen     │
//    │ 3. wrijving (Coulomb) bij contact  │
//    └────────────────────────────────────┘
GROW_MODULE(function (G) {
  'use strict';
  const clamp = G.clamp;

  // -----------------------------------------------------------
  // Collider: een (gedraaide) doos. angle = rotatie om de z-as
  // (zo maken we hellingen).
  // -----------------------------------------------------------
  class Collider {
    constructor(o) {
      this.cx = o.cx; this.cy = o.cy; this.cz = o.cz || 0;
      this.hx = o.hx; this.hy = o.hy; this.hz = o.hz;        // halve afmetingen
      // rotatie om de z-as als (cos, sin) — exact meegegeven, niet via
      // Math.cos/sin (die kunnen per browser 1 bit verschillen)
      this.c = o.c !== undefined ? o.c : 1;
      this.s = o.s !== undefined ? o.s : 0;
      this.angle = Math.atan2(this.s, this.c); // alleen voor de weergave
      this.kind = o.kind || 'ground';
      this.friction = o.friction !== undefined ? o.friction : 0.85;
      // omhullende doos in wereld-coördinaten → snel "kan niet raken" testen
      this.ex = Math.abs(this.c) * this.hx + Math.abs(this.s) * this.hy;
      this.ey = Math.abs(this.s) * this.hx + Math.abs(this.c) * this.hy;
      // bewegend obstakel? schuift heen en weer langs z: cz + amp·sin(speed·t + phase)
      this.motion = o.motion || null;
    }

    // Waar staat het (bewegende) obstakel op tijdstip t?
    czAt(t) {
      const m = this.motion;
      return m ? this.cz + m.amp * G.M.sin(m.speed * t + m.phase) : this.cz;
    }

    // Is bol n binnen (r + marge) van de omhullende doos?
    near(n, margin, t) {
      const m = n.r + margin + (this.motion ? 0.2 : 0);
      const cz = this.motion ? this.czAt(t) : this.cz;
      return Math.abs(n.x - this.cx) <= this.ex + m && Math.abs(n.y - this.cy) <= this.ey + m &&
        Math.abs(n.z - cz) <= this.hz + m;
    }

    // Duwt bol n uit de doos. Geeft true terug bij contact.
    // t = tijd in deze wereld (alleen nodig voor bewegende obstakels)
    collide(n, t) {
      const cz = this.motion ? this.czAt(t) : this.cz;
      const dx = n.x - this.cx, dy = n.y - this.cy, dz = n.z - cz;
      const r = n.r;
      if (dx > this.ex + r || dx < -this.ex - r || dy > this.ey + r || dy < -this.ey - r ||
          dz > this.hz + r || dz < -this.hz - r) return false;

      // naar lokale (ongedraaide) coördinaten
      const c = this.c, s = this.s;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c, lz = dz;
      const hx = this.hx, hy = this.hy, hz = this.hz;

      // dichtstbijzijnde punt op de doos
      const qx = clamp(lx, -hx, hx), qy = clamp(ly, -hy, hy), qz = clamp(lz, -hz, hz);
      const ex = lx - qx, ey = ly - qy, ez = lz - qz;
      const d2 = ex * ex + ey * ey + ez * ez;
      let nx, ny, nz, pen;

      if (d2 > 1e-12) {
        if (d2 >= r * r) return false;
        const d = Math.sqrt(d2);
        nx = ex / d; ny = ey / d; nz = ez / d; pen = r - d;
      } else {
        // middelpunt zit ín de doos → kortste weg naar buiten
        const px = hx - Math.abs(lx), py = hy - Math.abs(ly), pz = hz - Math.abs(lz);
        nx = ny = nz = 0;
        if (px < py && px < pz) { nx = lx < 0 ? -1 : 1; pen = px + r; }
        else if (py < pz)       { ny = ly < 0 ? -1 : 1; pen = py + r; }
        else                    { nz = lz < 0 ? -1 : 1; pen = pz + r; }
      }

      // normaal terug naar wereld-coördinaten
      const wx = nx * c - ny * s, wy = nx * s + ny * c, wz = nz;
      n.x += wx * pen; n.y += wy * pen; n.z += wz * pen;
      n.contact = 1; n.nx = wx; n.ny = wy; n.nz = wz; n.fr = this.friction;
      n.pen += pen; // hoe hard duwt de grond terug? (≈ normaalkracht)
      return true;
    }

    // Hoogte van de bovenkant op (x, z), of -Infinity als we er niet boven zijn.
    // (Gebruikt door de "ogen" van het organisme.)
    topAt(x, z) {
      if (Math.abs(z - this.cz) > this.hz) return -Infinity;
      const lx = (x - this.cx + this.hy * this.s) / this.c;
      if (Math.abs(lx) > this.hx) return -Infinity;
      return this.cy + lx * this.s + this.hy * this.c;
    }
  }

  // -----------------------------------------------------------
  // World: alle bollen + stokjes + omgeving
  // -----------------------------------------------------------
  class World {
    constructor(colliders, params) {
      this.colliders = colliders;
      this.p = params;
      this.nodes = [];
      this.sticks = [];
      this.time = 0; // eigen klok: bewegende obstakels hangen hiervan af
    }

    addNode(x, y, z, r, mass) {
      this.nodes.push({
        x, y, z, ox: x, oy: y, oz: z, r, w: 1 / mass,
        active: true, contact: 0, nx: 0, ny: 1, nz: 0, fr: 0, pen: 0
      });
      return this.nodes.length - 1;
    }

    addStick(a, b, len, k) {
      this.sticks.push({ a, b, len, k, active: true });
      return this.sticks.length - 1;
    }

    step(dt) {
      const t = (this.time += dt);
      const p = this.p, N = this.nodes, S = this.sticks, C = this.colliders;
      const g = p.gravity * dt * dt, damp = p.damping;
      const vmax = p.maxSpeed * dt, vmax2 = vmax * vmax;

      // 1. Verlet-integratie (snelheid zit impliciet in x - x_oud)
      for (let i = 0; i < N.length; i++) {
        const n = N[i];
        if (!n.active) continue;
        let vx = (n.x - n.ox) * damp, vy = (n.y - n.oy) * damp, vz = (n.z - n.oz) * damp;
        const v2 = vx * vx + vy * vy + vz * vz;
        if (v2 > vmax2) { const k = vmax / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
        n.ox = n.x; n.oy = n.y; n.oz = n.z;
        n.x += vx; n.y += vy + g; n.z += vz;
        n.contact = 0; n.pen = 0;
        // "broad phase": onthoud alleen de dozen in de buurt van deze bol
        const near = n.near || (n.near = []);
        near.length = 0;
        for (let c = 0; c < C.length; c++) if (C[c].near(n, 0.3, t)) near.push(C[c]);
      }

      // 2. Constraints oplossen (Gauss-Seidel)
      for (let it = 0; it < p.iterations; it++) {
        for (let j = 0; j < S.length; j++) {
          const s = S[j];
          if (!s.active) continue;
          const a = N[s.a], b = N[s.b];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          const wsum = a.w + b.w;
          const f = ((d - s.len) / (d * wsum)) * s.k;
          a.x += dx * f * a.w; a.y += dy * f * a.w; a.z += dz * f * a.w;
          b.x -= dx * f * b.w; b.y -= dy * f * b.w; b.z -= dz * f * b.w;
        }
        for (let i = 0; i < N.length; i++) {
          const n = N[i];
          if (!n.active) continue;
          const near = n.near;
          for (let c = 0; c < near.length; c++) near[c].collide(n, t);
        }
      }

      // 3. Coulomb-wrijving: grip = µ × normaalkracht.
      //    Hoe harder de grond terugduwt (pen), hoe meer zijwaartse
      //    beweging de wrijving mag tegenhouden. Klein genoeg → plakt
      //    (statische wrijving), anders glijdt hij (kinetische wrijving).
      for (let i = 0; i < N.length; i++) {
        const n = N[i];
        if (!n.active || !n.contact) continue;
        const dx = n.x - n.ox, dy = n.y - n.oy, dz = n.z - n.oz;
        const dn = dx * n.nx + dy * n.ny + dz * n.nz;
        const tx = dx - dn * n.nx, ty = dy - dn * n.ny, tz = dz - dn * n.nz;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl < 1e-12) continue;
        const k = Math.min(1, (n.fr * n.pen) / tl);
        n.x -= tx * k; n.y -= ty * k; n.z -= tz * k;
      }
    }
  }

  G.Collider = Collider;
  G.World = World;
});
