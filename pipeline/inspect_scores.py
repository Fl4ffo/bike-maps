#!/usr/bin/env python
"""Ispezione qualitativa degli score fun:* su strade note.

Uso: python inspect_scores.py output.pbf "Gavia" "Buenos Aires" ...
Stampa way che contengono le sottostringhe nel nome, con i loro tag fun:*.
"""
import sys
from collections import defaultdict

import osmium

MAX_PER_PATTERN = 8


class Inspector(osmium.SimpleHandler):
    def __init__(self, patterns):
        super().__init__()
        self.patterns = patterns
        self.hits = defaultdict(list)

    def way(self, w):
        if "highway" not in w.tags:
            return
        name = w.tags.get("name") or w.tags.get("ref") or ""
        if not name:
            return
        low = name.lower()
        for p in self.patterns:
            if p.lower() in low and len(self.hits[p]) < MAX_PER_PATTERN:
                self.hits[p].append((
                    w.id, name, w.tags.get("highway"),
                    w.tags.get("fun:curvature", "-"),
                    w.tags.get("fun:signals", "-"),
                    len(w.nodes),
                ))


def main():
    if len(sys.argv) < 3:
        sys.exit("uso: inspect_scores.py file.pbf pattern [pattern...]")
    ins = Inspector(sys.argv[2:])
    ins.apply_file(sys.argv[1])
    for p in sys.argv[2:]:
        print(f"\n=== '{p}' ===")
        for wid, name, hw, curv, sig, n_nodes in ins.hits.get(p, []):
            print(f"  way {wid}: {name} [{hw}] curv={curv} sig={sig} nodi={n_nodes}")
        if not ins.hits.get(p):
            print("  (nessuna way trovata)")


if __name__ == "__main__":
    main()
