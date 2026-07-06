export interface LngLat {
  lng: number;
  lat: number;
}

export type ProfileId = 'fast' | 'curvy' | 'balanced';
export type FunProfileId = Exclude<ProfileId, 'fast'>;

export interface RoutePath {
  distance: number; // metri
  time: number; // millisecondi
  ascend: number;
  descend: number;
  points: { type: 'LineString'; coordinates: [number, number, number][] };
  details?: { fun_curvature?: [number, number, number | null][] };
}

export interface RoundTripOpts {
  distanceKm: number;
  seed: number;
}

const BASE = '/gh';

export async function fetchRoute(
  profile: ProfileId,
  points: LngLat[],
  opts: { roundTrip?: RoundTripOpts } = {},
  signal?: AbortSignal,
): Promise<RoutePath> {
  const params = new URLSearchParams();
  for (const p of points) params.append('point', `${p.lat},${p.lng}`);
  params.set('profile', profile);
  params.set('points_encoded', 'false');
  params.set('elevation', 'true');
  params.set('instructions', 'false');
  params.set('details', 'fun_curvature');
  if (opts.roundTrip) {
    params.set('algorithm', 'round_trip');
    params.set('round_trip.distance', String(Math.round(opts.roundTrip.distanceKm * 1000)));
    params.set('round_trip.seed', String(opts.roundTrip.seed));
  }

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

/** Il round_trip genera punti intermedi casuali: vicino a zone senza strade
 *  (ghiacciai, confini della copertura) può fallire — si riprova con un altro seed. */
export function isRetryableRoundTripError(msg: string): boolean {
  return msg.includes('Could not find a valid point');
}

export function friendlyError(msg: string): string {
  if (msg.includes('Cannot find point')) {
    return (
      'Punto fuori dall’area coperta (Nord-Ovest Italia: Piemonte, Lombardia, ' +
      'Liguria, Valle d’Aosta). Spostalo su una strada dentro la regione.'
    );
  }
  if (isRetryableRoundTripError(msg)) {
    return (
      'Non riesco a chiudere un anello da qui (zona con poche strade attorno). ' +
      'Prova "Altro giro", una distanza diversa o un punto di partenza meno isolato.'
    );
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Server di routing non raggiungibile: avviare scripts\\start-server.ps1';
  }
  return msg;
}
