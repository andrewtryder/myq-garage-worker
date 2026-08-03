/** Inline Tabler-style SVG icons (24×24 viewBox). */

function svg(paths: string, className = 'icon'): string {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  door: () =>
    svg(
      '<path d="M14 12v.01"/><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
    ),
  bell: () =>
    svg(
      '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
    ),
  bellOff: () =>
    svg(
      '<path d="M9.346 5.353A7 7 0 0 1 18 11v1.5m0 3.5H4a4 4 0 0 0 2-3v-3c0-.845.149-1.654.427-2.404"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/><path d="M3 3l18 18"/>',
    ),
  check: () => svg('<path d="M5 12l5 5L20 7"/>'),
  arrowUp: () => svg('<path d="M12 5v14"/><path d="M18 11l-6-6"/><path d="M6 11l6-6"/>'),
  arrowDown: () => svg('<path d="M12 5v14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>'),
  warning: () =>
    svg(
      '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    ),
  webhook: () =>
    svg(
      '<path d="M4.34 15.66a7 7 0 0 1 0-9.9"/><path d="M19.66 5.76a7 7 0 0 1 0 9.9"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path d="M12 9V3"/><path d="m9.5 14.5-3 5"/><path d="m14.5 14.5 3 5"/>',
    ),
  settings: () =>
    svg(
      '<path d="M14 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0"/><path d="M4 6h6"/><path d="M14 6h6"/><path d="M10 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/><path d="M4 18h6"/><path d="M14 18h6"/><path d="M8 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/><path d="M4 12h4"/><path d="M12 12h8"/>',
    ),
  clock: () => svg('<path d="M12 7v5l3 3"/><circle cx="12" cy="12" r="9"/>'),
};
