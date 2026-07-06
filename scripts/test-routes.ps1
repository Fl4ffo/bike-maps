# Confronta i profili fast vs curvy sui percorsi di riferimento.
# Metrica di guardia: se tempo_curvy / tempo_fast > ~2x il profilo sta degenerando.
param([string]$BaseUrl = "http://localhost:8989")

$routes = @(
    @{ name = "Torino -> Aosta (atteso: fast=A5, curvy=SS26/valli)"; from = "45.070,7.686"; to = "45.737,7.315" },
    @{ name = "Bormio -> Ponte di Legno (atteso: curvy=Passo Gavia)"; from = "46.466,10.370"; to = "46.259,10.510" },
    @{ name = "Milano -> Varese (test pianura/urbano)"; from = "45.464,9.190"; to = "45.820,8.825" }
)

foreach ($r in $routes) {
    Write-Host ""
    Write-Host "=== $($r.name) ==="
    $times = @{}
    foreach ($p in "fast", "curvy") {
        $url = "$BaseUrl/route?point=$($r.from)&point=$($r.to)&profile=$p&instructions=false&points_encoded=false"
        try {
            $res = Invoke-RestMethod -Uri $url -TimeoutSec 120
            $path = $res.paths[0]
            $km  = [math]::Round($path.distance / 1000, 1)
            $min = [math]::Round($path.time / 60000, 0)
            $asc = [math]::Round($path.ascend, 0)
            $times[$p] = $path.time
            Write-Host ("  {0,-5}: {1,6} km  {2,4} min  +{3,5} m dislivello" -f $p, $km, $min, $asc)
        } catch {
            Write-Host "  $p : ERRORE - $($_.Exception.Message)"
        }
    }
    if ($times.Count -eq 2 -and $times["fast"] -gt 0) {
        $ratio = [math]::Round($times["curvy"] / $times["fast"], 2)
        Write-Host "  rapporto tempo curvy/fast: ${ratio}x"
    }
}
