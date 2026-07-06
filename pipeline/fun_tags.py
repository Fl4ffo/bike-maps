#!/usr/bin/env python
"""Pipeline fun-score (roadmap punto 2).

Legge un PBF OSM e riscrive un PBF identico in cui le strade carrabili hanno
due tag aggiuntivi consumati dall'import GraphHopper (modulo Java ext/):

  fun:curvature  0-100  quanto e' curvosa la strada (0 = rettilineo)
  fun:signals    0-15   semafori/stop per km lungo la way

Curvatura, metodo stile roadcurvature.com: per ogni tripla di punti consecutivi
si calcola il raggio del cerchio circoscritto; ogni vertice contribuisce con la
semisomma dei segmenti adiacenti pesata per bucket di raggio (tornanti pesano
piu' delle curve ampie). Lo score grezzo (lunghezza pesata / lunghezza totale,
0..~2) e' normalizzato a 0-100 con saturazione a MAX_RAW.

NOTA: lo score e' per-way OSM; GraphHopper spezza le way agli incroci, quindi
tutti gli archi derivati ereditano lo score medio della way. Buona
approssimazione v1 (stesso compromesso di roadcurvature).

Uso:  python fun_tags.py input.pbf output.pbf
"""
import sys
import time
from math import cos, radians, sqrt, inf
from pathlib import Path

import osmium

CAR_HIGHWAYS = frozenset((
    "motorway", "motorway_link", "trunk", "trunk_link",
    "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "residential",
    "living_street", "service", "track", "road",
))

SIGNAL_VALUES = frozenset(("traffic_signals", "stop"))

MAX_RAW = 1.5  # score grezzo che mappa a fun:curvature = 100

# Tolleranza Douglas-Peucker (m) applicata PRIMA del calcolo curvatura.
# Il jitter GPS delle geometrie OSM (~1-2 m) su strade dritte produce raggi
# apparenti di 150-450 m che gonfiano lo score; a 2 m il jitter collassa
# sulla retta mentre le curve vere (offset dalla corda >> 2 m) sopravvivono.
DP_EPSILON = 2.0


def curve_weight(radius_m):
    """Peso per bucket di raggio di curva (stile roadcurvature.com)."""
    if radius_m < 30:      # tornante
        return 2.0
    if radius_m < 75:      # curva stretta
        return 1.6
    if radius_m < 175:     # curva media
        return 1.2
    if radius_m < 450:     # curva ampia
        return 0.7
    return 0.0             # rettilineo di fatto


def simplify_dp(pts, eps):
    """Douglas-Peucker iterativo (niente ricorsione: way fino a ~2000 nodi)."""
    n = len(pts)
    if n < 3:
        return pts
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        ax, ay = pts[lo]
        bx, by = pts[hi]
        dx = bx - ax
        dy = by - ay
        seg2 = dx * dx + dy * dy
        best = -1.0
        best_i = -1
        for i in range(lo + 1, hi):
            px, py = pts[i]
            if seg2 < 1e-12:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best = d2
                best_i = i
        if best > eps * eps:
            keep[best_i] = True
            stack.append((lo, best_i))
            stack.append((best_i, hi))
    return [p for p, k in zip(pts, keep) if k]


def circumradius(a, b, c):
    """Raggio del cerchio circoscritto al triangolo abc (coordinate metriche)."""
    abx = b[0] - a[0]
    aby = b[1] - a[1]
    acx = c[0] - a[0]
    acy = c[1] - a[1]
    area2 = abs(abx * acy - aby * acx)  # doppio dell'area
    if area2 < 1e-9:
        return inf  # collineari: rettilineo
    la = sqrt(abx * abx + aby * aby)
    lb = sqrt((c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2)
    lc = sqrt(acx * acx + acy * acy)
    return (la * lb * lc) / (2.0 * area2)


class ScorePass(osmium.SimpleHandler):
    """Passata 1: raccoglie i nodi semaforo/stop e calcola gli score per way.

    Nel PBF i nodi precedono le way, quindi un'unica passata basta: quando
    arrivano le way l'insieme dei nodi segnale e' gia' completo.
    """

    def __init__(self):
        super().__init__()
        self.signal_nodes = set()
        self.scores = {}  # way_id -> (curvature 0-100, signals 0-15)
        self.n_ways = 0
        self.t0 = time.time()

    def node(self, n):
        v = n.tags.get("highway")
        if v is not None and v in SIGNAL_VALUES:
            self.signal_nodes.add(n.id)

    def way(self, w):
        hw = w.tags.get("highway")
        if hw is None or hw not in CAR_HIGHWAYS:
            return

        pts = []
        n_signals = 0
        for nd in w.nodes:
            if nd.ref in self.signal_nodes:
                n_signals += 1
            loc = nd.location
            if loc.valid():
                pts.append((loc.lon, loc.lat))
        if len(pts) < 2:
            return

        # proiezione locale equirettangolare (accurata alla scala di una way)
        lon0, lat0 = pts[0]
        kx = 111320.0 * cos(radians(lat0))
        ky = 110540.0
        xy = [((lon - lon0) * kx, (lat - lat0) * ky) for lon, lat in pts]
        xy = simplify_dp(xy, DP_EPSILON)

        seg = []
        total = 0.0
        for i in range(len(xy) - 1):
            dx = xy[i + 1][0] - xy[i][0]
            dy = xy[i + 1][1] - xy[i][1]
            d = sqrt(dx * dx + dy * dy)
            seg.append(d)
            total += d
        if total < 1.0:
            return

        weighted = 0.0
        for i in range(1, len(xy) - 1):
            wgt = curve_weight(circumradius(xy[i - 1], xy[i], xy[i + 1]))
            if wgt:
                weighted += wgt * (seg[i - 1] + seg[i]) / 2.0

        curv = min(100, round(weighted / total / MAX_RAW * 100))
        sig = min(15, round(n_signals / (total / 1000.0)))
        if curv or sig:
            self.scores[w.id] = (curv, sig)

        self.n_ways += 1
        if self.n_ways % 200000 == 0:
            print(f"  way analizzate: {self.n_ways:,} ({time.time() - self.t0:.0f}s)", flush=True)


class RewritePass(osmium.SimpleHandler):
    """Passata 2: copia tutto il PBF aggiungendo i tag fun:* alle way con score."""

    def __init__(self, writer, scores):
        super().__init__()
        self.writer = writer
        self.scores = scores
        self.tagged = 0

    def node(self, n):
        self.writer.add_node(n)

    def way(self, w):
        sc = self.scores.get(w.id)
        if sc is None:
            self.writer.add_way(w)
            return
        tags = [(t.k, t.v) for t in w.tags]
        tags.append(("fun:curvature", str(sc[0])))
        tags.append(("fun:signals", str(sc[1])))
        self.writer.add_way(w.replace(tags=tags))
        self.tagged += 1

    def relation(self, r):
        self.writer.add_relation(r)


def print_stats(scores):
    curvs = sorted(v[0] for v in scores.values())
    n = len(curvs)
    print(f"\nway con score: {n:,}")
    if not n:
        return
    print("distribuzione fun:curvature (percentili):")
    for p in (50, 75, 90, 95, 99):
        print(f"  p{p}: {curvs[min(n - 1, n * p // 100)]}")
    for soglia in (20, 40, 60, 80):
        c = sum(1 for v in curvs if v >= soglia)
        print(f"  way con curvature >= {soglia}: {c:,} ({100.0 * c / n:.1f}%)")
    n_sig = sum(1 for v in scores.values() if v[1] > 0)
    print(f"way con fun:signals > 0: {n_sig:,}")


def main():
    if len(sys.argv) != 3:
        sys.exit("uso: fun_tags.py input.pbf output.pbf")
    src, dst = sys.argv[1], sys.argv[2]

    t0 = time.time()
    print(f"[1/2] Analisi {src} (curvatura + segnali)...", flush=True)
    score_pass = ScorePass()
    score_pass.apply_file(src, locations=True, idx="flex_mem")
    print(f"  nodi segnale: {len(score_pass.signal_nodes):,}")
    print_stats(score_pass.scores)
    print(f"  passata 1 completata in {time.time() - t0:.0f}s", flush=True)

    t1 = time.time()
    print(f"\n[2/2] Riscrittura {dst} con tag fun:*...", flush=True)
    Path(dst).unlink(missing_ok=True)
    writer = osmium.SimpleWriter(dst)
    rewrite = RewritePass(writer, score_pass.scores)
    rewrite.apply_file(src)
    writer.close()
    print(f"  way taggate: {rewrite.tagged:,}")
    print(f"  passata 2 completata in {time.time() - t1:.0f}s")
    print(f"\nPIPELINE_OK totale {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
