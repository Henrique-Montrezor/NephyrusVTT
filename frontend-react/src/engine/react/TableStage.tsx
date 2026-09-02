/**
 * TableStage — monta o motor PixiJS (TableEngine) num contêiner DOM e o entrega
 * pronto via onReady. A sincronização reativa store→motor e o envio de
 * mensagens ficam nos controllers de feature (Fase 4).
 */
import { useEffect, useRef } from "preact/hooks";
import { TableEngine } from "@/engine/table-engine";
import { InputEngine } from "@/engine/input";
import { readTokenDrag } from "@/features/tokens/token-dnd";
import { session } from "@/session";

export interface TableStageProps {
  onReady?: (engine: TableEngine, input: InputEngine) => void;
}

export function TableStage({ onReady }: TableStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let engine: TableEngine | null = null;
    let disposed = false;

    const boot = async () => {
      const e = new TableEngine(mount);
      await e.init();
      if (disposed) {
        e.app?.destroy(true);
        return;
      }
      engine = e;
      const input = new InputEngine(e);
      input.attach();
      onReady?.(e, input);
    };
    void boot();

    return () => {
      disposed = true;
      engine?.app?.destroy(true);
    };
  }, []);

  return (
    <div
      id="stage"
      class="table-canvas"
      ref={mountRef}
      onDragOver={(event) => {
        if (event.dataTransfer && readTokenDrag(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer) return;
        const tokenId = readTokenDrag(event.dataTransfer);
        const table = session.value?.table;
        if (!tokenId || !table) return;
        event.preventDefault();
        const point = table.enginePointFromClient(event.clientX, event.clientY);
        table.placeToken(tokenId, point.x, point.y);
      }}
    />
  );
}
