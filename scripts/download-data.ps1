# Scarica (se mancanti) l'estratto OSM Nord-Ovest Italia e il JAR di GraphHopper 11.0
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$pbf = Join-Path $root "data\nord-ovest.osm.pbf"
if (-not (Test-Path $pbf)) {
    Write-Host "Scarico estratto OSM Nord-Ovest Italia (~500 MB)..."
    curl.exe -SL --retry 3 -o $pbf https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf
} else { Write-Host "PBF gia' presente: $pbf" }

$jar = Join-Path $root "graphhopper\graphhopper-web-11.0.jar"
if (-not (Test-Path $jar)) {
    Write-Host "Scarico GraphHopper 11.0..."
    curl.exe -SL --retry 3 -o $jar https://github.com/graphhopper/graphhopper/releases/download/11.0/graphhopper-web-11.0.jar
} else { Write-Host "JAR gia' presente: $jar" }

Write-Host "Fatto. Prossimo passo: scripts\import.ps1"
