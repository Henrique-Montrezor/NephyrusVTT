import { useRef } from "preact/hooks";
import { activeTab, dockOpen } from "@/state/ui-store";
import { ChatPane } from "@/features/chat/ChatPane";
import { DicePane } from "@/features/dice/DicePane";
import { SheetPane } from "@/features/sheet/SheetPane";
import { TokensPane } from "@/features/tokens/TokensPane";
import { ScenePane } from "@/features/scene/ScenePane";
import { SharedPane } from "@/features/shared/SharedPane";
import { LibraryPane } from "@/features/library/LibraryPane";
import { SystemPane } from "@/features/system/SystemPane";

const DOCK_W_KEY = "nephyrus:dock-width";

const TAB_LABELS = {
  chat: "Chat",
  dice: "Dados",
  sheet: "Ficha",
  tokens: "Tokens",
  scene: "Cena",
  shared: "Compartilhados",
  library: "Biblioteca",
  system: "Sistema",
} as const;

function clampWidth(w: number): number {
  const max = Math.min(1000, Math.max(360, window.innerWidth - 420));
  return Math.max(300, Math.min(max, Math.round(w)));
}

export function Dock() {
  const dockRef = useRef<HTMLElement>(null);

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    const dock = dockRef.current;
    if (!dock) return;
    const startX = e.clientX;
    const startW = dock.getBoundingClientRect().width;
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      dock.style.width = `${clampWidth(startW + (startX - ev.clientX))}px`;
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      localStorage.setItem(DOCK_W_KEY, String(parseInt(dock.style.width, 10) || 366));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const saved = parseInt(localStorage.getItem(DOCK_W_KEY) || "", 10);
  const initialWidth = Number.isFinite(saved) && saved ? clampWidth(saved) : undefined;

  const tab = activeTab.value;

  return (
    <aside
      class="dock"
      id="dock"
      ref={dockRef}
      data-open={String(dockOpen.value)}
      aria-label={`Painel de ${TAB_LABELS[tab]}`}
      style={initialWidth ? { width: `${initialWidth}px` } : undefined}
    >
      <div class="dock-resizer" title="Arraste para redimensionar" onPointerDown={startResize} />
      <div class="dock-mobile-head">
        <strong>{TAB_LABELS[tab]}</strong>
        <button type="button" class="dock-close" aria-label="Fechar painel" onClick={() => (dockOpen.value = false)}>
          Fechar
        </button>
      </div>
      <div class="dock-body">
        {tab === "chat" && <ChatPane />}
        {tab === "dice" && <DicePane />}
        {tab === "sheet" && <SheetPane />}
        {tab === "tokens" && <TokensPane />}
        {tab === "scene" && <ScenePane />}
        {tab === "shared" && <SharedPane />}
        {tab === "library" && <LibraryPane />}
        {tab === "system" && <SystemPane />}
      </div>
    </aside>
  );
}
