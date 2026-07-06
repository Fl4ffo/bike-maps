import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRoute, friendlyError } from './api';
import type { LngLat, ProfileId, RoutePath } from './api';
import { downloadGpx } from './gpx';
import MapView from './components/MapView';
import RoutePanel from './components/RoutePanel';
import ElevationChart from './components/ElevationChart';

interface Routes {
  fast: RoutePath | null;
  curvy: RoutePath | null;
}

const NO_ROUTES: Routes = { fast: null, curvy: null };

export default function App() {
  const [start, setStart] = useState<LngLat | null>(null);
  const [dest, setDest] = useState<LngLat | null>(null);
  const [routes, setRoutes] = useState<Routes>(NO_ROUTES);
  const [selected, setSelected] = useState<ProfileId>('curvy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleMapClick = useCallback(
    (p: LngLat) => {
      setError(null);
      if (!start) setStart(p);
      else setDest(p); // secondo clic e successivi: (ri)posizionano la destinazione
    },
    [start],
  );

  useEffect(() => {
    if (!start || !dest) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchRoute('fast', start, dest, ctrl.signal),
      fetchRoute('curvy', start, dest, ctrl.signal),
    ])
      .then(([fast, curvy]) => setRoutes({ fast, curvy }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setRoutes(NO_ROUTES);
        setError(friendlyError(e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [start, dest]);

  const reset = () => {
    abortRef.current?.abort();
    setStart(null);
    setDest(null);
    setRoutes(NO_ROUTES);
    setError(null);
    setLoading(false);
  };

  const swap = () => {
    if (start && dest) {
      setStart(dest);
      setDest(start);
    }
  };

  // hook di test usato solo in sviluppo (verifiche automatiche)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bikemaps = {
        setPoints: (s: LngLat, d: LngLat) => {
          setStart(s);
          setDest(d);
        },
      };
    }
  }, []);

  const selPath = routes[selected];

  return (
    <div className="app">
      <MapView
        start={start}
        dest={dest}
        fast={routes.fast}
        curvy={routes.curvy}
        onMapClick={handleMapClick}
        onMoveStart={setStart}
        onMoveDest={setDest}
      />
      <aside className="panel">
        <header>
          <h1>
            Bike Maps <span className="moto">🏍️</span>
          </h1>
          <p className="tagline">il percorso più divertente, non il più veloce</p>
        </header>

        {!start && (
          <p className="hint">
            Clicca sulla mappa per impostare la <b>partenza</b>.
          </p>
        )}
        {start && !dest && (
          <p className="hint">
            Ora clicca sulla <b>destinazione</b>. I marker si possono trascinare.
          </p>
        )}

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Calcolo percorsi…</div>}

        {routes.fast && routes.curvy && (
          <>
            <div className="cards">
              <RoutePanel
                profile="curvy"
                path={routes.curvy}
                selected={selected === 'curvy'}
                onSelect={() => setSelected('curvy')}
                onGpx={() => downloadGpx(routes.curvy as RoutePath, 'bikemaps-divertente')}
              />
              <RoutePanel
                profile="fast"
                path={routes.fast}
                selected={selected === 'fast'}
                onSelect={() => setSelected('fast')}
                onGpx={() => downloadGpx(routes.fast as RoutePath, 'bikemaps-veloce')}
              />
            </div>
            {selPath && (
              <ElevationChart path={selPath} color={selected === 'curvy' ? '#e8590c' : '#64748b'} />
            )}
          </>
        )}

        {(start || dest) && (
          <div className="actions">
            <button onClick={swap} disabled={!start || !dest}>
              ⇅ Inverti
            </button>
            <button onClick={reset}>✕ Reimposta</button>
          </div>
        )}

        <footer>dati © OpenStreetMap contributors · routing GraphHopper · tiles OpenFreeMap</footer>
      </aside>
    </div>
  );
}
