import { useEffect, useState } from 'react';
import { deleteRoute, listRoutes, shareUrl } from '../saved';
import type { SavedRouteSummary } from '../saved';
import { Icon } from './Icon';

interface Props {
  refreshKey: number; // incrementato dopo ogni salvataggio
  onLoad: (id: string) => void;
}

function fmtTime(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}m`;
}

export default function SavedRoutes({ refreshKey, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedRouteSummary[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listRoutes()
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, refreshKey]);

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Copia il link:', shareUrl(id));
    }
  };

  const remove = async (id: string) => {
    await deleteRoute(id).catch(() => undefined);
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="saved">
      <button className="saved-toggle" onClick={() => setOpen(!open)}>
        <Icon name="folder" size={15} /> I miei giri{' '}
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
      </button>
      {open && (
        <ul className="saved-list">
          {items.length === 0 && <li className="saved-empty">Nessun giro salvato.</li>}
          {items.map((r) => (
            <li key={r.id}>
              <button className="saved-name" onClick={() => onLoad(r.id)} title="Apri questo giro">
                <strong>{r.name}</strong>
                <span>
                  <Icon name={r.mode === 'loop' ? 'repeat' : 'arrowRight'} size={12} />{' '}
                  {(r.distance / 1000).toFixed(0)} km · {fmtTime(r.timeMs)} · <Icon name="curve" size={12} />{' '}
                  {r.funAvg.toFixed(0)}
                </span>
              </button>
              <button title="Copia link condivisibile" onClick={() => copy(r.id)}>
                <Icon name={copied === r.id ? 'check' : 'link'} size={14} label={copied === r.id ? 'Link copiato' : 'Copia link'} />
              </button>
              <button title="Elimina" onClick={() => remove(r.id)}>
                <Icon name="trash" size={14} label="Elimina giro" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
