import { useState } from "preact/hooks";
import { session } from "@/session";
import { sceneMeta } from "@/state/game-store";
import { activeTool, openPanel } from "@/state/ui-store";
import { identity } from "@/state/identity";
import type { MetricShape, ToolName } from "@/session/tools-controller";

const SHAPES: { id: MetricShape; label: string }[] = [
  { id: "ruler", label: "Régua" },
  { id: "circle", label: "Círculo" },
  { id: "cone", label: "Cone" },
  { id: "line", label: "Linha" },
];

export function ToolDock() {
  const isGm = identity.value.isGm;
  const [shape, setShape] = useState<MetricShape>("circle");
  const [color, setColor] = useState("#8b5cf6");
  const [persist, setPersist] = useState(true);
  const tool = activeTool.value;

  const recenter = () => {
    const { width, height } = sceneMeta.value;
    if (width && height) session.value?.input.view.centerOn(width / 2, height / 2);
  };
  const selectTool = (name: ToolName) => session.value?.tools.selectTool(name);

  return (
    <>
      <div class="tooldock" role="toolbar" aria-label="Ferramentas da mesa">
        <button class="tool-btn" title="Centralizar" onClick={recenter}>
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
        </button>
        <button class="tool-btn" title="Aproximar" onClick={() => session.value?.input.zoomIn()}>
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7" /><path d="M11 8v6M8 11h6M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
        </button>
        <button class="tool-btn" title="Afastar" onClick={() => session.value?.input.zoomOut()}>
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7" /><path d="M8 11h6M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
        </button>

        <div class="tool-sep" />

        <button class={`tool-btn${tool === null || tool === "select" ? " active" : ""}`} title="Selecionar" onClick={() => selectTool("select")}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 3 L19 12 L12 13 L15.5 20 L12.5 21.5 L9 14.5 L5 18 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
        </button>
        <button class={`tool-btn${tool === "pen" ? " active" : ""}`} title="Caneta" onClick={() => selectTool("pen")}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 20 l1-4 L15 6 l3 3 L8 19 l-4 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M13.5 7.5 l3 3" stroke="currentColor" stroke-width="1.4" /></svg>
        </button>
        <button class={`tool-btn${tool === "text" ? " active" : ""}`} title="Texto" onClick={() => selectTool("text")}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 6 h14 M12 6 v13 M9 19 h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
        </button>
        <button class={`tool-btn${tool === "metric" ? " active" : ""}`} title="Métrica / efeito" onClick={() => selectTool("metric")}>
          <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="15" r="5.5" stroke="currentColor" stroke-width="1.6" /><path d="M9 15 L14.5 9.5 M13 4 h7 v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button class={`tool-btn${openPanel.value === "turn" ? " active" : ""}`} title="Ordem de turnos" onClick={() => (openPanel.value = openPanel.value === "turn" ? null : "turn")}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 6 h14 M5 12 h14 M5 18 h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /><path d="M18 16 l2 2 l-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        {isGm && (
          <button class={`tool-btn${openPanel.value === "fog" ? " active" : ""}`} title="Névoa de Guerra" onClick={() => (openPanel.value = openPanel.value === "fog" ? null : "fog")}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M7 16 a4 4 0 0 1 .6-7.96 A5 5 0 0 1 17 9 a3.5 3.5 0 0 1-.5 7 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M5 20 h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7" /></svg>
          </button>
        )}
      </div>

      {tool === "metric" && (
        <div class="tool-options">
          <div class="metric-shapes">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                class={`chip${shape === s.id ? " active" : ""}`}
                onClick={() => {
                  setShape(s.id);
                  session.value?.tools.setMetricShape(s.id);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label class="opt-color">
            <span>Cor</span>
            <input
              type="color"
              value={color}
              onInput={(e) => {
                const c = (e.target as HTMLInputElement).value;
                setColor(c);
                session.value?.tools.setColor(c);
              }}
            />
          </label>
          <label class="field-inline opt-persist">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                setPersist(on);
                session.value?.tools.setPersist(on);
              }}
            />
            <span>Fixar no mapa</span>
          </label>
          {isGm && (
            <div class="tool-gm">
              <button type="button" class="btn-ghost btn-mini" onClick={() => session.value?.tools.clearTemplatesAll()}>Limpar métricas</button>
              <button type="button" class="btn-ghost btn-mini" onClick={() => session.value?.tools.clearDrawings()}>Limpar desenhos</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
