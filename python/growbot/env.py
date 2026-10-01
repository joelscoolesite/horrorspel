"""Gymnasium-omgeving: één GrowBot-wezen op het Classic-parcours in MuJoCo.

    obs    = [klok sin/cos, hoogte + kanteling hoofdbol, snelheid hoofdbol,
              per bol: positie t.o.v. hoofdbol + snelheid,
              per spier: huidige lengte / rustlengte,
              terrein vooruit: trede-hoogte + "gat?"]
    actie  = per spier een getal in [-1, 1]  →  lengte = rust × (1 + 0.35·a)
    beloning = meters vooruit per stap  − kleine energiekost (0.0002·Σa²)
               + 3 per checkpoint  + 20 bij de finish

Werkt met elke RL-bibliotheek die Gymnasium snapt (Stable-Baselines3, CleanRL…).
"""
import math

import gymnasium as gym
import mujoco
import numpy as np
from gymnasium import spaces

from .model import CHECKPOINTS, FINISH_X, MUSCLE_AMP, build_mjcf, height_at


class GrowBotEnv(gym.Env):
    metadata = {"render_modes": ["rgb_array"], "render_fps": 50}

    def __init__(self, genome, frame_skip=10, max_time=30.0, randomize=True,
                 clock_hz=1.2, render_mode=None):
        self.genome = genome
        self.xml, self.info = build_mjcf(genome)
        self.model = mujoco.MjModel.from_xml_string(self.xml)
        self.data = mujoco.MjData(self.model)
        self.frame_skip = frame_skip
        self.dt = self.model.opt.timestep * frame_skip      # 0.02 s → 50 keer per seconde besturen
        self.max_time = max_time
        self.randomize = randomize
        self.clock_hz = genome.get("f", clock_hz)
        self.render_mode = render_mode
        self._renderer = None

        n_mus = len(self.info.muscles)
        if n_mus == 0:
            raise ValueError("Dit wezen heeft geen spieren: het kan niet bewegen.")
        self.n_nodes = self.info.n_nodes
        self.action_space = spaces.Box(-1.0, 1.0, (n_mus,), dtype=np.float32)
        obs_dim = 2 + 2 + 3 + self.n_nodes * 6 + n_mus + 2
        self.observation_space = spaces.Box(-np.inf, np.inf, (obs_dim,), dtype=np.float32)
        self._rest = np.array([r for _, r in self.info.muscles])
        self._tendon_ids = np.array([k for k, _ in self.info.muscles])

    # ---------- hulpjes ----------
    def _node_pos(self):
        return self.data.qpos.reshape(self.n_nodes, 7)[:, :3]

    def _node_vel(self):
        return self.data.qvel.reshape(self.n_nodes, 6)[:, :3]

    def _terrain(self, x):
        here = height_at(self.info.boxes, x)
        ahead = height_at(self.info.boxes, x + 1.0)
        base = here if math.isfinite(here) else 0.0
        hole = 1.0 if (not math.isfinite(ahead) or ahead < base - 0.5) else 0.0
        step = 0.0 if not math.isfinite(ahead) else max(-1.0, min(1.0, (ahead - base) * 2))
        return step, hole

    def _obs(self):
        pos, vel = self._node_pos(), self._node_vel()
        root = pos[0]
        ph = 2 * math.pi * self.clock_hz * self.data.time
        rel = (pos - root).ravel()
        lens = self.data.ten_length[self._tendon_ids] / self._rest
        step, hole = self._terrain(root[0])
        return np.concatenate([
            [math.sin(ph), math.cos(ph)],
            [root[2], root[1] / 3.0],          # hoogte, positie links/rechts
            vel[0],
            rel, vel.ravel() * 0.2,
            lens,
            [step, hole],
        ]).astype(np.float32)

    # ---------- Gymnasium-API ----------
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        mujoco.mj_resetData(self.model, self.data)
        if self.randomize:  # domain randomization: iets andere start (zoals in de browser)
            dx, dy = self.np_random.uniform(-0.3, 0.3), self.np_random.uniform(-0.6, 0.6)
            q = self.data.qpos.reshape(self.n_nodes, 7)
            q[:, 0] += dx
            q[:, 1] += dy
        self.data.ctrl[:] = self._rest
        mujoco.mj_forward(self.model, self.data)
        self.best_x = self._node_pos()[0][0]
        self.passed = 0
        return self._obs(), {}

    def step(self, action):
        a = np.clip(np.asarray(action, dtype=np.float64), -1, 1)
        self.data.ctrl[:] = self._rest * (1 + MUSCLE_AMP * a)
        x0 = self._node_pos()[0][0]
        for _ in range(self.frame_skip):
            mujoco.mj_step(self.model, self.data)
        root = self._node_pos()[0]
        x = root[0]
        reward = (x - x0) - 0.0002 * float(np.sum(a * a))
        # checkpoints (elk maar één keer)
        while self.passed < len(CHECKPOINTS) and x >= CHECKPOINTS[self.passed][0]:
            self.passed += 1
            reward += 3.0
        self.best_x = max(self.best_x, x)
        finished = x >= FINISH_X
        fell = root[2] < -1.0
        unstable = not np.all(np.isfinite(self.data.qpos))
        if finished:
            reward += 20.0
        terminated = bool(finished or fell or unstable)
        truncated = bool(self.data.time >= self.max_time)
        info = {"x": float(x), "best_x": float(self.best_x), "finished": finished, "fell": fell,
                "checkpoints": self.passed, "time": float(self.data.time)}
        obs = self._obs() if not unstable else np.zeros(self.observation_space.shape, np.float32)
        return obs, float(reward), terminated, truncated, info

    def render(self):
        if self._renderer is None:
            self._renderer = mujoco.Renderer(self.model, 360, 640)
        cam = mujoco.MjvCamera()
        cam.lookat[:] = self._node_pos()[0]
        cam.distance, cam.azimuth, cam.elevation = 5.0, 120.0, -20.0
        self._renderer.update_scene(self.data, cam)
        return self._renderer.render()

    def close(self):
        if self._renderer is not None:
            self._renderer.close()
            self._renderer = None
