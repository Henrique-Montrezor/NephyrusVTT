/**
 * Menu de contexto genérico (reutilizável). Abre um menu flutuante na posição
 * do cursor com uma lista de itens. Usado pela Biblioteca (assets e pastas).
 */
import { svgMarkup } from "./token_icons.js";

let menuEl = null;
let bound = false;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement("div");
  menuEl.className = "ctx-menu";
  menuEl.hidden = true;
  document.body.appendChild(menuEl);
  return menuEl;
}

/** Fecha o menu de contexto, se aberto. */
export function closeContextMenu() {
  if (menuEl) menuEl.hidden = true;
}

/**
 * Abre o menu de contexto.
 * @param {number} clientX
 * @param {number} clientY
 * @param {Array<{label?:string, icon?:string, danger?:boolean, separator?:boolean, onClick?:Function}>} items
 */
export function openContextMenu(clientX, clientY, items) {
  const menu = ensureMenu();
  menu.innerHTML = "";

  for (const item of items) {
    if (!item || item.separator) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    if (item.danger) b.className = "danger";
    b.innerHTML = `${item.icon ? svgMarkup(item.icon) : ""}<span>${item.label}</span>`;
    b.addEventListener("click", () => {
      closeContextMenu();
      item.onClick?.();
    });
    menu.appendChild(b);
  }

  // Posiciona dentro da viewport.
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(clientX, vw - rect.width - 8);
  const y = Math.min(clientY, vh - rect.height - 8);
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;

  if (!bound) {
    bound = true;
    document.addEventListener("pointerdown", (e) => {
      if (e.button === 2) return; // botão direito reabre em outro alvo
      if (menuEl && !menuEl.hidden && !menuEl.contains(e.target)) closeContextMenu();
    });
    window.addEventListener("blur", closeContextMenu);
    document.addEventListener("scroll", closeContextMenu, true);
  }
}
