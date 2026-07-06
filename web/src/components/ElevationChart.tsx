import { useMemo } from 'react';
import type { RoutePath } from '../api';
import { cumulativeKm } from '../score';

const W = 600;
const H = 120;
const PAD = 4;
const MAX_POINTS = 400;

export default function ElevationChart({ path, color }: { path: RoutePath; color: string }) {
  const { line, area, minEle, maxEle, totalKm } = useMemo(() => {
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

    return { line: lineD, area: areaD, minEle: Math.round(minE), maxEle: Math.round(maxE), totalKm: total };
  }, [path]);

  return (
    <div className="elevation">
      <div className="elevation-head">
        <span>Profilo altimetrico</span>
        <span>
          {minEle}–{maxEle} m · {totalKm.toFixed(0)} km
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={area} fill={color} opacity="0.15" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" />
      </svg>
    </div>
  );
}
