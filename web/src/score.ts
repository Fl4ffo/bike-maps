import type { RoutePath } from './api';

/** Fun-score di un percorso, derivato dai path details di fun_curvature.
 *  Stessa logica di scripts/fun-report.ps1: media pesata sulla distanza
 *  e percentuale di km su strade "curvy" (fun_curvature >= soglia). */
export interface FunScore {
  avg: number; // fun_curvature medio pesato sulla distanza (0-100)
  curvyPct: number; // % di km con fun_curvature >= CURVY_THRESHOLD
  km: number; // lunghezza totale ricalcolata dalla geometria
}

export const CURVY_THRESHOLD = 45;

const EARTH_R = 6371;

function havKm(a: [number, number, number], b: [number, number, number]): number {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Distanza cumulativa (km) per ogni indice della geometria. */
export function cumulativeKm(coords: [number, number, number][]): number[] {
  const cum = new Array<number>(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + havKm(coords[i - 1], coords[i]);
  }
  return cum;
}

export function computeFunScore(path: RoutePath): FunScore {
  const coords = path.points.coordinates;
  const cum = cumulativeKm(coords);
  const total = cum.length > 0 ? cum[cum.length - 1] : 0;

  let wsum = 0;
  let curvyKm = 0;
  for (const [from, to, raw] of path.details?.fun_curvature ?? []) {
    const km = cum[to] - cum[from];
    const val = raw ?? 0; // arco senza tag = 0 (rettilineo/non classificato)
    wsum += km * val;
    if (val >= CURVY_THRESHOLD) curvyKm += km;
  }

  return {
    avg: total > 0 ? wsum / total : 0,
    curvyPct: total > 0 ? (100 * curvyKm) / total : 0,
    km: total,
  };
}
