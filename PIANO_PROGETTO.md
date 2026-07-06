# Bike Maps — Piano di progetto

> Web app di navigazione stile Google Maps, ma con obiettivo inverso: calcolare il percorso più **divertente** (non il più veloce) da fare in moto o in macchina. Target: motogiri, giri della domenica, guida per il piacere di guidare.

## Contesto e vincoli

- Progetto personale/hobbistico, ma con base solida e scalabile.
- Piattaforma: **web app** (browser desktop + mobile), no app nativa per ora.
- Sviluppatore singolo con esperienza alta.
- Google Maps API escluse: l'algoritmo di routing è chiuso e non personalizzabile.

## Prior art da studiare (non partire da zero concettualmente)

- **Kurviger** — routing curvy per moto; nato su un BRouter modificato, oggi su GraphHopper. Il benchmark di riferimento.
- **Calimoto**, **Riser**, **Scenic** — competitor proprietari, utili per benchmarking feature.
- **roadcurvature.com** (Adam Franco, open source) — l'algoritmo di calcolo curvatura di riferimento; la logica va portata nella pipeline dati.

---

## 1. Stack tecnologico

| Layer | Scelta | Perché |
|---|---|---|
| Frontend | React + TypeScript + Vite, **MapLibre GL JS** | Fork open di Mapbox GL: vector tiles WebGL, ottimo su mobile browser, zero lock-in |
| Grafico altimetrico | Recharts o d3 | Il profilo altimetrico è feature core |
| PWA | Workbox / vite-plugin-pwa | Installabilità + caching per connessione debole |
| Routing engine | **GraphHopper** (Java, self-hosted, Docker) | Vedi sezione 2. Servizio interno, non esposto direttamente |
| API layer | Node/TypeScript (Fastify) | Layer sottile: proxy verso GraphHopper, CRUD percorsi, auth |
| Database | **PostgreSQL + PostGIS** | Percorsi (LineString), POI, utenti, query spaziali |
| Pipeline dati | Python + osmium/pyosmium + Shapely | Il precalcolo del fun-score vive qui, fuori dal routing engine |
| Tiles mappa | **OpenFreeMap** (hosted gratis) o **PMTiles/Protomaps** su Cloudflare R2 | Costo ~zero anche a scala |
| Elevazione | Copernicus GLO-30 DEM (gratuito, 30 m globale) | GraphHopper lo consuma nativamente |
| Geocoding | **Photon** (istanza pubblica Komoot, o self-host) | Nominatim pubblico ha rate limit stretti |
| Hosting | Hetzner VPS + Docker Compose + Caddy | Il routing engine vuole RAM, non serverless |

## 2. Architettura

Architettura a **due tempi**: pipeline batch offline che arricchisce i dati OSM, e runtime che ci fa routing sopra.

```
[Geofabrik PBF] → [Pipeline Python: curvatura, semafori, urbanizzato,
                   superficie → riscrive il PBF con tag custom fun:*]
                → [GraphHopper import: tag custom → encoded values + DEM]
                → [GraphHopper server] ← [API Fastify] ← [PWA MapLibre]
                                          [PostGIS: utenti, percorsi, POI]
```

### Confronto routing engine (decisione: GraphHopper)

- **BRouter** — cost function interamente scriptabili (DSL), gestisce l'altimetria, Kurviger è nato così. Contro: DSL scomodo, progetto mono-maintainer orientato alla bici, performance mediocri su percorsi auto lunghi, e soprattutto non permette di arricchire il grafo con dati propri (curvatura precalcolata) in modo pulito. Ottimo per prototipare un weekend, sbagliato come fondamenta.
- **OSRM** — velocissimo, ma pesi cotti nel preprocessing (profili Lua a import time): ogni modifica alla cost function = re-preprocess. Incompatibile con slider per-utente.
- **Valhalla** — costing dinamico a runtime, grafo a tile (scala bene), elevazione integrata. Ma un costing "fun" custom = scrivere/forkare C++.
- **GraphHopper** ✅ — fit migliore per tre motivi:
  1. I **custom model** sono JSON valutati a runtime (`priority`, `speed` condizionati su encoded values) → lo slider "quanto curvy" diventa un parametro per-richiesta.
  2. Ha già un encoded value `curvature` nativo (rapporto distanza in linea d'aria / lunghezza arco).
  3. Permette **encoded values custom** letti da tag OSM arbitrari → il canale per iniettare il fun-score precalcolato (serve un piccolo modulo Java, ~100 righe).

## 3. Algoritmo del "percorso divertente"

**Principio chiave:** non inventare una funzione obiettivo nuova — modificare i pesi di Dijkstra. Il divertimento va espresso come *sconto sul costo* degli archi divertenti, non come quantità da massimizzare, altrimenti l'ottimo degenera (loop sui tornanti, deviazioni assurde).

### Dati per arco (precalcolati dalla pipeline)

1. **Curvatura** — dalla sola geometria della way (affidabile ovunque). Algoritmo alla roadcurvature: per ogni tripla di punti consecutivi si calcola il raggio del cerchio circoscritto, si classifica in bucket (<30 m tornante, 30–75 m stretta, 75–175 m media, 175–450 m ampia), si sommano le lunghezze pesate per bucket → indice curve/km. Nota moto: curve medie in sequenza spesso valgono più dei tornanti puri → tenere i bucket come componenti separate, pesi regolabili per profilo.
2. **Altimetria** — dal DEM: dislivello/km e varianza. Bonus esplicito per nodi `mountain_pass=yes` (i passi sono oro per il target).
3. **Classe strada** — da `highway`: premia secondary/tertiary, penalizza fortemente motorway/trunk e residential/unclassified urbane.
4. **Superficie** — `surface`, `smoothness`, `tracktype`. Copertura OSM lacunosa: serve default per classe strada; trattarla come *penalità quando nota cattiva*, non bonus quando nota buona.
5. **Densità interruzioni** — nodi `highway=traffic_signals`, `stop`, rotonde, incroci per km.
6. **Contesto urbano** — in PostGIS: frazione dell'arco entro poligoni `landuse=residential/industrial/commercial`. Proxy statico del traffico, gratis ed efficace. Traffico real-time → fase 3.

### Formula (per arco)

```
fun ∈ [0,1] = w1·curviness + w2·elevation + w3·road_class
            + w4·surface − w5·signals − w6·urban        (pesi = profilo utente)

costo = tempo_percorrenza / (1 + k·fun)    con k ≈ 0.5–1.5 (lo slider)
```

Lo sconto è **limitato** (mai oltre ~50–60%): il percorso resta ancorato al tempo e le deviazioni hanno un tetto naturale. In GraphHopper si esprime direttamente:
`priority: [{ if: "fun_score > 0.8", multiply_by: 1.5 }, ...]` su un encoded value `fun_score` custom.

### Accorgimenti pratici

- Esporre all'utente **un solo slider** "diretto ↔ divertente" che mappa su `k`, non sei slider.
- Per validare i pesi: generare 3–5 alternative (supportate da GraphHopper) e mostrare il fun-score di ciascuna. Il punteggio aggregato del percorso (curve/km, dislivello, % strade panoramiche) è comunque una feature UI da avere.
- Metrica di guardia: rapporto deviazione (tempo fun / tempo veloce) sempre sotto controllo nei test.

## 4. Funzionalità: MVP vs fasi successive

### MVP (usabile in prima persona, una regione — es. Nord Italia)

- Mappa MapLibre, partenza/arrivo/waypoint intermedi
- Routing con 3 profili preset (diretto / bilanciato / max curve) + slider
- Fun-score del percorso con breakdown, profilo altimetrico, distanza/tempo
- Confronto visivo col percorso veloce (le due linee sulla mappa)
- **Export GPX** — critico: ponte verso i navigatori veri (OsmAnd, Garmin, Kurviger app) finché non c'è turn-by-turn
- Responsive mobile. Niente account, niente login.

### Fase 2

- Account, salvataggio/condivisione percorsi (link pubblici)
- **Round-trip**: "giro di 3 ore partendo da qui" — GraphHopper ha l'algoritmo `round_trip`; combinato col fun-score è la killer feature per il giro della domenica
- POI lungo il percorso (viewpoint, passi, aree sosta — via PostGIS)
- Import GPX, copertura Italia intera, rating community sui tratti di strada

### Fase 3

- Turn-by-turn nel browser (wake lock + geolocation)
- Mappe offline (PMTiles regionali in OPFS)
- Traffico real-time (TomTom API)
- Copertura EU, segnalazioni fondo stradale dagli utenti, eventuale app nativa

## 5. Roadmap tecnica passo-passo

1. **Weekend 1 — validare il concetto.** GraphHopper in Docker con estratto Geofabrik Nord-Ovest; custom model che usa il `curvature` nativo e penalizza motorway/urban. Test con la UI inclusa di GraphHopper. Zero codice: solo un JSON di profilo. Se i percorsi fanno venire voglia di uscire in moto, il progetto ha senso.
2. **Settimane 1–3 — pipeline fun-score.** Script Python/osmium: legge il PBF, calcola curvatura (porting della logica roadcurvature), densità semafori, urbanizzato; riscrive il PBF con tag `fun:*`. Modulo Java per l'encoded value custom in GraphHopper. **È il cuore del progetto**, dove si itererà di più.
3. **Settimane 3–5 — frontend.** App MapLibre: marker, chiamata API, disegno percorso + alternativa veloce, profilo altimetrico, export GPX, slider.
4. **Settimana 6 — API + deploy.** Fastify davanti a GraphHopper, Docker Compose su Hetzner, Caddy, tiles da OpenFreeMap. Da qui usabile in giro dal telefono.
5. **Taratura sul campo.** Fare i giri già noti, confrontare i suggerimenti dell'app con l'esperienza reale, aggiustare i pesi. Questo loop vale più di qualsiasi feature.
6. **Fase 2** nell'ordine: Postgres+auth → round-trip → POI → condivisione.

## 6. Sfide tecniche e colli di bottiglia

- **Custom model vs Contraction Hierarchies.** Trade-off centrale di GraphHopper: profili fissi → CH (query in ms); parametri per-richiesta (slider) → modalità hybrid/LM, ~10–100× più lenta. Strategia: CH per i 3 preset, LM per lo slider fine, limite di distanza (~500 km) sulle richieste flessibili.
- **RAM e tempi di import.** Italia: decine di minuti, ~4–8 GB heap → VPS da 16 GB. Europa: ore di import, 32–64 GB. Pianificare per-regione, non "il mondo".
- **Degenerazione della funzione obiettivo.** Trappola n.1: senza sconto limitato si ottengono percorsi che rifanno tre volte lo stesso passo. Testare sempre col rapporto deviazione sotto controllo.
- **Qualità dati OSM.** Curvatura derivata dalla geometria → solida ovunque. `surface`/`smoothness` → coperti forse al 30–50% sulle strade rilevanti. Traffico → non esiste in OSM. Il punteggio deve degradare con grazia quando i tag mancano.
- **Offline su web: limiti reali.** PWA + PMTiles regionali in OPFS funziona per *consultare* la mappa con connessione debole. Ma iOS Safari può evictare lo storage dopo 7 giorni di non uso, il GPS non funziona a schermo spento, niente background. "Connessione debole" → raggiungibile; "navigatore offline vero" → servirà app nativa. Ponte pragmatico: export GPX verso OsmAnd.
- **Costi.** Quasi tutti fissi e bassi: VPS 15–40 €/mese, tiles ~0 (OpenFreeMap/PMTiles), DEM gratuito, niente API a consumo. Vantaggio chiave dello stack self-hosted: crescere di utenti non fa esplodere la bolletta. Obbligo: attribuzione ODbL a OSM.

---

## Prossimo passo immediato

Punto 1 della roadmap: `docker-compose.yml` con GraphHopper, custom model JSON "max curve" iniziale, download estratto Geofabrik Nord-Ovest Italia, test con la UI di GraphHopper su percorsi noti.
