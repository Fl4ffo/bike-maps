import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRoute, friendlyError, isRetryableRoundTripError } from './api';
import type { FunProfileId, LngLat, RoutePath } from './api';
import { downloadGpx } from './gpx';
import MapView from './components/MapView';
import RoutePanel from './components/RoutePanel';
import ElevationChart from './components/ElevationChart';
import SearchBox from './components/SearchBox';

type Mode = 'ab' | 'loop';

interface Routes {
  fast: RoutePath | null;
  fun: RoutePath | null;
}

const NO_ROUTES: Routes = { fast: null, fun: null };
const FUN_LABEL: Record<FunProfileId, string> = { balanced: 'Bilanciato', curvy: 'Max curve' };
const LOOP_KMS = [50, 80, 120, 180, 250];
const RT_RETRIES = 4;

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

function pointLabel(i: number, count: number, loop: boolean): string {
  if (loop) return 'Partenza';
  if (i === 0) return 'Partenza';
  if (i === count - 1) return 'Arrivo';
  return `Tappa ${i}`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('ab');
  const [points, setPoints] = useState<LngLat[]>([]);
  const [funProfile, setFunProfile] = useState<FunProfileId>('curvy');
  const [loopKm, setLoopKm] = useState(120);
  const [seed, setSeed] = useState(newSeed);
  const [routes, setRoutes] = useState<Routes>(NO_ROUTES);
  const [selected, setSelected] = useState<'fast' | 'fun'>('fun');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addPoint = useCallback(
    (p: LngLat) => {
      setError(null);
      setPoints((prev) => (mode === 'loop' ? [p] : [...prev, p]));
    },
    [mode],
  );

  const movePoint = useCallback((index: number, p: LngLat) => {
    setError(null);
    setPoints((prev) => prev.map((old, i) => (i === index ? p : old)));
  }, []);

  const removePoint = (index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setRoutes(NO_ROUTES);
    setError(null);
    if (m === 'loop') setPoints((prev) => prev.slice(0, 1));
  };

  useEffect(() => {
    const canAb = mode === 'ab' && points.length >= 2;
    const canLoop = mode === 'loop' && points.length === 1;
    if (!canAb && !canLoop) {
      setRoutes(NO_ROUTES);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    (async () => {
      if (canAb) {
        const [fast, fun] = await Promise.all([
          fetchRoute('fast', points, {}, ctrl.signal),
          fetchRoute(funProfile, points, {}, ctrl.signal),
        ]);
        return { fast, fun };
      }
      // anello: il seed genera i punti intermedi casuali. Due modi di fallire:
      // (a) punto in zona senza strade -> errore GH, si riprova con altro seed;
      // (b) distanza reale che sfora di molto il target (il punto e' oltre una
      //     montagna) -> si riprova e si tiene il tentativo piu' vicino al target
      let best: RoutePath | null = null;
      let bestDelta = Infinity;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < RT_RETRIES; attempt++) {
        try {
          const fun = await fetchRoute(
            funProfile,
            points,
            { roundTrip: { distanceKm: loopKm, seed: seed + attempt * 7919 } },
            ctrl.signal,
          );
          const km = fun.distance / 1000;
          const delta = Math.abs(km - loopKm);
          if (delta < bestDelta) {
            best = fun;
            bestDelta = delta;
          }
          if (km >= loopKm * 0.6 && km <= loopKm * 1.6) break; // dentro la tolleranza
        } catch (e) {
          if (ctrl.signal.aborted) throw e;
          if (!(e instanceof Error) || !isRetryableRoundTripError(e.message)) throw e;
          lastErr = e;
        }
      }
      if (best) return { fast: null, fun: best };
      throw lastErr ?? new Error('Anello non trovato');
    })()
      .then((r) => setRoutes(r))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setRoutes(NO_ROUTES);
        setError(friendlyError(e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [mode, points, funProfile, loopKm, seed]);

  const reset = () => {
    abortRef.current?.abort();
    setPoints([]);
    setRoutes(NO_ROUTES);
    setError(null);
    setLoading(false);
  };

  // hook di test usato solo in sviluppo (verifiche automatiche)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bikemaps = {
        setPoints,
        setMode: switchMode,
        setLoopKm,
        setFunProfile,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selPath = routes[selected] ?? routes.fun;
  const gpxName = mode === 'loop' ? 'bikemaps-anello' : `bikemaps-${FUN_LABEL[funProfile].toLowerCase().replace(' ', '-')}`;

  return (
    <div className="app">
      <MapView
        points={points}
        loop={mode === 'loop'}
        baseline={routes.fast}
        fun={routes.fun}
        onMapClick={addPoint}
        onMovePoint={movePoint}
      />
      <aside className="panel">
        <header>
          <h1>
            Bike Maps <span className="moto">🏍️</span>
          </h1>
          <p className="tagline">il percorso più divertente, non il più veloce</p>
        </header>

        <div className="segmented">
          <button className={mode === 'ab' ? 'on' : ''} onClick={() => switchMode('ab')}>
            A → B
          </button>
          <button className={mode === 'loop' ? 'on' : ''} onClick={() => switchMode('loop')}>
            Anello
          </button>
        </div>

        <SearchBox
          placeholder={mode === 'loop' ? 'Cerca il punto di partenza…' : 'Cerca una località da aggiungere…'}
          bias={points[0]}
          onPick={(r) => addPoint({ lng: r.lng, lat: r.lat })}
        />

        {mode === 'loop' && (
          <div className="loop-controls">
            <label>
              Distanza
              <select value={loopKm} onChange={(e) => setLoopKm(Number(e.target.value))}>
                {LOOP_KMS.map((km) => (
                  <option key={km} value={km}>
                    ~{km} km
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setSeed(newSeed())} disabled={points.length === 0}>
              🎲 Altro giro
            </button>
          </div>
        )}

        <div className="segmented fun-choice">
          <button className={funProfile === 'balanced' ? 'on' : ''} onClick={() => setFunProfile('balanced')}>
            Bilanciato
          </button>
          <button className={funProfile === 'curvy' ? 'on' : ''} onClick={() => setFunProfile('curvy')}>
            Max curve
          </button>
        </div>

        {points.length === 0 && (
          <p className="hint">
            Clicca sulla mappa (o cerca una località) per la <b>partenza</b>
            {mode === 'ab' ? ', poi aggiungi arrivo ed eventuali tappe.' : '.'}
          </p>
        )}
        {mode === 'ab' && points.length === 1 && (
          <p className="hint">
            Ora aggiungi l’<b>arrivo</b>. Ogni clic successivo aggiunge una tappa; i marker si trascinano.
          </p>
        )}

        {points.length > 0 && (
          <ul className="chips">
            {points.map((p, i) => (
              <li key={`${i}-${p.lng.toFixed(5)}-${p.lat.toFixed(5)}`}>
                <span>{pointLabel(i, points.length, mode === 'loop')}</span>
                <button title="Rimuovi" onClick={() => removePoint(i)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Calcolo percorsi…</div>}

        {routes.fun && (
          <div className="cards">
            <RoutePanel
              title={mode === 'loop' ? `Anello ${FUN_LABEL[funProfile].toLowerCase()}` : FUN_LABEL[funProfile]}
              kind="fun"
              path={routes.fun}
              selected={selected === 'fun'}
              onSelect={() => setSelected('fun')}
              onGpx={() => downloadGpx(routes.fun as RoutePath, gpxName)}
            />
            {routes.fast && (
              <RoutePanel
                title="Veloce"
                kind="fast"
                path={routes.fast}
                selected={selected === 'fast'}
                onSelect={() => setSelected('fast')}
                onGpx={() => downloadGpx(routes.fast as RoutePath, 'bikemaps-veloce')}
              />
            )}
          </div>
        )}

        {selPath && routes.fun && (
          <ElevationChart path={selPath} color={selected === 'fast' && routes.fast ? '#64748b' : '#e8590c'} />
        )}

        {points.length > 0 && (
          <div className="actions">
            <button onClick={reset}>✕ Reimposta</button>
          </div>
        )}

        <footer>dati © OpenStreetMap contributors · routing GraphHopper · tiles OpenFreeMap · ricerca Photon/Komoot</footer>
      </aside>
    </div>
  );
}
