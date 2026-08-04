/**
 * Modal genérico (overlay central) reutilizável.
 *
 * Uso:
 *   openModal({ title, bodyEl, actions: [{label, primary, onClick(close)}], onClose });
 * `onClick` recebe a função `close`. Se omitido, o botão apenas fecha.
 * Fecha ao clicar fora, no X ou com Esc (dispara `onClose`).
 */
import { svgMarkup } from "./token_icons.js";

export function openModal({ title = "", bodyEl = null, actions = [], onClose } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const box = document.createElement("div");
  box.className = "modal-box";

  const head = document.createElement("div");
  head.className = "modal-head";
  const h = document.createElement("h3");
  h.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Fechar");
  closeBtn.innerHTML = svgMarkup(
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    16,
  );
  head.append(h, closeBtn);

  const body = document.createElement("div");
  body.className = "modal-body";
  if (bodyEl) body.appendChild(bodyEl);

  const foot = document.createElement("div");
  foot.className = "modal-foot";

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };

  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.primary ? "btn-primary" : "btn-ghost";
    b.textContent = a.label;
    b.addEventListener("click", () => (a.onClick ? a.onClick(close) : close()));
    foot.appendChild(b);
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);

  box.append(head, body, foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { close };
}
