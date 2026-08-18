/** Renderiza um ícone SVG a partir do markup interno (registry em lib/token-icons). */
export function Icon({ inner, size = 18 }: { inner: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
