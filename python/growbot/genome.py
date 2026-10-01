"""Genomen inlezen (JSON uit de browser/train.js, of champions/example.js)."""
import json
import re
from pathlib import Path


def load_genome(path, index=0):
    """Lees een GrowBot-genoom.

    path  : .json (Download JSON / champions/champion.json / galerij-export)
            of champions/example.js (dan kies je met index welk voorbeeld)
    """
    text = Path(path).read_text(encoding="utf-8")
    if path.endswith(".js"):
        # "GROW.EXAMPLES = [...];"  →  alleen het JSON-deel
        m = re.search(r"=\s*(\[.*\])\s*;?\s*$", text, re.S)
        data = json.loads(m.group(1))[index]
    else:
        data = json.loads(text)
    return data["genome"] if "genome" in data else data


def blueprint(genome):
    """Posities van alle bollen t.o.v. de hoofdbol (zelfde als Genome.blueprint in JS).

    Let op: in de JS-versie is y omhoog. Hier geven we nog JS-coördinaten terug.
    """
    pos = []
    for n in genome["nodes"]:
        if n["p"] < 0:
            pos.append((0.0, 0.0, 0.0))
        else:
            q = pos[n["p"]]
            d, l = n["d"], n["l"]
            pos.append((q[0] + d[0] * l, q[1] + d[1] * l, q[2] + d[2] * l))
    return pos
