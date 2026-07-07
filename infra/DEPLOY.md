# Deploy su VPS (Hetzner)

Stack: Caddy (TLS automatico) → API Fastify (frontend statico + proxy `/gh`) → GraphHopper. Tutto in Docker Compose, costi fissi ~10-20 €/mese.

## 1. Server

- **Hetzner CX42 o CPX41** (8 vCPU, 16 GB RAM, ~17 €/mese): necessario per servire l'Italia intera con LM (heap 6 GB, già impostato nel compose).
- Import/pipeline direttamente sul server: sconsigliato sotto i 16 GB; meglio preparare in locale e caricare con rsync (graph-cache ~2,5 GB).
- OS: Ubuntu 24.04. Docker: `curl -fsSL https://get.docker.com | sh`.
- Firewall: `ufw allow 22,80,443/tcp && ufw enable`.

## 2. Dati (strategia consigliata: prepara in locale, carica sul server)

Il server NON ha bisogno di Python né dell'estensione Java: il graph-cache
importato è autosufficiente (gli encoded value custom si ricaricano dalle
properties della cache). Quindi:

```bash
# sul server
git clone <repo> bike_maps && cd bike_maps
curl -SL -o graphhopper/graphhopper-web-11.0.jar \
  https://github.com/graphhopper/graphhopper/releases/download/11.0/graphhopper-web-11.0.jar

# dal PC locale: carica il grafo già importato (~0.5 GB) e il PBF arricchito
rsync -avz --progress data/graph-cache/ user@server:~/bike_maps/data/graph-cache/
rsync -avz --progress data/italy-fun.osm.pbf user@server:~/bike_maps/data/
rsync -avz --progress data/pois.json user@server:~/bike_maps/data/   # POI (passi/panorami/benzinai)
```

(In alternativa si esegue pipeline + import sul server: servono 16 GB RAM,
Python 3.11+ con pyosmium e un JDK per compilare `graphhopper/ext`.)

## 3. Dominio e TLS

- DNS: record A del dominio → IP del server.
- In `infra/Caddyfile` sostituire `:80` col dominio. Caddy ottiene e rinnova
  Let's Encrypt da solo. Senza dominio: lasciare `:80` (HTTP su IP).

## 4. Avvio

```bash
cd bike_maps/infra
docker compose up -d --build
docker compose logs -f graphhopper   # attendere "loaded graph"
curl -s localhost/api/health         # {"status":"ok","graphhopper":"ok",...}
```

## 5. Aggiornamenti

- **Nuovo codice frontend/API**: `git pull && docker compose up -d --build api`
- **Nuovi dati OSM o pesi pipeline**: rieseguire in locale `run-pipeline.ps1` +
  `import.ps1`, ri-rsync di `data/graph-cache`, poi
  `docker compose restart graphhopper`
- **Pesi curvy.json**: `git pull && docker compose restart graphhopper`
  (nessun re-import: profilo flessibile)

## Note

- GraphHopper non pubblica porte: è raggiungibile solo dagli altri container.
- La UI di debug di GraphHopper resta disponibile via proxy: `https://dominio/gh/maps/`.
- Questo stack NON è ancora stato provato su un VPS reale (sulla macchina di
  sviluppo manca Docker): alla prima installazione verificare i log del
  compose. L'API e il layout dei volumi sono però identici alla modalità
  locale già testata (`node api/dist/server.js` + jar).
