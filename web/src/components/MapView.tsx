import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap, Marker, GeoJSONSource } from 'maplibre-gl';
import type { LngLat, RoutePath } from '../api';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

interface Props {
  points: LngLat[];
  loop: boolean;
  baseline: RoutePath | null; // percorso veloce (grigio, sotto)
  fun: RoutePath | null; // percorso divertente (arancione, sopra)
  onMapClick: (p: LngLat) => void;
  onMovePoint: (index: number, p: LngLat) => void;
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

export default function MapView({ points, loop, baseline, fun, onMapClick, onMovePoint }: Props) {
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
      center: [7.9, 45.35], // Nord-Ovest Italia, l'area coperta dal grafo
      zoom: 7.2,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }),
      'top-left',
    );
    map.on('click', (e) => clickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
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
              : { 'line-color': '#e8590c', 'line-width': 5, 'line-opacity': 0.9 },
        });
      }
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

  // sincronizza i layer percorso; zoom sui percorsi solo alla prima comparsa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('route-baseline') as GeoJSONSource | undefined)?.setData(toFeature(baseline) as never);
    (map.getSource('route-fun') as GeoJSONSource | undefined)?.setData(toFeature(fun) as never);

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
