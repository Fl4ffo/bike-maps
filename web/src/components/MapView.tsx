import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap, Marker, GeoJSONSource } from 'maplibre-gl';
import type { LngLat, RoutePath } from '../api';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

interface Props {
  start: LngLat | null;
  dest: LngLat | null;
  fast: RoutePath | null;
  curvy: RoutePath | null;
  onMapClick: (p: LngLat) => void;
  onMoveStart: (p: LngLat) => void;
  onMoveDest: (p: LngLat) => void;
}

function toFeature(path: RoutePath | null): unknown {
  if (!path) return EMPTY;
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: path.points.coordinates },
  };
}

export default function MapView({ start, dest, fast, curvy, onMapClick, onMoveStart, onMoveDest }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const startMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const hadRoutes = useRef(false);
  const [ready, setReady] = useState(false);

  // i callback cambiano a ogni render: i listener MapLibre leggono sempre l'ultimo via ref
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const moveStartRef = useRef(onMoveStart);
  moveStartRef.current = onMoveStart;
  const moveDestRef = useRef(onMoveDest);
  moveDestRef.current = onMoveDest;

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
      // fast sotto, curvy sopra
      for (const id of ['fast', 'curvy'] as const) {
        map.addSource(`route-${id}`, { type: 'geojson', data: EMPTY as never });
        map.addLayer({
          id: `route-${id}`,
          type: 'line',
          source: `route-${id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint:
            id === 'fast'
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
      startMarker.current = null;
      destMarker.current = null;
      setReady(false);
    };
  }, []);

  // marker partenza
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!start) {
      startMarker.current?.remove();
      startMarker.current = null;
      return;
    }
    if (!startMarker.current) {
      const m = new maplibregl.Marker({ color: '#2e7d32', draggable: true }).setLngLat(start).addTo(map);
      m.on('dragend', () => {
        const p = m.getLngLat();
        moveStartRef.current({ lng: p.lng, lat: p.lat });
      });
      startMarker.current = m;
    } else {
      startMarker.current.setLngLat(start);
    }
  }, [start]);

  // marker destinazione
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!dest) {
      destMarker.current?.remove();
      destMarker.current = null;
      return;
    }
    if (!destMarker.current) {
      const m = new maplibregl.Marker({ color: '#c62828', draggable: true }).setLngLat(dest).addTo(map);
      m.on('dragend', () => {
        const p = m.getLngLat();
        moveDestRef.current({ lng: p.lng, lat: p.lat });
      });
      destMarker.current = m;
    } else {
      destMarker.current.setLngLat(dest);
    }
  }, [dest]);

  // sincronizza i layer percorso; zoom sui percorsi solo alla prima comparsa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('route-fast') as GeoJSONSource | undefined)?.setData(toFeature(fast) as never);
    (map.getSource('route-curvy') as GeoJSONSource | undefined)?.setData(toFeature(curvy) as never);

    const has = Boolean(fast || curvy);
    if (has && !hadRoutes.current) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const path of [fast, curvy]) {
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
  }, [fast, curvy, ready]);

  return <div ref={containerRef} className="map" />;
}
