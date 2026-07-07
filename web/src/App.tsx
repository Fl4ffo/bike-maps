import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchRoute, friendlyError, isRetryableRoundTripError } from './api';
import type { LngLat, RoutePath } from './api';
import { sliderToModel } from './slider';
import { downloadGpx } from './gpx';
import { computeFunScore } from './score';
import { getRoute, saveRoute, shareUrl } from './saved';
import { POI_META, poisAlong } from './poi';
import type { Poi, PoiType } from './poi';
import MapView from './components/MapView';
import RoutePanel from './components/RoutePanel';
import ElevationChart from './components/ElevationChart';
import SearchBox from './components/SearchBox';
import SavedRoutes from './components/SavedRoutes';

type Mode = 'ab' | 'loop';

interface Routes {
  fast: RoutePath | null;
  fun: RoutePath | null;
}

const NO_ROUTES: Routes = { fast: null, fun: null };

function funLabel(k: number): string {
  if (k < 25) return 'Quasi diretto';
  if (k < 60) return 'Bilanciato';
  if (k < 90) return 'Divertente';
  return 'Max curve';
}
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
  const [funLevel, setFunLevel] = useState(75); // slider 0=diretto, 100=max curve
  const [uiLevel, setUiLevel] = useState(75); // valore durante il drag (commit al rilascio)
  const [loopKm, setLoopKm] = useState(120);
  const [seed, setSeed] = useState(newSeed);
  const [routes, setRoutes] = useState<Routes>(NO_ROUTES);
  const [selected, setSelected] = useState<'fast' | 'fun'>('fun');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pois, setPois] = useState<Poi[] | null>(null);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [poiTypes, setPoiTypes] = useState<Set<PoiType>>(() => new Set(['pass', 'viewpoint', 'fuel']));
  const abortRef = useRef<AbortController | null>(null);
  const poisAbortRef = useRef<AbortController | null>(null);

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
    setSavedId(null); // il giro visualizzato è cambiato: il link salvato non lo rappresenta più

    (async () => {
      const model = sliderToModel(funLevel);
      if (canAb) {
        const [fast, fun] = await Promise.all([
          fetchRoute('fast', points, {}, ctrl.signal),
          fetchRoute('slider_base', points, { customModel: model }, ctrl.signal),
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
            'slider_base',
            points,
            { roundTrip: { distanceKm: loopKm, seed: seed + attempt * 7919 }, customModel: model },
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
  }, [mode, points, funLevel, loopKm, seed]);

  // POI lungo il percorso divertente corrente
  useEffect(() => {
    poisAbortRef.current?.abort();
    if (!routes.fun) {
      setPois(null);
      return;
    }
    const ctrl = new AbortController();
    poisAbortRef.current = ctrl;
    poisAlong(routes.fun, ctrl.signal)
      .then(setPois)
      .catch(() => {
        if (!ctrl.signal.aborted) setPois([]);
      });
  }, [routes.fun]);

  const togglePoiType = (t: PoiType) => {
    setPoiTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const reset = () => {
    abortRef.current?.abort();
    setPoints([]);
    setRoutes(NO_ROUTES);
    setError(null);
    setLoading(false);
    setSaveName(null);
    setSavedId(null);
  };

  // carica un giro salvato ripristinando i parametri: il calcolo riparte da solo
  // (per gli anelli il seed salvato rende il risultato riproducibile)
  const loadSaved = useCallback((id: string) => {
    setError(null);
    getRoute(id)
      .then((rec) => {
        setMode(rec.mode);
        // v1: il DB memorizza solo balanced/curvy → mappa sul livello slider
        const lvl = rec.funProfile === 'curvy' ? 100 : 50;
        setFunLevel(lvl);
        setUiLevel(lvl);
        if (rec.mode === 'loop') {
          setLoopKm(rec.loopKm ?? 120);
          if (rec.seed != null) setSeed(rec.seed);
        }
        setPoints(rec.points);
      })
      .catch(() => setError('Giro salvato non trovato.'));
  }, []);

  // link condiviso: /?r=ID
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('r');
    if (id) loadSaved(id);
  }, [loadSaved]);

  const doSave = async () => {
    if (!routes.fun || !saveName || !saveName.trim()) return;
    setSaving(true);
    try {
      const score = computeFunScore(routes.fun);
      const id = await saveRoute({
        name: saveName.trim(),
        mode,
        // v1: lo schema accetta solo balanced/curvy (CHECK SQLite); il livello
        // esatto dello slider si perde nel salvataggio — migrazione futura
        funProfile: funLevel >= 50 ? 'curvy' : 'balanced',
        points,
        loopKm: mode === 'loop' ? loopKm : undefined,
        seed: mode === 'loop' ? seed : undefined,
        distance: routes.fun.distance,
        timeMs: routes.fun.time,
        ascend: routes.fun.ascend,
        funAvg: score.avg,
        curvyPct: score.curvyPct,
        path: routes.fun,
      });
      setSavedId(id);
      setSaveName(null);
      setRefreshKey((k) => k + 1);
      try {
        await navigator.clipboard.writeText(shareUrl(id));
      } catch {
        /* clipboard non disponibile: il link resta visibile nel pannello */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  };

  // hook di test usato solo in sviluppo (verifiche automatiche)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bikemaps = {
        setPoints,
        setMode: switchMode,
        setLoopKm,
        setFunLevel: (k: number) => {
          setFunLevel(k);
          setUiLevel(k);
        },
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selPath = routes[selected] ?? routes.fun;
  const gpxName = mode === 'loop' ? 'bikemaps-anello' : 'bikemaps-divertente';

  return (
    <div className="app">
      <MapView
        points={points}
        loop={mode === 'loop'}
        baseline={routes.fast}
        fun={routes.fun}
        pois={(pois ?? []).filter((p) => poiTypes.has(p.type))}
        hoverPoint={hoverPoint}
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

        <div className="fun-slider">
          <div className="fun-slider-head">
            <span>Diretto</span>
            <strong>
              {funLabel(uiLevel)} · {uiLevel}
            </strong>
            <span>Max curve</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={uiLevel}
            onChange={(e) => setUiLevel(Number(e.target.value))}
            onPointerUp={() => setFunLevel(uiLevel)}
            onKeyUp={(e) => {
              if (e.key.startsWith('Arrow')) setFunLevel(uiLevel);
            }}
          />
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
          <motion.div className="cards" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <RoutePanel
              title={mode === 'loop' ? `Anello · ${funLabel(funLevel)}` : `${funLabel(funLevel)} (${funLevel})`}
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
          </motion.div>
        )}

        {routes.fun && (
          <div className="fun-legend" title="Colore del tracciato: fun_curvature">
            <div className="fun-legend-bar" />
            <div className="fun-legend-labels">
              <span>rettilineo</span>
              <span>curve</span>
              <span>tornanti</span>
            </div>
          </div>
        )}

        {selPath && routes.fun && (
          <ElevationChart
            path={selPath}
            color={selected === 'fast' && routes.fast ? '#64748b' : '#e8590c'}
            onHover={(idx) => {
              const c = selPath.points.coordinates;
              setHoverPoint(idx != null && c[idx] ? [c[idx][0], c[idx][1]] : null);
            }}
          />
        )}

        {routes.fun && pois && pois.length > 0 && (
          <div className="pois">
            <div className="poi-toggles">
              {(Object.keys(POI_META) as PoiType[]).map((t) => {
                const count = pois.filter((p) => p.type === t).length;
                return (
                  <button
                    key={t}
                    className={poiTypes.has(t) ? 'on' : ''}
                    disabled={count === 0}
                    onClick={() => togglePoiType(t)}
                    title={POI_META[t].label}
                  >
                    {POI_META[t].icon} {count}
                  </button>
                );
              })}
            </div>
            {poiTypes.has('pass') && (
              <ul className="pass-list">
                {pois
                  .filter((p) => p.type === 'pass' && p.name)
                  .map((p) => (
                    <li key={p.id}>
                      ⛰️ {p.name}
                      {p.ele ? ` (${p.ele} m)` : ''} · km {p.alongKm.toFixed(0)}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {routes.fun && (
          <div className="save-box">
            {saveName === null && !savedId && <button onClick={() => setSaveName('')}>💾 Salva giro</button>}
            {saveName !== null && (
              <div className="save-form">
                <input
                  autoFocus
                  placeholder="Nome del giro…"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doSave();
                    if (e.key === 'Escape') setSaveName(null);
                  }}
                />
                <button disabled={saving || !saveName.trim()} onClick={() => void doSave()}>
                  {saving ? '…' : 'Salva'}
                </button>
              </div>
            )}
            {savedId && (
              <div className="saved-ok">
                ✓ Salvato, link copiato: <a href={shareUrl(savedId)}>{shareUrl(savedId)}</a>
              </div>
            )}
          </div>
        )}

        {points.length > 0 && (
          <div className="actions">
            <button onClick={reset}>✕ Reimposta</button>
          </div>
        )}

        <SavedRoutes refreshKey={refreshKey} onLoad={loadSaved} />

        <footer>dati © OpenStreetMap contributors · routing GraphHopper · tiles OpenFreeMap · ricerca Photon/Komoot</footer>
      </aside>
    </div>
  );
}
