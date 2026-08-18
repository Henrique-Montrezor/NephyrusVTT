import { useRef } from "preact/hooks";
import { activeTab } from "@/state/ui-store";
import { ChatPane } from "@/features/chat/ChatPane";
import { DicePane } from "@/features/dice/DicePane";
import { TokensPane } from "@/features/tokens/TokensPane";
import { ScenePane } from "@/features/scene/ScenePane";
import { SharedPane } from "@/features/shared/SharedPane";
import { LibraryPane } from "@/features/library/LibraryPane";

const DOCK_W_KEY = "nephyrus:dock-width";

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
    <aside class="dock" id="dock" ref={dockRef} style={initialWidth ? { width: `${initialWidth}px` } : undefined}>
      <div class="dock-resizer" title="Arraste para redimensionar" onPointerDown={startResize} />
      <div class="dock-body">
        {tab === "chat" && <ChatPane />}
        {tab === "dice" && <DicePane />}
        {tab === "tokens" && <TokensPane />}
        {tab === "scene" && <ScenePane />}
        {tab === "shared" && <SharedPane />}
        {tab === "library" && <LibraryPane />}
      </div>
    </aside>
  );
}
