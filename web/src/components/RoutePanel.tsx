import type { ProfileId, RoutePath } from '../api';
import { computeFunScore } from '../score';

const LABEL: Record<ProfileId, string> = { fast: 'Veloce', curvy: 'Divertente' };

function fmtTime(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`;
}

interface Props {
  profile: ProfileId;
  path: RoutePath;
  selected: boolean;
  onSelect: () => void;
  onGpx: () => void;
}

export default function RoutePanel({ profile, path, selected, onSelect, onGpx }: Props) {
  const score = computeFunScore(path);
  return (
    <div className={`card ${profile}${selected ? ' selected' : ''}`} onClick={onSelect}>
      <div className="card-head">
        <span className="dot" />
        <strong>{LABEL[profile]}</strong>
        <span className="fun-badge" title="fun_curvature medio pesato sulla distanza (0-100)">
          🌀 {score.avg.toFixed(0)}
        </span>
      </div>
      <div className="card-stats">
        <span>{(path.distance / 1000).toFixed(1)} km</span>
        <span>{fmtTime(path.time)}</span>
        <span>↗ {Math.round(path.ascend)} m</span>
        <span>{score.curvyPct.toFixed(0)}% curve</span>
      </div>
      <button
        className="gpx"
        onClick={(e) => {
          e.stopPropagation();
          onGpx();
        }}
      >
        Esporta GPX
      </button>
    </div>
  );
}
