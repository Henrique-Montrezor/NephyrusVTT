import { useEffect, useState } from "preact/hooks";
import { sceneList } from "@/state/ui-store";
import { grid, sceneMeta } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";

export function ScenePane() {
  const isGm = identity.value.isGm;
  const [snap, setSnap] = useState(true);

  useEffect(() => {
    if (isGm) session.value?.table.listScenes();
  }, []);

  return (
    <section class="tab-pane active">
      {isGm && <ScenesCard />}
      <div class="card">
        <h2 class="card-title">Preferências</h2>
        <label class="field field-inline">
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              setSnap(on);
              session.value?.table.setSnap(on);
            }}
          />
          <span>Encaixar no grid (snap)</span>
        </label>
      </div>
      {isGm && <GridCard />}
    </section>
  );
}

function ScenesCard() {
  const scenes = sceneList.value;
  const create = () => {
    const name = prompt("Nome da nova cena:");
    session.value?.table.createScene(name || null);
  };
  return (
    <div class="card">
      <h2 class="card-title">
        Cenas
        <button type="button" class="btn-primary btn-mini" style={{ marginLeft: "auto" }} onClick={create}>
          + Nova cena
        </button>
      </h2>
      <div class="scene-list">
        {scenes.length === 0 ? (
          <div class="asset-empty">Nenhuma cena.</div>
        ) : (
          scenes.map((s) => (
            <div key={s.id} class={`scene-row${s.is_active ? " active" : ""}`}>
              <button type="button" class="scene-open" onClick={() => session.value?.table.openScene(s.id)}>
                {s.name}
              </button>
              <div class="scene-row-actions">
                <button type="button" class="btn-ghost btn-mini" onClick={() => session.value?.table.activateScene(s.id)}>
                  Trazer jogadores
                </button>
                <button type="button" class="btn-ghost btn-mini" onClick={() => session.value?.table.deleteScene(s.id)}>
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <p class="scene-hint">Clique numa cena para abri-la. "Trazer jogadores" torna-a a cena que todos veem.</p>
    </div>
  );
}

function GridCard() {
  const g = grid.value;
  const [meters, setMeters] = useState(g.meters_per_square);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  const applyResize = () => {
    const pxPerMeter = g.size_px / (g.meters_per_square || 1);
    if (w > 0 && h > 0) session.value?.table.resizeScene(w * pxPerMeter, h * pxPerMeter);
  };

  return (
    <div class="card">
      <h2 class="card-title">Grid &amp; Mapa</h2>
      <label class="field field-inline">
        <input type="checkbox" checked={g.enabled} onChange={(e) => session.value?.table.updateGrid({ enabled: (e.target as HTMLInputElement).checked })} />
        <span>Exibir grid</span>
      </label>
      <label class="field">
        <span>Metros por quadrado</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={meters}
          onInput={(e) => setMeters(Number((e.target as HTMLInputElement).value) || 1.5)}
          onChange={() => session.value?.table.updateGrid({ meters_per_square: meters })}
        />
      </label>
      <div class="field">
        <span>Tamanho do mapa em metros. Atual: {Math.round(sceneMeta.value.width)}×{Math.round(sceneMeta.value.height)} px</span>
        <div class="size-row">
          <input type="number" min={1} step={1} placeholder="larg." value={w || ""} onInput={(e) => setW(Number((e.target as HTMLInputElement).value) || 0)} />
          <span class="times">×</span>
          <input type="number" min={1} step={1} placeholder="alt." value={h || ""} onInput={(e) => setH(Number((e.target as HTMLInputElement).value) || 0)} />
          <button type="button" class="btn-ghost" onClick={applyResize}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
