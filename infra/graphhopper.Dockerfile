# Immagine GraphHopper self-contained: JAR + config + estensione EV custom
# (com.bikemaps.FunScoreImport) tutti dentro l'immagine. NIENTE bind-mount del
# codice: sul VPS si monta solo ../data (grafo + pbf + db).
#
# All'avvio l'entrypoint:
#   - se data/graph-cache e' gia' importato  -> avvia solo il server
#   - altrimenti se c'e' data/italy-fun.osm.pbf -> importa (FunScoreImport) e avvia
#   - altrimenti -> errore esplicito (manca il dato)
#
# JDK (non JRE): serve javac per compilare l'estensione e per l'import custom.
FROM eclipse-temurin:21-jdk

ARG GH_VERSION=11.0
ENV GH_JAR=graphhopper-web-${GH_VERSION}.jar
WORKDIR /app/graphhopper

# JAR ufficiale (ADD scarica l'URL remoto: niente curl nell'immagine)
ADD https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar ./${GH_JAR}

# config + sorgenti dell'estensione EV custom
COPY graphhopper/config.yml ./config.yml
COPY graphhopper/ext/src ./ext/src

# compila fun_curvature/fun_signals una volta sola in fase di build
RUN javac -cp "${GH_JAR}" -d ext/classes ext/src/com/bikemaps/*.java

COPY infra/graphhopper-entrypoint.sh /usr/local/bin/gh-entrypoint.sh
RUN chmod +x /usr/local/bin/gh-entrypoint.sh

# heap: import ~9 GB (Italia+LM), serve ~6 GB. Override via env nel compose.
ENV IMPORT_HEAP=9g SERVE_HEAP=6g

EXPOSE 8989
ENTRYPOINT ["/usr/local/bin/gh-entrypoint.sh"]
