# Deploy su VPS (Hetzner)

Stack: Caddy (TLS automatico) → API Fastify (frontend statico + proxy `/gh`) → GraphHopper. Tutto in Docker Compose, costi fissi ~10-20 €/mese.

**Tutto il codice sta dentro le immagini** (build dal compose): il JAR di GraphHopper viene scaricato in fase di build e l'estensione EV custom (`com.bikemaps.FunScoreImport`) compilata. Sul server serve solo la cartella `data/` col dato. Il container GraphHopper è idempotente: se trova `data/graph-cache` avvia diretto, se trova solo `data/italy-fun.osm.pbf` **importa da solo** al primo avvio, altrimenti esce con errore esplicito.

## 1. Server

- **Hetzner CX42 o CPX41** (8 vCPU, 16 GB RAM, ~17 €/mese): necessario per servire l'Italia intera con LM (heap 6 GB, già impostato nel compose).
- Import/pipeline direttamente sul server: sconsigliato sotto i 16 GB; meglio preparare in locale e caricare con rsync (graph-cache ~2,5 GB).
- OS: Ubuntu 24.04. Docker: `curl -fsSL https://get.docker.com | sh`.
- Firewall: `ufw allow 22,80,443/tcp && ufw enable`.

## 2. Dati — due strategie

Il JAR e l'estensione Java NON vanno più caricati a mano: sono nell'immagine.
Va portato solo il dato in `data/`. Due opzioni:

**A) Grafo già importato (consigliata, VPS anche piccolo)** — prepari in locale
e carichi la cache pronta: il container avvia in pochi secondi, nessun import.

```bash
git clone <repo> bike_maps && cd bike_maps   # sul server
# dal PC locale:
rsync -avz --progress data/graph-cache/ user@server:~/bike_maps/data/graph-cache/
rsync -avz --progress data/pois.json     user@server:~/bike_maps/data/
```

**B) Solo PBF arricchito (import sul server)** — carichi il solo
`italy-fun.osm.pbf` (~1,3 GB) e il container GraphHopper importa da solo al
primo `up` (~30 min, servono **16 GB RAM**). Comodo se non vuoi trasferire i
2,5 GB del graph-cache.

```bash
rsync -avz --progress data/italy-fun.osm.pbf user@server:~/bike_maps/data/
rsync -avz --progress data/pois.json         user@server:~/bike_maps/data/
```

In entrambi i casi `data/bikemaps.db` (giri salvati) e `data/elevation-cache`
si creano da soli. Il grafo, se assente ma con PBF presente, si ricostruisce.

## 3. Dominio e TLS

- DNS: record A del dominio → IP del server.
- In `infra/Caddyfile` sostituire `:80` col dominio. Caddy ottiene e rinnova
  Let's Encrypt da solo. Senza dominio: lasciare `:80` (HTTP su IP).

## 4. Avvio

```bash
cd bike_maps/infra
docker compose up -d --build
docker compose logs -f graphhopper   # opzione A: "loaded graph" in pochi s
                                     # opzione B: prima ">> importo dal PBF..." (~30 min)
curl -s localhost/api/health         # {"status":"ok","graphhopper":"ok",...}
```

Al primo avvio Docker scarica il JAR e compila l'estensione (una volta sola,
poi in cache). Con l'opzione B l'health resta `graphhopper:"unreachable"`
finché l'import non finisce — è normale.

## 5. Aggiornamenti

- **Nuovo codice frontend/API**: `git pull && docker compose up -d --build api`
- **Nuovi dati OSM o pesi pipeline**: rieseguire in locale `run-pipeline.ps1` +
  `import.ps1`, ri-rsync di `data/graph-cache`, poi
  `docker compose restart graphhopper` (oppure: ri-rsync del solo
  `italy-fun.osm.pbf`, `rm -rf data/graph-cache` sul server e restart → reimporta)
- **Pesi curvy.json**: `git pull && docker compose restart graphhopper`
  (nessun re-import: profilo flessibile)

## Note

- GraphHopper non pubblica porte: è raggiungibile solo dagli altri container.
- Il codice è tutto nelle immagini: sul server NON servono JDK, Python né il
  JAR a mano. Solo Docker e la cartella `data/`.
- La UI di debug di GraphHopper resta disponibile via proxy: `https://dominio/gh/maps/`.
- Questo stack NON è ancora stato provato su un VPS reale (sulla macchina di
  sviluppo manca Docker): alla prima installazione verificare i log del
  compose. L'API e il layout dei volumi sono però identici alla modalità
  locale già testata (`node api/dist/server.js` + jar).
