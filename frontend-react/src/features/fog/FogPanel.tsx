import { useState } from "preact/hooks";
import { fog } from "@/state/game-store";
import { openPanel } from "@/state/ui-store";
import { session } from "@/session";

export function FogPanel() {
  const [brush, setBrush] = useState<"reveal" | "hide" | null>(null);

  const setBrushMode = (mode: "reveal" | "hide") => {
    const next = brush === mode ? null : mode;
    setBrush(next);
    session.value?.table.setFogEditMode(next);
  };

  return (
    <div class="fog-panel">
      <div class="fog-head">
        <span class="fog-title">Névoa de Guerra</span>
        <button type="button" class="icon-btn" title="Fechar" onClick={() => (openPanel.value = null)}>✕</button>
      </div>
      <label class="field field-inline">
        <input type="checkbox" checked={fog.value.enabled} onChange={(e) => session.value?.table.toggleFog((e.target as HTMLInputElement).checked)} />
        <span>Ativar névoa</span>
      </label>
      <div class="fog-tools">
        <div class="fog-brush">
          <button type="button" class={`chip${brush === "reveal" ? " active" : ""}`} onClick={() => setBrushMode("reveal")}>Revelar</button>
          <button type="button" class={`chip${brush === "hide" ? " active" : ""}`} onClick={() => setBrushMode("hide")}>Ocultar</button>
        </div>
        <p class="fog-hint">Selecione um pincel e arraste sobre o mapa.</p>
        <div class="fog-reset">
          <button type="button" class="btn-ghost" onClick={() => session.value?.table.resetFog(true)}>Revelar tudo</button>
          <button type="button" class="btn-ghost" onClick={() => session.value?.table.resetFog(false)}>Ocultar tudo</button>
        </div>
      </div>
    </div>
  );
}
