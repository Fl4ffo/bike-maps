# CLAUDE.md — Bike Maps

App di routing "divertente" per moto/auto (curve > velocità). **Leggere [PIANO_PROGETTO.md](PIANO_PROGETTO.md) prima di lavorare**: contiene visione, architettura completa, algoritmo fun-score, roadmap e fasi.

## Stato del progetto (aggiornare a ogni avanzamento)

- [x] Fase 1 (roadmap punto 1): GraphHopper 11.0 locale + profili fast/curvy su OSM Nord-Ovest Italia — VALIDATA 2026-07-06: su Torino→Aosta curvy prende SS565 Canavese+SS26 invece dell'A5 (+2600 m dislivello, 2× tempo); Milano→Varese evita autostrada/urbano (1.85×); Bormio→Ponte di Legno resta sul Gavia
- [x] Roadmap punto 2 — COMPLETATO 2026-07-06: pipeline Python (`pipeline/fun_tags.py`, pyosmium) calcola `fun:curvature` 0-100 (roadcurvature-style + Douglas-Peucker ε=2m anti-jitter) e `fun:signals` 0-15 → PBF arricchito → import Java custom (`graphhopper/ext`, `com.bikemaps.FunScoreImport`) registra gli EV `fun_curvature`/`fun_signals` → curvy.json v2 li usa. Validato: Torino→Aosta fun_curvature medio 1,3 (fast) vs 17,9 (curvy); Colle San Carlo 58-67, Sempione/A4 = 0
- [x] Roadmap punto 3 — COMPLETATO 2026-07-06: frontend `web/` (React+TS+Vite+MapLibre, tiles OpenFreeMap). Clic su mappa = partenza/destinazione (marker trascinabili), disegna entrambi i profili a confronto, fun-score 🌀 (porting TS di fun-report in `src/score.ts`), profilo altimetrico SVG, export GPX, errori GH tradotti (Cannot find point → "fuori area coperta"). Dev: `npm run dev` in web/ con proxy `/gh`→8989 (host:true per LAN). Verificato in preview: Torino→Aosta rende 🌀18/132km (curvy) vs 🌀1/115km (fast), coerente con fun-report.ps1. Hook di test dev-only: `window.__bikemaps.setPoints(start, dest)`.
- [ ] Roadmap punto 4: API Fastify + deploy Hetzner
- [ ] Fase 2 features: waypoint intermedi, round-trip (`round_trip` GH), geocoding Photon, slider diretto↔divertente (richiede terzo profilo "balanced" o custom_model per request), import GPX, salvataggio percorsi (PostGIS)

## Ambiente

- Windows 11, Java 21 (no Docker installato), PowerShell
- GraphHopper gira come JAR locale: `scripts\import.ps1` poi `scripts\start-server.ps1` → http://localhost:8989 (UI: /maps/)
- RAM 16 GB: heap import -Xmx6g, server -Xmx4g

## Regole operative critiche

1. **Re-import del grafo** (`scripts\import.ps1`, ~3 min) necessario SOLO se cambiano: il PBF arricchito (cioè dopo ogni `run-pipeline.ps1`), `graph.encoded_values` in config.yml o la lista profili. Lo script cancella da solo `data\graph-cache`. L'import DEVE usare `com.bikemaps.FunScoreImport` (lo fa import.ps1), MAI il comando `import` standard del jar: non conosce gli EV custom. Il SERVER invece è il jar ufficiale invariato: al load ricostruisce gli EV dalle properties della cache (`EncodingManager.fromProperties`), nessun classpath extra.
1b. **Pipeline** (`scripts\run-pipeline.ps1`, ~9 min): da rieseguire se cambia il PBF sorgente o la logica di `pipeline/fun_tags.py`. Dopo la pipeline serve sempre il re-import. Validare sempre con `pipeline/inspect_scores.py` su strade note (Colle San Carlo deve stare ≥55, Corso Sempione/Buenos Aires/A4 a 0) prima di importare.
2. **I custom model si iterano a caldo**: modifica → riavvio server. Nessun re-import. In questa fase NESSUN profilo ha la prep CH: se si riattiva `profiles_ch`, le query ai profili flessibili richiedono `ch.disable=true` (e la UI /maps/ non lo manda → 400).
3. Nei custom model usare **solo penalità** (`multiply_by` ≤ 1), mai bonus: il fun è uno sconto sul costo, altrimenti il routing degenera in loop. Vale anche per la futura pipeline.
4. `data/` e i JAR sono gitignored: mai committarli.
5. Semantica `curvature` di GraphHopper: distanza in linea d'aria / lunghezza arco → 1.0 = rettilineo, basso = curve. Si PENALIZZA curvature alta.
6. Metrica di guardia quando si toccano i pesi: rapporto tempo_curvy/tempo_fast su percorsi di riferimento (`scripts\test-routes.ps1`) — se supera ~2× il profilo sta degenerando.
7. Gotcha noti GraphHopper 11.0: l'encoded value `urban_density` richiede `graph.urban_density.threads >= 1` in config, altrimenti l'import crasha con IllegalArgumentException su ForkJoinPool; l'estratto Geofabrik contiene rotte traghetto da Genova → il DEM scarica anche tile africani/spagnoli (innocuo).

## Percorsi di riferimento per i test (Nord-Ovest)

- Torino (45.070,7.686) → Aosta (45.737,7.315): fast deve prendere A5, curvy deve preferire SS26/valli laterali
- Bormio (46.466,10.370) → Ponte di Legno (46.259,10.510): curvy deve passare dal Passo Gavia
- API: `GET /route?point=LAT,LON&point=LAT,LON&profile=curvy&points_encoded=false`

## Prossimo lavoro (roadmap punto 3)

Frontend MapLibre GL JS (React + TypeScript + Vite): mappa con marker partenza/arrivo, chiamata a `GET /route` (profili fast/curvy), disegno di entrambi i percorsi a confronto, profilo altimetrico, fun-score del percorso (media `fun_curvature` pesata via `details=fun_curvature` — logica già prototipata in `scripts/fun-report.ps1`), slider diretto↔divertente, export GPX. Tiles: OpenFreeMap. Poi roadmap punto 4: API Fastify + deploy.

## Idee di tuning già identificate (non bloccanti)

- `fun_signals` satura (15) su way urbane corte con un semaforo: impatto routing minimo (penalità × lunghezza arco piccola) ma la normalizzazione per km si può migliorare.
- Lo score è per-way OSM: una way lunga con un solo tratto curvo si diluisce. Miglioria futura: spezzare le way in segmenti nella pipeline.
- Su Torino→Aosta il curvy resta 2.02× il tempo del fast (soglia di guardia ~2×): se serve più aderenza, alzare `distance_influence` a 20-25 o ammorbidire la penalità dei rettilinei.
