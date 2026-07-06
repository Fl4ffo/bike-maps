# Importa il grafo GraphHopper dal PBF arricchito (~7 min, usa il main custom
# com.bikemaps.FunScoreImport per registrare gli encoded value fun_*).
# Da rieseguire se cambiano: il PBF arricchito (dopo run-pipeline.ps1),
# graph.encoded_values, la lista profili o QUALSIASI custom model (GH salva
# i profili nel graph-cache: al load "Profiles do not match" se differiscono).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $root "graphhopper")

if (-not (Test-Path "..\data\nord-ovest-fun.osm.pbf")) { throw "PBF arricchito mancante: eseguire prima scripts\run-pipeline.ps1" }

# ricompila l'estensione se serve
if (-not (Test-Path "ext\classes\com\bikemaps\FunScoreImport.class")) {
    Write-Host "Compilo l'estensione Java..."
    javac -cp graphhopper-web-11.0.jar -d ext/classes ext/src/com/bikemaps/*.java
}

if (Test-Path "..\data\graph-cache") {
    Write-Host "Rimuovo il graph-cache precedente..."
    Remove-Item -Recurse -Force "..\data\graph-cache"
}

java -Xmx6g -Xms2g -cp "graphhopper-web-11.0.jar;ext/classes" com.bikemaps.FunScoreImport config.yml
Write-Host "Import completato. Avviare con scripts\start-server.ps1"
