import { useMemo, useRef, useState } from 'react';
import type { RoutePath } from '../api';
import { cumulativeKm } from '../score';

/** primo indice con cum[i] >= km (ricerca binaria) */
function lowerBound(cum: number[], km: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const W = 600;
const H = 120;
const PAD = 4;
const MAX_POINTS = 400;

interface Props {
  path: RoutePath;
  color: string;
  onHover?: (coordIndex: number | null) => void; // indice nella geometria originale
}

export default function ElevationChart({ path, color, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const { line, area, minEle, maxEle, totalKm, cum } = useMemo(() => {
    const coords = path.points.coordinates;
    const cum = cumulativeKm(coords);
    const total = cum.length > 0 ? cum[cum.length - 1] : 0;

    const step = Math.max(1, Math.floor(coords.length / MAX_POINTS));
    const pts: [number, number][] = [];
    for (let i = 0; i < coords.length; i += step) pts.push([cum[i], coords[i][2] ?? 0]);
    const last = coords.length - 1;
    if (last >= 0 && last % step !== 0) pts.push([cum[last], coords[last][2] ?? 0]);

    let minE = Infinity;
    let maxE = -Infinity;
    for (const [, e] of pts) {
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
    }
    if (!Number.isFinite(minE)) {
      minE = 0;
      maxE = 50;
    }
    if (maxE - minE < 50) maxE = minE + 50; // scala verticale minima

    const x = (km: number) => PAD + (total > 0 ? km / total : 0) * (W - 2 * PAD);
    const y = (e: number) => H - PAD - ((e - minE) / (maxE - minE)) * (H - 2 * PAD);
    const lineD = pts.map(([km, e], i) => `${i ? 'L' : 'M'}${x(km).toFixed(1)},${y(e).toFixed(1)}`).join(' ');
    const areaD = `${lineD} L${x(total).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

    return { line: lineD, area: areaD, minEle: Math.round(minE), maxEle: Math.round(maxE), totalKm: total, cum };
  }, [path]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverFrac(frac);
    onHover?.(lowerBound(cum, frac * totalKm));
  };

  const handleLeave = () => {
    setHoverFrac(null);
    onHover?.(null);
  };

  const hx = hoverFrac != null ? PAD + hoverFrac * (W - 2 * PAD) : null;
  const hoverEle = hoverFrac != null ? Math.round(path.points.coordinates[lowerBound(cum, hoverFrac * totalKm)]?.[2] ?? 0) : null;

  return (
    <div className="elevation">
      <div className="elevation-head">
        <span>Profilo altimetrico</span>
        <span>
          {hoverFrac != null
            ? `km ${(hoverFrac * totalKm).toFixed(0)} · ${hoverEle} m`
            : `${minEle}–${maxEle} m · ${totalKm.toFixed(0)} km`}
        </span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <path d={area} fill={color} opacity="0.15" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" />
        {hx != null && <line x1={hx} y1={0} x2={hx} y2={H} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />}
      </svg>
    </div>
  );
}
