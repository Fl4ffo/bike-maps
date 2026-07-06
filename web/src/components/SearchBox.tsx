import { useEffect, useRef, useState } from 'react';
import type { LngLat } from '../api';
import { geocode } from '../photon';
import type { GeoResult } from '../photon';

interface Props {
  placeholder: string;
  bias?: LngLat;
  onPick: (r: GeoResult) => void;
}

export default function SearchBox({ placeholder, bias, onPick }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      geocode(q.trim(), bias, ctrl.signal)
        .then((r) => {
          setResults(r);
          setOpen(r.length > 0);
        })
        .catch(() => {
          /* ricerca fallita o annullata: nessun dropdown */
        });
    }, 300);
    return () => window.clearTimeout(debounceRef.current);
    // bias volutamente escluso: ricerca solo quando cambia il testo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pick = (r: GeoResult) => {
    onPick(r);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="search">
      <input
        type="text"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) pick(results[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
        onFocus={() => setOpen(results.length > 0)}
      />
      {open && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => pick(r)}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
