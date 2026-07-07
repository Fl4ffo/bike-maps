export interface LngLat {
  lng: number;
  lat: number;
}

export type ProfileId = 'fast' | 'curvy' | 'balanced' | 'slider_base';
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
  opts: { roundTrip?: RoundTripOpts; customModel?: object } = {},
  signal?: AbortSignal,
): Promise<RoutePath> {
  const payload: Record<string, unknown> = {
    points: points.map((p) => [p.lng, p.lat]),
    profile,
    points_encoded: false,
    elevation: true,
    instructions: false,
    details: ['fun_curvature'],
  };
  if (opts.roundTrip) {
    payload.algorithm = 'round_trip';
    payload['round_trip.distance'] = Math.round(opts.roundTrip.distanceKm * 1000);
    payload['round_trip.seed'] = opts.roundTrip.seed;
  }
  if (opts.customModel) payload.custom_model = opts.customModel;

  const res = await fetch(`${BASE}/route`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
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
    return 'Punto fuori dall’area coperta (Italia). Spostalo su una strada dentro i confini.';
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
