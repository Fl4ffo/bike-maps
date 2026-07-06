import type { LngLat } from './api';

/** Geocoding via l'istanza pubblica Photon di Komoot (gratuita, fair-use).
 *  In produzione a scala: self-host di Photon. */
export interface GeoResult {
  label: string;
  lng: number;
  lat: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    osm_value?: string;
  };
}

export async function geocode(q: string, bias?: LngLat, signal?: AbortSignal): Promise<GeoResult[]> {
  // niente parametro lang: photon.komoot.io supporta solo en/de/fr (400 con altri)
  // e i toponimi italiani sono gia' i nomi nativi OSM
  const params = new URLSearchParams({ q, limit: '6' });
  if (bias) {
    params.set('lat', bias.lat.toFixed(4));
    params.set('lon', bias.lng.toFixed(4));
  }
  const res = await fetch(`https://photon.komoot.io/api?${params.toString()}`, { signal });
  if (!res.ok) throw new Error('Ricerca località non disponibile al momento');
  const body = (await res.json()) as { features: PhotonFeature[] };
  return body.features.map((f) => ({
    label: [f.properties.name, f.properties.city ?? f.properties.county, f.properties.state]
      .filter(Boolean)
      .join(', '),
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}
