import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap, Marker, GeoJSONSource } from 'maplibre-gl';
import type { LngLat, RoutePath } from '../api';
import { POI_META } from '../poi';
import type { Poi } from '../poi';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

interface Props {
  points: LngLat[];
  loop: boolean;
  baseline: RoutePath | null; // percorso veloce (grigio, sotto)
  fun: RoutePath | null; // percorso divertente (arancione, sopra)
  pois: Poi[]; // già filtrati per categoria visibile
  hoverPoint: [number, number] | null; // sync hover dal profilo altimetrico
  onMapClick: (p: LngLat) => void;
  onMovePoint: (index: number, p: LngLat) => void;
}

/** Rampa freddo→caldo per fun_curvature (usata anche dalla legenda CSS). */
export const FUN_RAMP: [number, string][] = [
  [0, '#8894a5'],
  [30, '#f4b942'],
  [60, '#ee7214'],
  [90, '#d63031'],
];

/** Il percorso fun spezzato per intervalli di fun_curvature: ogni segmento
 *  porta il proprio valore e MapLibre lo colora con la rampa. */
function funFeatures(path: RoutePath | null): unknown {
  if (!path) return EMPTY;
  const coords = path.points.coordinates;
  const details = path.details?.fun_curvature ?? [];
  if (details.length === 0) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { fun: 0 }, geometry: { type: 'LineString', coordinates: coords } }] };
  }
  return {
    type: 'FeatureCollection',
    features: details.map(([from, to, val]) => ({
      type: 'Feature',
      properties: { fun: val ?? 0 },
      geometry: { type: 'LineString', coordinates: coords.slice(from, to + 1) },
    })),
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toFeature(path: RoutePath | null): unknown {
  if (!path) return EMPTY;
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: path.points.coordinates },
  };
}

function markerColor(index: number, count: number, loop: boolean): string {
  if (index === 0) return '#2e7d32'; // partenza
  if (!loop && index === count - 1) return '#c62828'; // arrivo
  return '#1d6fa5'; // tappa intermedia
}

export default function MapView({ points, loop, baseline, fun, pois, hoverPoint, onMapClick, onMovePoint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hadRoutes = useRef(false);
  const [ready, setReady] = useState(false);

  // i listener MapLibre leggono sempre l'ultima versione dei callback via ref
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const moveRef = useRef(onMovePoint);
  moveRef.current = onMovePoint;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [12.0, 42.5], // Italia, l'area coperta dal grafo
      zoom: 5.4,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }),
      'top-left',
    );
    map.on('load', () => {
      for (const id of ['baseline', 'fun'] as const) {
        map.addSource(`route-${id}`, { type: 'geojson', data: EMPTY as never });
        map.addLayer({
          id: `route-${id}`,
          type: 'line',
          source: `route-${id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:
            id === 'baseline'
              ? { 'line-color': '#64748b', 'line-width': 4, 'line-opacity': 0.75 }
              : {
                  'line-color': [
                    'interpolate', ['linear'], ['get', 'fun'],
                    ...FUN_RAMP.flat(),
                  ] as never,
                  'line-width': 5,
                  'line-opacity': 0.95,
                },
        });
      }

      map.addSource('hover-pt', { type: 'geojson', data: EMPTY as never });
      map.addLayer({
        id: 'hover-pt',
        type: 'circle',
        source: 'hover-pt',
        paint: { 'circle-radius': 7, 'circle-color': '#1e293b', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' },
      });

      map.addSource('pois', { type: 'geojson', data: EMPTY as never });
      map.addLayer({
        id: 'pois',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'type'],
            'pass', POI_META.pass.color,
            'viewpoint', POI_META.viewpoint.color,
            'fuel', POI_META.fuel.color,
            '#64748b',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', 'pois', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as { type: keyof typeof POI_META; name?: string; alongKm: number; ele?: number };
        const meta = POI_META[p.type];
        const title = p.name ? esc(p.name) : meta.label.replace(/i$/, 'o');
        const eleTxt = p.ele ? ` (${p.ele} m)` : '';
        new maplibregl.Popup({ closeButton: false, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`<div class="poi-popup">${meta.icon} <b>${title}</b>${eleTxt}<br>al km ${p.alongKm}</div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'pois', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'pois', () => {
        map.getCanvas().style.cursor = '';
      });

      // il clic su un POI apre il popup e NON deve aggiungere una tappa
      map.on('click', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['pois'] }).length > 0) return;
        clickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });

      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      setReady(false);
    };
  }, []);

  // marker: pochi elementi, la strategia più robusta è ricrearli a ogni cambio
  // (i ruoli partenza/tappa/arrivo dipendono dalla posizione nell'array)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = points.map((p, i) => {
      const m = new maplibregl.Marker({ color: markerColor(i, points.length, loop), draggable: true })
        .setLngLat(p)
        .addTo(map);
      m.on('dragend', () => {
        const ll = m.getLngLat();
        moveRef.current(i, { lng: ll.lng, lat: ll.lat });
      });
      return m;
    });
  }, [points, loop]);

  // pallino sulla mappa in corrispondenza dell'hover sul profilo altimetrico
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data = hoverPoint
      ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: hoverPoint } }
      : EMPTY;
    (map.getSource('hover-pt') as GeoJSONSource | undefined)?.setData(data as never);
  }, [hoverPoint, ready]);

  // sincronizza il layer POI
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data = {
      type: 'FeatureCollection',
      features: pois.map((p) => ({
        type: 'Feature',
        properties: { type: p.type, name: p.name, alongKm: p.alongKm, ele: p.ele },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    };
    (map.getSource('pois') as GeoJSONSource | undefined)?.setData(data as never);
  }, [pois, ready]);

  // sincronizza i layer percorso; zoom sui percorsi solo alla prima comparsa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('route-baseline') as GeoJSONSource | undefined)?.setData(toFeature(baseline) as never);
    (map.getSource('route-fun') as GeoJSONSource | undefined)?.setData(funFeatures(fun) as never);

    const has = Boolean(baseline || fun);
    if (has && !hadRoutes.current) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const path of [baseline, fun]) {
        for (const [x, y] of path?.points.coordinates ?? []) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (minX < maxX && minY < maxY) {
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 700 });
      }
    }
    hadRoutes.current = has;
  }, [baseline, fun, ready]);

  return <div ref={containerRef} className="map" />;
}
