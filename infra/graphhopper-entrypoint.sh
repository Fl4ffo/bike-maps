#!/usr/bin/env bash
# Avvio idempotente di GraphHopper nel container.
# La cache del grafo (~2,5 GB) vive sul volume ../data, non nell'immagine:
# se manca ma c'e' il PBF arricchito, la si costruisce qui (import custom).
set -euo pipefail

GH_JAR="${GH_JAR:-graphhopper-web-11.0.jar}"
CACHE_DIR="/app/data/graph-cache"
PBF="/app/data/italy-fun.osm.pbf"
IMPORT_HEAP="${IMPORT_HEAP:-9g}"
SERVE_HEAP="${SERVE_HEAP:-6g}"

# graph-cache valido = ha il file properties (scritto a fine import)
if [ ! -f "${CACHE_DIR}/properties" ]; then
  if [ -f "${PBF}" ]; then
    echo ">> graph-cache assente: importo dal PBF arricchito (heap ${IMPORT_HEAP}, puo' richiedere ~30 min)..."
    rm -rf "${CACHE_DIR}"
    java -Xmx"${IMPORT_HEAP}" -Xms4g \
      -cp "${GH_JAR}:ext/classes" \
      com.bikemaps.FunScoreImport config.yml
    echo ">> import completato."
  else
    echo "!! Nessun grafo e nessun PBF in /app/data." >&2
    echo "!! Fornire data/graph-cache/ (rsync del grafo importato in locale)" >&2
    echo "!! oppure data/italy-fun.osm.pbf (il container lo importa da solo)." >&2
    exit 1
  fi
else
  echo ">> graph-cache presente: avvio diretto (gli EV custom si ricostruiscono dalle properties)."
fi

echo ">> Avvio server GraphHopper (heap ${SERVE_HEAP})..."
exec java -Xmx"${SERVE_HEAP}" -Xms2g -jar "${GH_JAR}" server config.yml
