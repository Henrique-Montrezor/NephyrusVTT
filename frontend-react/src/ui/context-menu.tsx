/**
 * Menu de contexto genérico, dirigido por signal. `openContextMenu(x, y, items)`
 * abre um menu flutuante; <ContextMenuHost /> deve estar montado uma vez na raiz.
 * Porta context_menu.js.
 */
import { signal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

export interface ContextMenuItem {
  label?: string;
  icon?: string; // conteúdo interno do <svg>
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

const menu = signal<MenuState | null>(null);

export function openContextMenu(clientX: number, clientY: number, items: ContextMenuItem[]): void {
  menu.value = { x: clientX, y: clientY, items };
}

export function closeContextMenu(): void {
  menu.value = null;
}

export function ContextMenuHost() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const state = menu.value;

  // Reposiciona dentro da viewport após medir o menu.
  useLayoutEffect(() => {
    if (!state || !ref.current) {
      setPos(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(state.x, window.innerWidth - rect.width - 8);
    const y = Math.min(state.y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, x), top: Math.max(8, y) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) return;
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    const onScroll = () => closeContextMenu();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("blur", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("blur", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [state]);

  if (!state) return null;

  return (
    <div
      ref={ref}
      class="ctx-menu"
      style={{
        position: "fixed",
        left: pos ? `${pos.left}px` : `${state.x}px`,
        top: pos ? `${pos.top}px` : `${state.y}px`,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {state.items.map((item, i) =>
        !item || item.separator ? (
          <div key={i} class="ctx-sep" />
        ) : (
          <button
            key={i}
            type="button"
            class={item.danger ? "danger" : undefined}
            onClick={() => {
              closeContextMenu();
              item.onClick?.();
            }}
          >
            {item.icon ? (
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" dangerouslySetInnerHTML={{ __html: item.icon }} />
            ) : null}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
