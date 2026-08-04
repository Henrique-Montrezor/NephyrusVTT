/**
 * Ícones SVG (sem emojis) para o menu de contexto e para os badges na mesa.
 * viewBox 0 0 24 24. Ícones de ação usam currentColor; ícones de condição/badge
 * usam branco (para ficarem sobre um círculo colorido no token).
 */

/** Ícones de ação do menu (traço em currentColor). */
export const ICONS = {
  rename:
    '<path d="M4 20l1-4L15 6l3 3L8 19l-4 1Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M13.5 7.5l3 3" stroke="currentColor" stroke-width="1.4"/>',
  resize:
    '<path d="M9 3H4v5M15 21h5v-5M4 4l6 6M20 20l-6-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  lock:
    '<rect x="5.5" y="11" width="13" height="9" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  unlock:
    '<rect x="5.5" y="11" width="13" height="9" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 11V8a4 4 0 0 1 7-2.6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  light:
    '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M19.4 4.6l-1.7 1.7M6.3 17.7l-1.7 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  conditions:
    '<path d="M20.8 8.6a5 5 0 0 0-8.8-3 5 5 0 0 0-8.8 3c0 4.5 8.8 10.4 8.8 10.4s8.8-5.9 8.8-10.4Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4.5 12h3l1.4-3 2 6 1.4-3H20" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  hide:
    '<path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.8 3.2M6.5 7.6A15 15 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3.5-.7" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  reveal:
    '<path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  remove:
    '<path d="M5 7h14M10 7V5h4v2M6.5 7l.9 13h9.2l.9-13" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  back:
    '<path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  map:
    '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.3"/>',
  token:
    '<circle cx="12" cy="9" r="3.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  pdf:
    '<path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  audio:
    '<path d="M9 17V7l9-2v10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="7" cy="17" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="16" cy="15" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  doc:
    '<path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M14 3v4h4M9.5 12h5M9.5 15h5M9.5 9h2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  open:
    '<path d="M14 4h6v6M20 4l-8.5 8.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  image:
    '<rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="9" cy="10" r="1.6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M5 17l4.5-4.5L13 16l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
  share:
    '<circle cx="6" cy="12" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="17" cy="6" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="17" cy="18" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6" stroke="currentColor" stroke-width="1.5"/>',
  play:
    '<path d="M8 5l11 7-11 7Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  stop:
    '<rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  note:
    '<path d="M6 3h8l4 4v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M13 3v4h4M8 12h6M8 15h4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  plus:
    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  dots:
    '<circle cx="12" cy="5.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor"/>',
};

/** Monta um <svg> a partir do conteúdo interno. */
export function svgMarkup(inner, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true">${inner}</svg>`;
}

/** Condições: cor do badge + ícone (usa currentColor: colorido no menu, branco no token). */
export const CONDITION_DEFS = [
  { key: "bleeding", label: "Sangrando", color: "#e5484d", svg: '<path d="M12 3.5c-2.6 3.7-5.3 6.9-5.3 9.9a5.3 5.3 0 0 0 10.6 0c0-3-2.7-6.2-5.3-9.9Z" fill="currentColor"/>' },
  { key: "hurt", label: "Machucado", color: "#f59e0b", svg: '<path d="M9.5 3.5h5V9h5.5v5H14.5v5.5h-5V14H4V9h5.5V3.5Z" fill="currentColor"/>' },
  { key: "dead", label: "Morto", color: "#64748b", svg: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 3a7 7 0 0 0-7 7v2.3c0 .9.5 1.7 1.3 2.1l.7.3V18a1 1 0 0 0 1 1h.6v-1.6h1V19h1.2v-1.6h1V19h1.2v-1.6h1V19h.6a1 1 0 0 0 1-1v-3.3l.7-.3c.8-.4 1.3-1.2 1.3-2.1V10a7 7 0 0 0-7-7Zm-2.7 7.3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm5.4 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" fill="currentColor"/>' },
  { key: "stunned", label: "Atordoado", color: "#eab308", svg: '<path d="M15.5 6.2A5 5 0 1 0 17 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12.4 9.2A2 2 0 1 0 14 11.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
  { key: "poisoned", label: "Envenenado", color: "#22c55e", svg: '<path d="M9.5 3h5v1.8l-1 1v3.1l3.8 5.9A2.4 2.4 0 0 1 15.3 19H8.7a2.4 2.4 0 0 1-2-3.7l3.8-5.9V5.8l-1-1V3Z" fill="currentColor"/>' },
  { key: "unconscious", label: "Inconsciente", color: "#3b82f6", svg: '<path d="M6 6h5.2l-5.2 6.4h5.2" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M13.2 13h4l-4 4.6h4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>' },
  { key: "frightened", label: "Amedrontado", color: "#a855f7", svg: '<path d="M12 4v9.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="18.6" r="1.8" fill="currentColor"/>' },
  { key: "prone", label: "Caído", color: "#94a3b8", svg: '<path d="M5.5 9.5l6.5 6.5 6.5-6.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' },
  { key: "burning", label: "Queimando", color: "#f97316", svg: '<path d="M12 3c.6 3.1 3.6 4.4 3.6 7.7A3.6 3.6 0 0 1 8 11c0-1 .4-1.9 1.1-2.6.3 1 .9 1.6 1.6 1.6-.3-2.3.4-4.6 1.3-7Z" fill="currentColor"/>' },
  { key: "blessed", label: "Abençoado", color: "#eab308", svg: '<path d="M12 3l1.9 5.4L19.4 10l-5.5 1.6L12 17l-1.9-5.4L4.6 10l5.5-1.6Z" fill="currentColor"/>' },
];

/** Ícones dos indicadores de travado/luz no token (currentColor → branco). */
export const BADGE_ICONS = {
  lock: '<rect x="6" y="11" width="12" height="8.5" rx="2" fill="currentColor"/><path d="M8.2 11V8.3a3.8 3.8 0 0 1 7.6 0V11" stroke="currentColor" stroke-width="1.9" fill="none"/>',
  light:
    '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
