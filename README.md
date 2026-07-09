# Bike Maps

A self-hosted routing application that computes the most **enjoyable** driving route — favouring curves, mountain passes and scenery — instead of the fastest one. Built for motorcyclists and drivers who care about the ride, not the arrival time.

Bike Maps covers the whole of Italy on a single national road graph and returns routes in one to two seconds even on 700+ km trips. It is a full vertical slice: an offline data pipeline that scores every road for "fun", a customised routing engine, a REST API, and a responsive web client, all packaged for one-command deployment.

---

## Table of contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [The fun-score pipeline](#the-fun-score-pipeline)
- [Routing profiles and the continuous slider](#routing-profiles-and-the-continuous-slider)
- [Web application](#web-application)
- [Technology stack](#technology-stack)
- [Repository layout](#repository-layout)
- [Running it locally](#running-it-locally)
- [Deployment](#deployment)
- [Validation and benchmarks](#validation-and-benchmarks)
- [Engineering highlights](#engineering-highlights)
- [Roadmap](#roadmap)
- [Attribution and licence](#attribution-and-licence)

---

## The problem

Consumer navigation apps optimise for time or distance. Their routing cost functions are fixed and cannot be changed, so there is no way to ask for "the road with the best curves" or "avoid the motorway even if it is slower". Bike Maps replaces that fixed cost function with a tunable one built on top of OpenStreetMap data and a self-hosted routing engine, where curvature, elevation, road class, surface and traffic-signal density all feed into the routing decision.

The core idea is to precompute a per-road **fun score** from the road geometry and bake it into the routing graph, then let the routing engine trade travel time against that score by a user-controlled amount.

---

## How it works

The system is split into an **offline preparation stage** (run once per map update) and an **online serving stage**.

1. A Python pipeline reads the raw OpenStreetMap extract of Italy, computes two custom metrics per road segment — road curvature and traffic-signal density — and writes them back into an enriched OSM file as custom tags.
2. A small Java extension imports that enriched file into GraphHopper, registering the two metrics as first-class **encoded values** in the routing graph. Landmark (LM) tables are prepared for every profile so that long, flexible queries stay fast at national scale.
3. At runtime the **stock GraphHopper server** serves the graph. Custom routing profiles use the encoded values to discount the cost of curvy, scenic roads and penalise motorways, urban stretches, tunnels and unpaved surfaces.
4. A Fastify API sits in front of GraphHopper: it serves the compiled web client, proxies routing requests, stores and shares saved routes in SQLite, and returns points of interest along a computed route.

The interesting property of this design is that the customisation lives entirely in the **data preparation**: once the graph is built, the routing server is the unmodified official GraphHopper JAR, which reconstructs the custom encoded values from the graph-cache metadata at load time. No forked engine to maintain.

---

## Architecture

Online serving stage:

```
                Browser  (React + MapLibre GL JS)
                   |  HTTPS
                   v
        Reverse proxy  (Traefik or Caddy, automatic TLS)
                   |
                   v
             API  (Fastify, Node.js)
                   |-- serves the compiled SPA (web/dist)
                   |-- /gh/*            --> GraphHopper   (internal network only)
                   |-- /api/routes      --> SQLite        (save / share routes)
                   |-- /api/pois/along  --> spatial index (POIs near a route)
                   `-- /api/health      --> GraphHopper status probe
```

Offline preparation stage:

```
   Geofabrik Italy extract  (italy-latest.osm.pbf)
        |  pyosmium pipeline (fun_tags.py):
        |  curvature via circumscribed-circle radius, Douglas-Peucker
        |  simplification to remove GPS jitter; signals per km
        v
   italy-fun.osm.pbf   (adds fun:curvature and fun:signals tags)
        |  Java import (com.bikemaps.FunScoreImport):
        |  registers fun_curvature and fun_signals encoded values,
        |  prepares LM tables per profile
        v
   graph-cache   (self-describing; portable to the server as-is)
        |
        v
   GraphHopper server  (unmodified official JAR)
```

GraphHopper is never exposed publicly; it is reachable only from the API over the internal container network. Its built-in debugging UI remains available through the API proxy at `/gh/maps/`.

---

## The fun-score pipeline

Two encoded values are computed offline by `pipeline/fun_tags.py` (using `pyosmium`) and injected into the OSM data:

- **`fun_curvature`** (0–100) — the real curviness of the road. It follows the roadcurvature.com method: for each triple of consecutive geometry points the radius of the circumscribed circle is computed, tighter radii are bucketed into higher scores, and the per-way score is the length-weighted aggregate.
- **`fun_signals`** (0–15) — traffic lights and stop signs per kilometre, used to penalise stop-and-go urban roads.

A key detail is **noise handling**. Raw OSM way geometries contain small positional jitter; computing curvature directly on them produces false tight radii and makes dead-straight avenues score as if they were mountain passes. The pipeline first simplifies each way with the Douglas-Peucker algorithm at a 2-metre tolerance, which removes the jitter while preserving real bends. After this fix, straight urban arterials score 0 and known passes score in the expected 55–70 range.

Points of interest (mountain passes, viewpoints, fuel stations) are extracted separately by `pipeline/extract_pois.py` into a compact JSON file — 37,152 POIs nationwide, including 4,502 passes — which the API queries with a spatial grid index to find only the POIs within a short distance of a computed route.

The pipeline output is validated before import with `pipeline/inspect_scores.py` against a set of known roads, so a regression in the scoring logic is caught before the expensive graph import runs.

---

## Routing profiles and the continuous slider

Four routing profiles are defined as GraphHopper custom models (`graphhopper/custom_models/*.json`):

| Profile | Purpose |
|---|---|
| `fast` | Time-optimal baseline. |
| `curvy` | Maximises curves; penalises straight roads, motorways, urban areas, tunnels, traffic signals and unpaved surfaces. |
| `balanced` | A middle ground between time and fun. |
| `slider_base` | A neutral base profile with no penalties, used as the substrate for the continuous slider. |

All routing costs use **penalties only** (multipliers `<= 1`): the fun score acts as a discount on cost rather than a bonus, which keeps the search well-behaved and avoids degenerate loops.

The web client exposes a continuous **Direct ↔ Fun** slider rather than a fixed set of profiles. Moving the slider does not switch profiles; instead the client sends a **per-request custom model** in the routing request body, layered on top of `slider_base`, interpolating the penalty strength and the distance-influence factor. This is possible because GraphHopper allows a request-scoped custom model to add penalties over a base profile without re-importing the graph. At the maximum setting the slider reproduces the `curvy` profile exactly.

Because every served profile is stored in the graph-cache at import time, any change to a profile's custom model requires a full re-import — a deliberate trade-off documented in the operational notes.

---

## Web application

The frontend (`web/`, React + TypeScript + Vite, MapLibre GL JS) provides:

- Click-to-route with multiple waypoints; draggable, removable stops.
- Side-by-side comparison of the fast route and the fun route.
- A **loop mode** ("give me a round trip of roughly N km from here") using GraphHopper's round-trip algorithm, with automatic retries across random seeds and a distance-tolerance check.
- Location search via the Photon geocoder.
- The continuous Direct ↔ Fun slider described above.
- A per-route fun score, an interactive elevation profile synchronised with a marker on the map, and the route track coloured by curvature.
- GPX export.
- Save and share: routes are persisted in SQLite through the API and reachable by a `/?r=ID` link that restores the parameters and recomputes the route (round trips are reproducible via the saved seed).
- Points of interest along the route (passes with elevation and distance-along, viewpoints, fuel), toggleable by category.

The interface uses a restrained, utility-first visual language (cool neutral palette, a single sage-teal accent, hairline borders and very soft elevation), a consistent inline SVG icon set, and reduced-motion-aware transitions.

---

## Technology stack

| Layer | Technology |
|---|---|
| Routing engine | GraphHopper 11.0 (self-hosted), Java 21 |
| Custom routing metrics | Java extension registering custom encoded values |
| Data pipeline | Python 3.11, pyosmium |
| Geospatial source | OpenStreetMap (Geofabrik Italy extract), SRTM elevation |
| API | Fastify 5, Node.js 22 (ESM), better-sqlite3 |
| Frontend | React 18, TypeScript, Vite, MapLibre GL JS, framer-motion |
| Map tiles / geocoding | OpenFreeMap tiles, Photon geocoder |
| Packaging | Docker, Docker Compose |
| Reverse proxy / TLS | Traefik (via Dokploy) or Caddy |

---

## Repository layout

```
web/                          Frontend: React + TypeScript + Vite, MapLibre, GPX, SVG icon set
api/
  src/server.ts               Single entry point: static SPA + /gh proxy + API
  src/routes.ts               Save / list / delete routes (SQLite, JSON-schema validated)
  src/pois.ts                 POIs along a route (spatial grid index)
  src/db.ts                   SQLite access layer
pipeline/
  fun_tags.py                 Curvature (Douglas-Peucker + circumscribed circle) and signals
  extract_pois.py             Passes, viewpoints and fuel stations from the PBF
  inspect_scores.py           Qualitative score inspection on known roads
graphhopper/
  config.yml                  Encoded values, profiles, LM preparation, elevation
  custom_models/              fast / curvy / balanced / slider_base profiles
  ext/src/com/bikemaps/       Java extension: custom encoded values and import entry point
infra/
  graphhopper.Dockerfile      Self-contained GraphHopper image (downloads JAR, compiles the
                              extension, imports the graph on first start if absent)
  api.Dockerfile              Multi-stage build of the frontend and API
  docker-compose.yml          Caddy + API + GraphHopper (raw VPS deployment)
  docker-compose.dokploy.yml  API + GraphHopper for a Dokploy / Traefik host
  DEPLOY.md                   Deployment runbook
scripts/                      Windows PowerShell helpers: download, pipeline, import, run, test
data/                         (git-ignored) OSM extracts, graph-cache, SRTM tiles, SQLite DB
```

The `data/` directory and the GraphHopper JAR are intentionally excluded from version control; they are build artefacts and large binaries, not source.

---

## Running it locally

**Prerequisites:** Java 21 JDK (the import needs `javac`), Python 3.11+ with `pyosmium`, Node.js 22, roughly 10 GB of free disk and 16 GB of RAM (the national import uses a 9 GB heap; the server runs with 6 GB).

Prepare the graph (once):

```powershell
scripts\download-data.ps1    # download the Italy PBF and the GraphHopper JAR
scripts\run-pipeline.ps1     # compute fun tags and POIs -> italy-fun.osm.pbf (~45 min)
scripts\import.ps1           # build the graph with custom encoded values + LM (~30 min)
scripts\start-server.ps1     # start GraphHopper on http://localhost:8989
```

Run the web client and API in development (Vite proxies `/gh` and `/api`):

```powershell
cd web; npm install; npm run dev     # http://localhost:5173
cd ..\api; npm install; npm run dev  # API on http://localhost:8790
```

Production-style single process (the API serves the built SPA and proxies routing):

```powershell
cd web; npm run build
cd ..\api; npm install; npm run build; npm start   # everything on http://localhost:8790
```

Example routing request:

```
GET /gh/route?point=45.070,7.686&point=45.737,7.315&profile=curvy&points_encoded=false
```

---

## Deployment

The application is packaged for a single-command deployment on a small VPS. The GraphHopper image is self-contained: it downloads the official JAR at build time, compiles the custom encoded-value extension, and on first start either serves an existing graph-cache or, if only the enriched PBF is present, imports the graph itself. The only state on the server is the mounted data directory (graph, PBF, SQLite database, elevation cache).

Two compose files are provided:

- `infra/docker-compose.yml` — Caddy (automatic TLS) plus the API and GraphHopper, for a plain Docker host.
- `infra/docker-compose.dokploy.yml` — the API and GraphHopper wired into a Dokploy-managed Traefik proxy, which handles domains and certificates.

The reference target is an Oracle Cloud Ampere A1 instance (Arm64, 4 vCPU, 24 GB RAM). All images are multi-architecture, so the same setup runs on x86 and Arm. The full runbook, including the map-data transfer strategy, is in [infra/DEPLOY.md](infra/DEPLOY.md).

---

## Validation and benchmarks

The scoring and routing behaviour is validated quantitatively rather than by eye. The guard metric is the distance-weighted average of `fun_curvature` along a route (`scripts\fun-report.ps1`), plus the ratio of curvy travel time to fast travel time.

- **Turin to Aosta:** the fast profile scores 1.3 (takes the A5 motorway, 1% curvy kilometres); the curvy profile scores 17.9 (takes the SS565 and SS26 valley roads, 16% curvy kilometres, +2600 m of climbing). The time ratio stays at or below 2x.
- **Milan to Varese:** fast 41 min, balanced 58 min (1.4x), max-curve 76 min (1.9x).
- **Milan to Rome (719 km):** the curvy route is computed in about 1.5 seconds thanks to landmark preparation, confirming the design scales to national, long-distance queries.
- **Spot checks:** known passes such as Colle San Carlo score 58–67; straight urban arterials and motorways score 0, confirming the Douglas-Peucker noise fix.

---

## Engineering highlights

- **Custom routing metrics without forking the engine.** Curvature and signal density are injected as first-class GraphHopper encoded values through a small Java import extension; the runtime server is the unmodified official JAR, which reconstructs the encoded values from graph metadata.
- **Geometry noise handling.** Douglas-Peucker simplification at a 2-metre tolerance eliminates the false curvature that GPS jitter in OSM geometries would otherwise produce — the difference between a usable and an unusable score.
- **National scale kept fast.** Landmark preparation for every profile keeps flexible, penalty-based queries responsive across the entire Italian graph, including 700 km routes.
- **A continuous preference dial.** Instead of a handful of fixed profiles, the client sends a per-request custom model layered over a neutral base profile, giving a smooth Direct ↔ Fun slider without re-importing the graph.
- **Self-contained, reproducible deployment.** The GraphHopper container builds itself and imports the graph on first run, so a fresh server needs only Docker and the map data — no toolchain, no manual JAR handling.

---

## Roadmap

- Persist the exact slider level with saved routes (the current schema maps it to the nearest named profile).
- Optimise long-route slider latency with an anchor-based set of base profiles.
- GPX import.
- Authentication and multi-user support, migrating persistence from SQLite to PostGIS.

---

## Attribution and licence

Routing data is derived from OpenStreetMap, © OpenStreetMap contributors, available under the Open Database License (ODbL). Map tiles are served by OpenFreeMap; geocoding by Photon (Komoot); elevation from SRTM. Routing by GraphHopper.
