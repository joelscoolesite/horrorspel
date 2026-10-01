"""Snelle tests voor de Python-versie:   py test_growbot.py"""
import math

import mujoco
import numpy as np

from growbot import GrowBotEnv, build_mjcf, load_genome
from growbot.model import classic_track, height_at


def test_track_heights_match_js():
    # zelfde waarden als heightAt() in de browser (src/core/parkour.js)
    b = classic_track()
    for x, h in [(0, 0.0), (9, 0.0), (13, 0.0), (15, 0.4), (17, 0.8), (19.2, 1.1), (20, 0.8), (23, 1.3)]:
        assert abs(height_at(b, x) - h) < 1e-9, (x, height_at(b, x), h)
    assert height_at(b, 8.4) == -math.inf  # boven het gat


def test_models_load_and_are_stable():
    for i in (0, 1):
        g = load_genome("../champions/example.js", i)
        xml, info = build_mjcf(g)
        m = mujoco.MjModel.from_xml_string(xml)
        assert m.nbody == len(g["nodes"]) + 1 and m.ntendon == len(g["sticks"])
        env = GrowBotEnv(g, randomize=True)
        obs, _ = env.reset(seed=3)
        for _ in range(300):
            obs, r, term, trunc, _ = env.step(env.action_space.sample())
            assert np.all(np.isfinite(obs)) and math.isfinite(r)
            if term or trunc:
                break


def test_deterministic():
    g = load_genome("../champions/example.js", 1)
    runs = []
    for _ in range(2):
        env = GrowBotEnv(g, randomize=True)
        obs, _ = env.reset(seed=42)
        for k in range(200):
            obs, *_ = env.step(np.sin(np.arange(env.action_space.shape[0]) + k * 0.1))
        runs.append(obs.copy())
    assert np.array_equal(runs[0], runs[1])


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            n += 1
            print("  ✔", name)
    print(f"{n} geslaagd")
