// =============================================================
//  tracks.js — zelf parcoursen bouwen uit onderdelen
// =============================================================
//
//  Een parcours = een lijst onderdelen ("segmenten"), van start tot finish:
//
//   start  flat     gap   ramp      stairs   hurdle  sweeper   finish
//   ●━━━━━━━━━━━┓     ┏━━━━━╱‾‾‾‾‾‾‾┌┘‾‾‾‾‾‾‾‾‾‾┃‾‾‾‾‾‾‾[⇆]‾‾‾‾‾🏁
//
//  Elk onderdeel heeft een paar instellingen (lengte, hoogte…). Na elk
//  obstakel komt een checkpoint. Het curriculum-level (0..1) schaalt alle
//  hoogtes/breedtes: op level 0 is alles vlak.
//
//  Het originele parcours ("Classic") wordt nog steeds door parkour.js
//  gebouwd, zodat oude wezens exact hetzelfde blijven lopen.
GROW_MODULE(function (G) {
  'use strict';

  // Soorten onderdelen + hun instellingen (voor de editor)
  const SEGMENTS = {
    flat: { label: 'Flat', params: { len: { label: 'Length', min: 1, max: 12, step: 0.5, def: 4 } } },
    gap: { label: 'Gap', params: { len: { label: 'Width', min: 0.3, max: 2, step: 0.1, def: 0.8 } } },
    ramp: {
      label: 'Ramp', params: {
        len: { label: 'Length', min: 2, max: 10, step: 0.5, def: 4 },
        rise: { label: 'Height (− = down)', min: -1.5, max: 1.5, step: 0.1, def: 0.8 }
      }
    },
    stairs: {
      label: 'Stairs', params: {
        steps: { label: 'Steps', min: 2, max: 10, step: 1, def: 4 },
        stepLen: { label: 'Step length', min: 0.5, max: 2, step: 0.1, def: 1.0 },
        stepH: { label: 'Step height (− = down)', min: -0.4, max: 0.4, step: 0.02, def: 0.15 }
      }
    },
    hurdle: {
      label: 'Hurdle', params: {
        h: { label: 'Height', min: 0.1, max: 0.8, step: 0.05, def: 0.3 },
        thick: { label: 'Thickness', min: 0.1, max: 1, step: 0.05, def: 0.4 }
      }
    },
    step: { label: 'Step (wall)', params: { h: { label: 'Height (− = down)', min: -1, max: 1, step: 0.05, def: 0.4 } } },
    sweeper: {
      label: 'Sweeper ⇆', params: {
        len: { label: 'Length', min: 2, max: 8, step: 0.5, def: 3 },
        h: { label: 'Height', min: 0.2, max: 1, step: 0.05, def: 0.45 },
        speed: { label: 'Speed', min: 0.2, max: 3, step: 0.1, def: 1.2 }
      }
    },
    bumps: {
      label: 'Bumps', params: {
        len: { label: 'Length', min: 2, max: 10, step: 0.5, def: 4 },
        n: { label: 'Count', min: 2, max: 12, step: 1, def: 6 },
        h: { label: 'Height', min: 0.05, max: 0.4, step: 0.05, def: 0.15 }
      }
    }
  };

  const seg = (type, p = {}) => {
    const s = { type };
    for (const [k, spec] of Object.entries(SEGMENTS[type].params)) s[k] = p[k] !== undefined ? p[k] : spec.def;
    return s;
  };

  // Het originele parcours, als onderdelen (om het in de editor aan te passen)
  const CLASSIC_SEGMENTS = [
    seg('flat', { len: 8 }), seg('gap', { len: 0.8 }), seg('flat', { len: 4.2 }),
    seg('ramp', { len: 4, rise: 0.8 }), seg('flat', { len: 2 }),
    seg('hurdle', { h: 0.3, thick: 0.4 }), seg('flat', { len: 1.1 }),
    seg('step', { h: 0.5 }), seg('flat', { len: 6 })
  ];

  // Uitdagingen (vaste parcoursen met een eigen ranglijst)
  const CHALLENGES = [
    { id: 'classic', name: 'Classic', classic: true, desc: 'The original course' },
    {
      id: 'gaps', name: 'Gap Jumper', desc: 'Three gaps, each one wider',
      segments: [seg('flat', { len: 8 }), seg('gap', { len: 0.7 }), seg('flat', { len: 4 }),
        seg('gap', { len: 0.9 }), seg('flat', { len: 4 }), seg('gap', { len: 1.1 }), seg('flat', { len: 5 })]
    },
    {
      id: 'stairs', name: 'Staircase', desc: 'Up the stairs and down again',
      segments: [seg('flat', { len: 6 }), seg('stairs', { steps: 5, stepLen: 1.1, stepH: 0.14 }),
        seg('flat', { len: 3 }), seg('stairs', { steps: 5, stepLen: 1.1, stepH: -0.14 }), seg('flat', { len: 5 })]
    },
    {
      id: 'hurdles', name: 'Hurdle Run', desc: 'Four hurdles in a row',
      segments: [seg('flat', { len: 6 }), seg('hurdle', { h: 0.2 }), seg('flat', { len: 2 }), seg('hurdle', { h: 0.25 }),
        seg('flat', { len: 2 }), seg('hurdle', { h: 0.3 }), seg('flat', { len: 2 }), seg('hurdle', { h: 0.35 }), seg('flat', { len: 4 })]
    },
    {
      id: 'sweepers', name: 'Sweeper Alley', desc: 'Dodge (or push past) the moving blocks',
      segments: [seg('flat', { len: 6 }), seg('sweeper', { len: 3, speed: 1.0 }), seg('flat', { len: 2 }),
        seg('sweeper', { len: 3, speed: 1.6 }), seg('flat', { len: 5 })]
    },
    {
      id: 'hills', name: 'Bumpy Hills', desc: 'Bumps, a hill up and a hill down',
      segments: [seg('flat', { len: 5 }), seg('bumps', { len: 4, n: 6, h: 0.12 }), seg('ramp', { len: 5, rise: 1.0 }),
        seg('flat', { len: 2 }), seg('ramp', { len: 5, rise: -1.0 }), seg('bumps', { len: 4, n: 8, h: 0.18 }), seg('flat', { len: 4 })]
    }
  ];

  // ---------------------------------------------------------------
  //  Bouw de colliders voor een parcours (def = { name, segments })
  // ---------------------------------------------------------------
  function buildCustomTrack(def, cfg, level = 1) {
    const W = cfg.parkour.halfWidth, RH = 0.5, RT = 0.15;
    const colliders = [], checkpoints = [];
    let x = 0, y = 0, minY = 0;
    const add = o => colliders.push(new G.Collider(o));
    const box = (x0, x1, y0, y1, kind, friction, z0 = -W, z1 = W, extra = {}) => add({
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2,
      hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2, kind, friction, ...extra
    });
    const rails = (x0, x1, top) => {
      box(x0, x1, top - 0.2, top + RH, 'rail', 0.3, -W - RT, -W);
      box(x0, x1, top - 0.2, top + RH, 'rail', 0.3, W, W + RT);
    };
    const ground = (x0, x1, top) => {
      if (x1 - x0 < 1e-6) return;
      box(x0, x1, top - 1.2, top, 'ground');
      rails(x0, x1, top);
      minY = Math.min(minY, top);
    };
    // gedraaide doos van (x0,y0) naar (x1,y1); c/s exact uit de richting (geen Math.cos)
    const slab = (x0, y0, x1, y1, t, kind, z0, z1) => {
      const L = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      const c = (x1 - x0) / L, s = (y1 - y0) / L;
      add({
        cx: (x0 + x1) / 2 + s * t / 2, cy: (y0 + y1) / 2 - c * t / 2, cz: (z0 + z1) / 2,
        hx: L / 2, hy: t / 2, hz: (z1 - z0) / 2, c, s, kind, friction: kind === 'rail' ? 0.3 : undefined
      });
    };
    const cp = label => checkpoints.push({ x: x + 0.1, label });

    box(-4.5, -4, -1, 1.5, 'wall', 0.3, -W - RT, W + RT); // achtermuur
    ground(-4, 0, 0);                                     // stukje achter de startlijn

    for (const sg of def.segments || []) {
      const s = { ...seg(sg.type), ...sg };
      if (s.type === 'flat') {
        ground(x, x + s.len, y); x += s.len;
      } else if (s.type === 'gap') {
        const w = s.len * level;
        if (w > 0.01) box(x - 0.5, x + w + 0.5, y - 4, y - 3, 'pit');
        x += w; cp('Gap');
      } else if (s.type === 'ramp') {
        const rise = s.rise * level, y1 = y + rise;
        if (Math.abs(rise) < 1e-6) ground(x, x + s.len, y);
        else {
          slab(x, y, x + s.len, y1, 0.3, 'ramp', -W, W);
          box(x, x + s.len, Math.min(y, y1) - 1.2, Math.min(y, y1), 'ground'); // vulling eronder
          slab(x, y + RH, x + s.len, y1 + RH, RH + 0.2, 'rail', -W - RT, -W);
          slab(x, y + RH, x + s.len, y1 + RH, RH + 0.2, 'rail', W, W + RT);
          minY = Math.min(minY, y1);
        }
        x += s.len; y = y1; cp(rise >= 0 ? 'Ramp' : 'Downhill');
      } else if (s.type === 'stairs') {
        for (let i = 0; i < s.steps; i++) {
          y += s.stepH * level;
          ground(x, x + s.stepLen, y); x += s.stepLen;
        }
        cp('Stairs');
      } else if (s.type === 'hurdle') {
        const before = 0.75, len = before * 2 + s.thick, h = s.h * level;
        ground(x, x + len, y);
        if (h > 0.01) box(x + before, x + before + s.thick, y, y + h, 'block');
        x += len; cp('Hurdle');
      } else if (s.type === 'step') {
        y += s.h * level; cp(s.h >= 0 ? 'Step' : 'Drop');
      } else if (s.type === 'sweeper') {
        ground(x, x + s.len, y);
        const h = s.h * level;
        if (h > 0.01) {
          const hz = 0.8;
          box(x + s.len / 2 - 0.3, x + s.len / 2 + 0.3, y, y + h, 'mover', 0.3, -hz, hz,
            { motion: { amp: W - hz - 0.1, speed: s.speed, phase: (x * 1.7) % 6.283 } });
        }
        x += s.len; cp('Sweeper');
      } else if (s.type === 'bumps') {
        ground(x, x + s.len, y);
        const h = s.h * level;
        if (h > 0.005) {
          for (let i = 0; i < s.n; i++) {
            const bx = x + ((i + 0.5) / s.n) * s.len;
            box(bx - 0.12, bx + 0.12, y, y + h, 'block');
          }
        }
        x += s.len; cp('Bumps');
      }
    }
    const finishX = x;
    ground(x, x + 6, y);                                          // uitloop na de finish
    box(x + 6, x + 6.5, y - 1, y + 1.5, 'wall', 0.3, -W - RT, W + RT);
    // laatste checkpoint valt samen met de finish → weghalen
    const cps = checkpoints.filter(c => c.x < finishX - 0.2);

    return {
      level, colliders, checkpoints: cps, finishX, start: [0, 0, 0], halfWidth: W,
      length: x + 6.5, deathY: minY - 1, maxTime: Math.max(cfg.episode.maxTime, finishX * 1.1),
      custom: true,
      heightAt(px, pz) {
        let h = -Infinity;
        for (const c of colliders) {
          if (c.kind !== 'ground' && c.kind !== 'ramp' && c.kind !== 'block') continue;
          const t = c.topAt(px, pz);
          if (t > h) h = t;
        }
        return h;
      }
    };
  }

  G.TRACK_SEGMENTS = SEGMENTS;
  G.makeSegment = seg;
  G.CLASSIC_SEGMENTS = CLASSIC_SEGMENTS;
  G.CHALLENGES = CHALLENGES;
  G.buildCustomTrack = buildCustomTrack;
});
