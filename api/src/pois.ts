import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

/** POI lungo il percorso: carica data/pois.json (estratto dalla pipeline) in
 *  memoria con un indice spaziale a griglia e filtra quelli vicini alla
 *  geometria del percorso, annotando la posizione chilometrica. */

export interface Poi {
  id: number;
  type: 'pass' | 'viewpoint' | 'fuel';
  name: string | null;
  lng: number;
  lat: number;
  ele?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POIS_PATH = process.env.BM_POIS ?? path.resolve(__dirname, '../../data/pois.json');

const CELL = 0.02; // ~1.6-2.2 km per cella: con maxDist <= 1000m basta la finestra 3x3

let pois: Poi[] = [];
const grid = new Map<string, Poi[]>();

function cellKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

export function loadPois(): number {
  try {
    pois = JSON.parse(fs.readFileSync(POIS_PATH, 'utf8')) as Poi[];
  } catch {
    pois = []; // file assente: endpoint attivo ma vuoto (eseguire pipeline/extract_pois.py)
  }
  grid.clear();
  for (const p of pois) {
    const key = cellKey(Math.floor(p.lng / CELL), Math.floor(p.lat / CELL));
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  }
  return pois.length;
}

/** distanza approssimata in metri (equirettangolare: ottima sotto i 2 km) */
function distM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const kx = 111320 * Math.cos((lat1 * Math.PI) / 180);
  const dx = (lng2 - lng1) * kx;
  const dy = (lat2 - lat1) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

interface AlongBody {
  coordinates: number[][];
  maxDistM?: number;
}

const alongSchema = {
  body: {
    type: 'object',
    required: ['coordinates'],
    properties: {
      coordinates: {
        type: 'array',
        minItems: 2,
        maxItems: 30000,
        items: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'number' } },
      },
      maxDistM: { type: 'number', minimum: 50, maximum: 1000 },
    },
  },
} as const;

export function registerPoiEndpoints(app: FastifyInstance): void {
  const n = loadPois();
  app.log.info(`POI caricati: ${n} da ${POIS_PATH}`);

  app.post<{ Body: AlongBody }>('/api/pois/along', { schema: alongSchema }, async (req) => {
    const maxDist = req.body.maxDistM ?? 600;
    const coords = req.body.coordinates;
    const best = new Map<number, { poi: Poi; distM: number; alongKm: number }>();

    let alongM = 0;
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      if (i > 0) alongM += distM(coords[i - 1][0], coords[i - 1][1], lng, lat);
      const cx = Math.floor(lng / CELL);
      const cy = Math.floor(lat / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(cellKey(cx + dx, cy + dy));
          if (!bucket) continue;
          for (const p of bucket) {
            const d = distM(lng, lat, p.lng, p.lat);
            if (d > maxDist) continue;
            const prev = best.get(p.id);
            if (!prev || d < prev.distM) {
              best.set(p.id, { poi: p, distM: d, alongKm: alongM / 1000 });
            }
          }
        }
      }
    }

    return [...best.values()]
      .sort((a, b) => a.alongKm - b.alongKm)
      .slice(0, 400)
      .map(({ poi, distM: d, alongKm }) => ({
        ...poi,
        distM: Math.round(d),
        alongKm: Math.round(alongKm * 10) / 10,
      }));
  });
}
