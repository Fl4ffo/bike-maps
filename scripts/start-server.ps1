# Avvia il server GraphHopper su http://localhost:8989 (UI mappa: /maps/)
# Richiede il grafo gia' importato (scripts\import.ps1).
# Dopo una modifica a custom_models\curvy.json basta riavviare questo script.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $root "graphhopper")

if (-not (Test-Path "..\data\graph-cache")) { throw "Grafo mancante: eseguire prima scripts\import.ps1" }

java -Xmx4g -Xms1g -jar graphhopper-web-11.0.jar server config.yml
