/**
 * Set di icone SVG (stile Lucide, un'unica famiglia: stroke 1.75, currentColor,
 * viewBox 24). Sostituisce le emoji con vettoriali coerenti e tematizzabili.
 * `Icon` per l'uso in JSX; `iconMarkup` per le stringhe HTML (popup MapLibre).
 */
export type IconName =
  | 'route'
  | 'shuffle'
  | 'x'
  | 'mountain'
  | 'bookmark'
  | 'check'
  | 'camera'
  | 'fuel'
  | 'curve'
  | 'arrowUpRight'
  | 'folder'
  | 'chevronDown'
  | 'chevronRight'
  | 'repeat'
  | 'arrowRight'
  | 'link'
  | 'trash';

// inner markup (paths) di ogni icona
const PATHS: Record<IconName, string> = {
  route:
    '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  shuffle:
    '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  fuel:
    '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  // due nodi uniti da un arco: "percorso in curva" (badge fun-score)
  curve: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M7.8 16.2A10 10 0 0 1 16.2 7.8"/>',
  arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
};

interface IconProps {
  name: IconName;
  size?: number;
  color?: string; // sovrascrive currentColor (icone POI colorate per categoria)
  label?: string; // se presente → icona semantica con aria-label; altrimenti decorativa
  className?: string;
}

export function Icon({ name, size = 16, color, label, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={color ? { color } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

/** Variante stringa per le HTML injectate (es. popup MapLibre). */
export function iconMarkup(name: IconName, opts: { size?: number; color?: string } = {}): string {
  const { size = 16, color } = opts;
  const style = color ? ` style="color:${color}"` : '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"${style}>${PATHS[name]}</svg>`;
}
