import type { RoutePath } from './api';
import type { IconName } from './components/Icon';

/** Client per /api/pois/along: POI (passi, panorami, benzinai) entro ~600 m
 *  dal percorso, con posizione chilometrica. */
export type PoiType = 'pass' | 'viewpoint' | 'fuel';

export interface Poi {
  id: number;
  type: PoiType;
  name: string | null;
  lng: number;
  lat: number;
  ele?: number;
  distM: number;
  alongKm: number;
}

export const POI_META: Record<PoiType, { label: string; icon: IconName; color: string }> = {
  pass: { label: 'Passi', icon: 'mountain', color: '#7c3aed' },
  viewpoint: { label: 'Panorami', icon: 'camera', color: '#0d9488' },
  fuel: { label: 'Benzina', icon: 'fuel', color: '#b45309' },
};

export async function poisAlong(path: RoutePath, signal?: AbortSignal): Promise<Poi[]> {
  const coordinates = path.points.coordinates.map(([lng, lat]) => [lng, lat]);
  const res = await fetch('/api/pois/along', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ coordinates }),
    signal,
  });
  if (!res.ok) throw new Error(`POI: errore ${res.status}`);
  return (await res.json()) as Poi[];
}
