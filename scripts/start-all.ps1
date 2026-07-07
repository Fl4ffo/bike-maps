# Avvia l'intero stack locale (GraphHopper + API) come processi indipendenti
# (sopravvivono alla chiusura del terminale). Idempotente: salta cio' che e' gia' su.
# Il frontend dev si avvia a parte:  cd web; npm run dev  -> http://localhost:5173
# In alternativa l'app buildata e' servita dall'API su http://localhost:3000
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

function Test-Port($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

if (Test-Port 8989) {
    Write-Host "GraphHopper gia' attivo (:8989)"
} else {
    if (-not (Test-Path (Join-Path $root "data\graph-cache"))) { throw "Grafo mancante: eseguire scripts\import.ps1" }
    Start-Process -WindowStyle Hidden -WorkingDirectory (Join-Path $root "graphhopper") java `
        -ArgumentList "-Xmx6g", "-Xms2g", "-jar", "graphhopper-web-11.0.jar", "server", "config.yml"
    Write-Host "GraphHopper in avvio su :8989 (il grafo Italia carica in ~1-2 min)"
}

if (Test-Port 3000) {
    Write-Host "API gia' attiva (:3000)"
} else {
    if (-not (Test-Path (Join-Path $root "api\dist\server.js"))) { throw "API non compilata: cd api; npm run build" }
    Start-Process -WindowStyle Hidden -WorkingDirectory (Join-Path $root "api") node -ArgumentList "dist/server.js"
    Write-Host "API in avvio su :3000"
}

Write-Host ""
Write-Host "App: http://localhost:3000  (dev con hot-reload: cd web; npm run dev)"
