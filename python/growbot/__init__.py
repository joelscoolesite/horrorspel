"""GrowBot in Python: dezelfde wezens, maar in MuJoCo (een echte robotica-simulator).

    from growbot import load_genome, GrowBotEnv
    env = GrowBotEnv(load_genome("../champions/example.js", 0))
"""
from .genome import load_genome, blueprint
from .model import build_mjcf
from .env import GrowBotEnv

__all__ = ["load_genome", "blueprint", "build_mjcf", "GrowBotEnv"]
