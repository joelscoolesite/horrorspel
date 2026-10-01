"""Genoom → MuJoCo-model (MJCF, een XML-bestand).

Vertaling van de JS-versie naar MuJoCo:

    JS (Verlet/PBD)                 MuJoCo
    ─────────────────────────────   ─────────────────────────────────────
    bol (node)                      <body> met <freejoint> + <geom sphere>
    bot  (stijf stokje)             <spatial tendon> met een sterke veer
    spier (stokje met brein)        <spatial tendon> + <position> actuator
                                    die de gewenste lengte instelt
    parcours (dozen)                <geom type="box"> (helling = gedraaid)

Assen: in de JS-versie is y omhoog. MuJoCo gebruikt z omhoog. We draaien
alles 90° om de x-as:  (x, y, z)_js  →  (x, −z, y)_mujoco.

Verschil met de browser: hier is het wezen meteen volgroeid (geen
groeifase) en is de physics anders (echte stijve lichamen en contacten),
dus een browser-kampioen loopt hier niet precies hetzelfde. Daarom train
je hier opnieuw (train_es.py of train_ppo.py).
"""
import math
from dataclasses import dataclass, field

from .genome import blueprint

# Instellingen (zelfde betekenis als in src/core/config.js)
ROOT_RADIUS = 0.3
MUSCLE_AMP = 0.35          # spier ±35% korter/langer
HALF_WIDTH = 3.0           # baan 6 m breed
FINISH_X = 28.0
CHECKPOINTS = [(8.9, "Gap"), (17.0, "Ramp"), (19.5, "Hurdle"), (22.3, "Step")]


def to_mj(x, y, z):
    """JS-coördinaten (y omhoog) → MuJoCo (z omhoog)."""
    return (x, -z, y)


@dataclass
class TrackBox:
    x0: float
    x1: float
    y0: float
    y1: float
    z0: float = -HALF_WIDTH
    z1: float = HALF_WIDTH
    kind: str = "ground"
    angle: float = 0.0       # rotatie om de JS-z-as (helling)
    center: tuple = None     # alleen bij gedraaide dozen


def classic_track(gap=0.8, ramp_h=0.8, hurdle_h=0.3, step_h=0.5):
    """Het originele parcours, met dezelfde maten als src/core/parkour.js."""
    W, RH, RT = HALF_WIDTH, 0.5, 0.15
    boxes = []

    def box(x0, x1, y0, y1, kind="ground", z0=-W, z1=W):
        boxes.append(TrackBox(x0, x1, y0, y1, z0, z1, kind))

    def rails(x0, x1, top):
        box(x0, x1, top - 0.2, top + RH, "rail", -W - RT, -W)
        box(x0, x1, top - 0.2, top + RH, "rail", W, W + RT)

    def ramp(x0, y0, x1, y1, t, kind, z0, z1):
        L = math.hypot(x1 - x0, y1 - y0)
        c, s = (x1 - x0) / L, (y1 - y0) / L
        cx, cy = (x0 + x1) / 2 + s * t / 2, (y0 + y1) / 2 - c * t / 2
        b = TrackBox(cx - L / 2, cx + L / 2, cy - t / 2, cy + t / 2, z0, z1, kind,
                     angle=math.atan2(s, c), center=(cx, cy, (z0 + z1) / 2))
        boxes.append(b)

    gap_end = 8 + gap
    step_top = ramp_h + step_h
    box(-4.5, -4, -1, 1.5, "wall", -W - RT, W + RT)
    box(-4, 8, -1, 0); rails(-4, 8, 0)
    if gap > 0:
        box(7.5, gap_end + 0.5, -4, -3, "pit")
    box(gap_end, 17, -1, 0); rails(gap_end, 13, 0)
    ramp(13, 0, 17, ramp_h, 0.3, "ramp", -W, W)
    ramp(13, RH, 17, ramp_h + RH, RH + 0.2, "rail", -W - RT, -W)
    ramp(13, RH, 17, ramp_h + RH, RH + 0.2, "rail", W, W + RT)
    box(17, 22, -1, ramp_h); rails(17, 22, ramp_h)
    if hurdle_h > 0:
        box(19, 19.4, ramp_h, ramp_h + hurdle_h, "block")
    box(22, 32, -1, step_top); rails(22, 32, step_top)
    box(32, 32.5, step_top, step_top + 1.3, "wall", -W - RT, W + RT)
    return boxes


def height_at(boxes, x):
    """Hoogte van de grond op positie x (JS-y), of -inf boven een gat."""
    h = -math.inf
    for b in boxes:
        if b.kind not in ("ground", "ramp", "block"):
            continue
        if b.angle == 0.0:
            if b.x0 <= x <= b.x1:
                h = max(h, b.y1)
        else:
            cx, cy, _ = b.center
            c, s = math.cos(b.angle), math.sin(b.angle)
            hx, hy = (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2
            lx = (x - cx + hy * s) / c
            if abs(lx) <= hx:
                h = max(h, cy + lx * s + hy * c)
    return h


COLORS = {"ground": "0.23 0.26 0.31 1", "ramp": "0.29 0.33 0.4 1", "block": "0.75 0.34 0.23 1",
          "rail": "0.17 0.19 0.23 1", "wall": "0.17 0.19 0.23 1", "pit": "0.08 0.09 0.11 1"}


@dataclass
class ModelInfo:
    """Wat de omgeving moet weten over het gebouwde model."""
    n_nodes: int
    muscles: list = field(default_factory=list)   # [(tendon-index, rustlengte)]
    rest: list = field(default_factory=list)      # rustlengte per stokje
    boxes: list = field(default_factory=list)
    lift: float = 0.0


def build_mjcf(genome, boxes=None, timestep=0.002):
    """Maak een MJCF-string van een genoom. Geeft (xml, ModelInfo) terug."""
    boxes = boxes if boxes is not None else classic_track()
    nodes, sticks = genome["nodes"], genome["sticks"]
    bp = blueprint(genome)
    # optillen zodat de laagste bol net boven de grond begint
    lowest = min(p[1] - n["r"] for p, n in zip(bp, nodes))
    lift = -lowest + 0.02

    geoms = []
    for i, b in enumerate(boxes):
        if b.angle == 0.0:
            c = to_mj((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2)
            orient = ""
        else:
            c = to_mj(*b.center)
            # rotatie om JS-z = rotatie om MuJoCo −y
            orient = f' axisangle="0 -1 0 {b.angle:.6f}"'
        size = ((b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2, (b.y1 - b.y0) / 2)
        geoms.append(
            f'    <geom name="track{i}" type="box" pos="{c[0]:.4f} {c[1]:.4f} {c[2]:.4f}" '
            f'size="{size[0]:.4f} {size[1]:.4f} {size[2]:.4f}"{orient} rgba="{COLORS.get(b.kind, COLORS["ground"])}" '
            f'contype="1" conaffinity="2"/>')

    bodies = []
    for i, (n, p) in enumerate(zip(nodes, bp)):
        x, y, z = to_mj(p[0], p[1] + lift, p[2])
        mass = 0.5 * (n["r"] / 0.15) ** 2
        rgba = "1 0.7 0.28 1" if i == 0 else "0.35 0.82 0.78 1"
        bodies.append(
            f'    <body name="n{i}" pos="{x:.4f} {y:.4f} {z:.4f}">\n'
            f'      <freejoint/>\n'
            f'      <geom type="sphere" size="{n["r"]:.4f}" mass="{mass:.4f}" rgba="{rgba}" '
            f'contype="2" conaffinity="1" friction="0.9 0.01 0.001"/>\n'
            f'      <site name="s{i}" size="0.01"/>\n'
            f'    </body>')

    tendons, actuators = [], []
    info = ModelInfo(n_nodes=len(nodes), boxes=boxes, lift=lift)
    for k, s in enumerate(sticks):
        a, b = bp[s["a"]], bp[s["b"]]
        rest = max(0.25, min(1.875, math.dist(a, b)))
        info.rest.append(rest)
        strength = max(0.1, s.get("k", 1.0))
        if s.get("m"):
            # spier: geen eigen veer, een "position"-actuator houdt de gewenste lengte aan
            tendons.append(
                f'    <spatial name="t{k}" damping="8" width="0.03" rgba="0.94 0.27 0.27 1">'
                f'<site site="s{s["a"]}"/><site site="s{s["b"]}"/></spatial>')
            lo, hi = rest * (1 - MUSCLE_AMP), rest * (1 + MUSCLE_AMP)
            actuators.append(
                f'    <position name="m{k}" tendon="t{k}" kp="{600 * strength:.1f}" '
                f'ctrlrange="{lo:.4f} {hi:.4f}" forcerange="-250 250"/>')
            info.muscles.append((k, rest))
        else:
            # bot: stijve veer op rustlengte
            tendons.append(
                f'    <spatial name="t{k}" stiffness="{3000 * strength:.1f}" springlength="{rest:.4f}" '
                f'damping="30" width="0.025" rgba="0.91 0.89 0.85 1">'
                f'<site site="s{s["a"]}"/><site site="s{s["b"]}"/></spatial>')

    xml = f"""<mujoco model="growbot">
  <compiler angle="radian"/>
  <option timestep="{timestep}" integrator="implicitfast" gravity="0 0 -9.81"/>
  <visual><global offwidth="1280" offheight="720"/></visual>
  <worldbody>
    <light pos="0 -4 12" dir="0 0.3 -1" directional="true"/>
{chr(10).join(geoms)}
{chr(10).join(bodies)}
  </worldbody>
  <tendon>
{chr(10).join(tendons)}
  </tendon>
  <actuator>
{chr(10).join(actuators)}
  </actuator>
</mujoco>
"""
    return xml, info
