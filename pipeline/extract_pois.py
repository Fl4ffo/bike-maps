#!/usr/bin/env python
"""Estrae dal PBF i POI rilevanti per il motogiro -> data/pois.json

Categorie:
  pass      mountain_pass=yes   (i passi sono l'oro del motogiro)
  viewpoint tourism=viewpoint
  fuel      amenity=fuel        (autonomia in giro)

Uso: python extract_pois.py input.pbf output.json
"""
import json
import sys
from collections import Counter

import osmium


class PoiPass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.pois = []
        self.counts = Counter()

    def node(self, n):
        t = n.tags
        if t.get('mountain_pass') == 'yes':
            typ = 'pass'
        elif t.get('tourism') == 'viewpoint':
            typ = 'viewpoint'
        elif t.get('amenity') == 'fuel':
            typ = 'fuel'
        else:
            return
        if not n.location.valid():
            return
        ele = None
        raw_ele = t.get('ele')
        if raw_ele:
            try:
                ele = round(float(raw_ele.replace(',', '.').split(';')[0]))
            except ValueError:
                pass
        poi = {
            'id': n.id,
            'type': typ,
            'name': t.get('name'),
            'lng': round(n.location.lon, 6),
            'lat': round(n.location.lat, 6),
        }
        if ele is not None:
            poi['ele'] = ele
        self.pois.append(poi)
        self.counts[typ] += 1


def main():
    if len(sys.argv) != 3:
        sys.exit('uso: extract_pois.py input.pbf output.json')
    h = PoiPass()
    h.apply_file(sys.argv[1])
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(h.pois, f, ensure_ascii=False)
    for typ, c in sorted(h.counts.items()):
        print(f'  {typ}: {c:,}')
    print(f'POIS_OK totale {len(h.pois):,} -> {sys.argv[2]}')


if __name__ == '__main__':
    main()
