# Bike Maps

Web app di navigazione che calcola il percorso più **divertente** (curve, passi, panorami) invece del più veloce, per moto e auto. Visione completa, architettura e roadmap: [PIANO_PROGETTO.md](PIANO_PROGETTO.md).

## Stato attuale — copertura ITALIA intera

Grafo nazionale (~8 M nodi) con preparazione **LM (landmarks)** per i tre profili: query veloci anche su tratte lunghe (Milano→Roma curvy: 719 km calcolati in ~1,5 s). Pipeline fun-score su 3 M di strade, 37.152 POI (4.502 passi).

## Fase 3: web app funzionante

Frontend React + TypeScript + Vite in `web/`: mappa MapLibre (tiles OpenFreeMap), waypoint multipli con clic (marker trascinabili, tappe rimovibili), **confronto visivo veloce vs divertente**, modalità **Anello** ("giro di ~N km da qui" via `round_trip` con retry automatico sui seed), ricerca località (Photon), selettore **Bilanciato / Max curve**, fun-score 🌀 per percorso, profilo altimetrico, export GPX, **salvataggio e condivisione giri** (SQLite via API, link `/?r=ID` che ripristina il giro — per gli anelli il seed salvato lo rende riproducibile), **POI lungo il percorso** (⛰️ passi con quota e km, 🌄 panorami, ⛽ benzinai — estratti dal PBF, filtrati entro 600 m dal tracciato con indice spaziale a griglia). Responsive desktop/mobile.

In dev servono attivi GraphHopper (`scripts\start-server.ps1`) e l'API (`cd api; npm run dev`): Vite proxa `/gh` e `/api`.

I tre profili su Milano→Varese: veloce 41 min, bilanciato 58 min (1.4×), max curve 76 min (1.9×).

```powershell
cd web; npm install; npm run dev    # http://localhost:5173 (anche da LAN)
```

Richiede il server GraphHopper attivo (`scripts\start-server.ps1`): il dev server proxa `/gh` → `localhost:8989`.

**Modalità produzione** — API Fastify in `api/` come entry-point unico (frontend statico + proxy `/gh` + `/api/health`):

```powershell
cd web; npm run build     # frontend statico in web/dist
cd ..\api; npm install; npm run build; npm start    # tutto su http://localhost:3000
```

Deploy su VPS (Docker Compose + Caddy con TLS automatico): [infra/DEPLOY.md](infra/DEPLOY.md).

## Fase 2: pipeline fun-score

Routing engine GraphHopper 11.0 self-hosted su estratto OSM Italia, con dati di divertimento **precalcolati da una pipeline Python** e iniettati nel grafo come encoded value custom:

- `fun_curvature` (0-100) — curvatura reale della strada, metodo roadcurvature.com (raggio del cerchio circoscritto per tripla di punti, bucket per raggio) con semplificazione Douglas-Peucker ε=2 m che elimina il jitter GPS delle geometrie OSM
- `fun_signals` (0-15) — semafori+stop per km

Profili: **fast** (baseline veloce) e **curvy** (penalizza rettilinei via `fun_curvature`, autostrade, urbano, gallerie, semafori, sterrato).

Validazione quantitativa (media di `fun_curvature` pesata sulla distanza, `scripts\fun-report.ps1`): su Torino→Aosta il fast fa 1,3 (A5, 1% km curvi), il curvy 17,9 (SS565 Canavese + SS26, 16% km curvi, +2600 m dislivello). Rapporto tempo curvy/fast ≤ 2×. Campioni noti: Colle San Carlo 58-67, Corso Sempione/Buenos Aires/A4 = 0.

## Requisiti

- Java 21+ (JDK: serve javac per l'estensione)
- Python 3.11+ (venv in `pipeline\.venv`, dipendenza: pyosmium)
- ~10 GB liberi su disco, **16 GB RAM** (import Italia: heap 9 GB; server: 6 GB)

## Quick start

```powershell
scripts\download-data.ps1    # scarica PBF Italia (~2 GB) + JAR GraphHopper (se mancanti)
scripts\run-pipeline.ps1     # tag fun:* + POI -> italy-fun.osm.pbf (~45 min)
scripts\import.ps1           # grafo con EV custom + prep LM (~30 min, fermare prima il server)
scripts\start-server.ps1     # avvia su http://localhost:8989
scripts\test-routes.ps1      # confronto fast vs curvy sui percorsi di riferimento
scripts\fun-report.ps1       # fun-score di un percorso (media fun_curvature pesata)
```

UI mappa con selettore profilo: <http://localhost:8989/maps/>

API di esempio:

```
GET http://localhost:8989/route?point=45.070,7.686&point=45.737,7.315&profile=curvy&points_encoded=false
```

## Struttura

```
web/                      # frontend React+TS+Vite: MapLibre, fun-score, GPX
api/                      # API Fastify: frontend statico + proxy /gh + /api/health
pipeline/
  fun_tags.py             # pipeline fun-score: PBF -> PBF + tag fun:* (curvatura DP, semafori)
  inspect_scores.py       # ispezione qualitativa degli score su strade note
graphhopper/
  config.yml              # config GraphHopper (encoded values, profili, elevazione)
  custom_models/
    fast.json             # baseline veloce
    curvy.json            # profilo divertente — QUI si itera sui pesi
  ext/src/com/bikemaps/   # estensione Java: EV custom fun_* (import via FunScoreImport)
data/                     # (gitignored) PBF, graph-cache, tile SRTM
scripts/                  # download / pipeline / import / avvio / test
infra/                    # deploy VPS: compose (Caddy+API+GraphHopper), Dockerfile, DEPLOY.md
```

Flusso dati: `nord-ovest.osm.pbf` → pipeline Python (tag `fun:curvature`, `fun:signals`) → `nord-ovest-fun.osm.pbf` → import Java custom (`com.bikemaps.FunScoreImport`, registra gli encoded value) → graph-cache → **server GraphHopper ufficiale invariato** (al load gli EV si ricostruiscono dalle properties della cache).

## Iterare sui pesi dei profili

1. Modifica `graphhopper/custom_models/curvy.json` (o `balanced.json`)
2. Riesegui `scripts\import.ps1` (~3 min: GraphHopper salva i profili nel graph-cache, un custom model modificato richiede il re-import) e riavvia il server
3. Confronta i profili con `scripts\test-routes.ps1` e sulla UI su percorsi che conosci

Dati © OpenStreetMap contributors (ODbL).
