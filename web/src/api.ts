export interface LngLat {
  lng: number;
  lat: number;
}

export type ProfileId = 'fast' | 'curvy';

export interface RoutePath {
  distance: number; // metri
  time: number; // millisecondi
  ascend: number;
  descend: number;
  points: { type: 'LineString'; coordinates: [number, number, number][] };
  details?: { fun_curvature?: [number, number, number | null][] };
}

const BASE = '/gh';

export async function fetchRoute(
  profile: ProfileId,
  start: LngLat,
  dest: LngLat,
  signal?: AbortSignal,
): Promise<RoutePath> {
  const params = new URLSearchParams();
  params.append('point', `${start.lat},${start.lng}`);
  params.append('point', `${dest.lat},${dest.lng}`);
  params.set('profile', profile);
  params.set('points_encoded', 'false');
  params.set('elevation', 'true');
  params.set('instructions', 'false');
  params.set('details', 'fun_curvature');

  const res = await fetch(`${BASE}/route?${params.toString()}`, { signal });
  const body: unknown = await res.json();
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `Errore ${res.status}`;
    throw new Error(msg);
  }
  return (body as { paths: RoutePath[] }).paths[0];
}

export function friendlyError(msg: string): string {
  if (msg.includes('Cannot find point')) {
    return (
      'Punto fuori dall’area coperta (Nord-Ovest Italia: Piemonte, Lombardia, ' +
      'Liguria, Valle d’Aosta). Spostalo su una strada dentro la regione.'
    );
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Server di routing non raggiungibile: avviare scripts\\start-server.ps1';
  }
  return msg;
}
