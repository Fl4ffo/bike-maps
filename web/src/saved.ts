import type { LngLat, RoutePath, FunProfileId } from './api';

/** Client per gli endpoint /api/routes (salvataggio e condivisione giri). */
export interface SavedRouteSummary {
  id: string;
  name: string;
  createdAt: string;
  mode: 'ab' | 'loop';
  funProfile: FunProfileId;
  loopKm: number | null;
  distance: number;
  timeMs: number;
  ascend: number;
  funAvg: number;
  curvyPct: number;
}

export interface SavedRouteFull extends SavedRouteSummary {
  seed: number | null;
  points: LngLat[];
  path: RoutePath;
}

export interface SavePayload {
  name: string;
  mode: 'ab' | 'loop';
  funProfile: FunProfileId;
  points: LngLat[];
  loopKm?: number;
  seed?: number;
  distance: number;
  timeMs: number;
  ascend: number;
  funAvg: number;
  curvyPct: number;
  path: RoutePath;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Errore ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function saveRoute(payload: SavePayload): Promise<string> {
  const res = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const { id } = await jsonOrThrow<{ id: string }>(res);
  return id;
}

export async function listRoutes(): Promise<SavedRouteSummary[]> {
  return jsonOrThrow(await fetch('/api/routes'));
}

export async function getRoute(id: string): Promise<SavedRouteFull> {
  return jsonOrThrow(await fetch(`/api/routes/${encodeURIComponent(id)}`));
}

export async function deleteRoute(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/routes/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export function shareUrl(id: string): string {
  return `${window.location.origin}/?r=${encodeURIComponent(id)}`;
}
