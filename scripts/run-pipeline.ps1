# Esegue la pipeline fun-score: PBF originale -> PBF con tag fun:* (~10-25 min).
# Da rieseguire quando cambia il PBF sorgente o la logica in pipeline/fun_tags.py.
# Dopo la pipeline serve il re-import del grafo (scripts\import.ps1).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path "data\nord-ovest.osm.pbf")) { throw "PBF mancante: eseguire prima scripts\download-data.ps1" }

& pipeline\.venv\Scripts\python.exe pipeline\fun_tags.py data\nord-ovest.osm.pbf data\nord-ovest-fun.osm.pbf

Write-Host "Estrazione POI (passi, panorami, benzinai)..."
& pipeline\.venv\Scripts\python.exe pipeline\extract_pois.py data\nord-ovest.osm.pbf data\pois.json

Write-Host "Pipeline completata. Prossimo passo: scripts\import.ps1 (e riavvio API per ricaricare i POI)"
