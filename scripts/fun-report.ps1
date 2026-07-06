# Report "punteggio divertimento" di un percorso: confronta fast vs curvy
# usando i path details di fun_curvature (media pesata sulla distanza e
# % di km su strade curve). Primo embrione del fun-score dell'app.
param(
    [string]$From = "45.070,7.686",   # Torino
    [string]$To   = "45.737,7.315",   # Aosta
    [string]$BaseUrl = "http://localhost:8989"
)

function Get-SegmentKm($p1, $p2) {
    $lat1 = $p1[1] * [math]::PI / 180; $lat2 = $p2[1] * [math]::PI / 180
    $dlat = $lat2 - $lat1; $dlon = ($p2[0] - $p1[0]) * [math]::PI / 180
    $a = [math]::Sin($dlat/2)*[math]::Sin($dlat/2) + [math]::Cos($lat1)*[math]::Cos($lat2)*[math]::Sin($dlon/2)*[math]::Sin($dlon/2)
    return 6371.0 * 2 * [math]::Atan2([math]::Sqrt($a), [math]::Sqrt(1-$a))
}

foreach ($profile in "fast", "curvy") {
    $url = "$BaseUrl/route?point=$From&point=$To&profile=$profile&points_encoded=false&instructions=false&details=fun_curvature"
    $res = Invoke-RestMethod -Uri $url -TimeoutSec 120
    $path = $res.paths[0]
    $pts = $path.points.coordinates

    # distanza cumulativa per indice punto
    $cum = New-Object double[] ($pts.Count)
    for ($i = 1; $i -lt $pts.Count; $i++) {
        $cum[$i] = $cum[$i-1] + (Get-SegmentKm $pts[$i-1] $pts[$i])
    }

    $totKm = $cum[$pts.Count - 1]
    $wsum = 0.0; $curvyKm = 0.0
    foreach ($d in $path.details.fun_curvature) {
        $km = $cum[$d[1]] - $cum[$d[0]]
        $val = if ($null -eq $d[2]) { 0 } else { $d[2] }
        $wsum += $km * $val
        if ($val -ge 45) { $curvyKm += $km }
    }

    $avg = if ($totKm -gt 0) { [math]::Round($wsum / $totKm, 1) } else { 0 }
    $pct = if ($totKm -gt 0) { [math]::Round(100 * $curvyKm / $totKm, 1) } else { 0 }
    $min = [math]::Round($path.time / 60000, 0)
    Write-Host ("{0,-5}: {1,6:N1} km  {2,4} min  fun_curvature medio: {3,5}  km 'curvy' (>=45): {4}%" -f $profile, $totKm, $min, $avg, $pct)
}
