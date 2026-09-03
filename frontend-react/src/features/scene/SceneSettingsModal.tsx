import { useEffect, useState } from "preact/hooks";
import { ArrowLeft, ArrowRight, ImageSquare, Plus, Trash } from "@phosphor-icons/react";
import { AssetClient, SceneClient, type AssetOut } from "@/net/rest";
import type { MapStagePayload } from "@/net/types";
import { grid, sceneMeta } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { cleanAssetName } from "@/features/tokens/token-flow";

const ordered = (stages: MapStagePayload[]) => stages.map((stage, order) => ({ ...stage, order }));

export function SceneSettingsModal() {
  const isGm = identity.value.isGm;
  const meta = sceneMeta.value;
  const currentGrid = grid.value;
  const [snap, setSnap] = useState(true);
  const [meters, setMeters] = useState(currentGrid.meters_per_square);
  const [width, setWidth] = useState(meta.width);
  const [height, setHeight] = useState(meta.height);
  const [maps, setMaps] = useState<AssetOut[]>([]);
  const [stages, setStages] = useState<MapStagePayload[]>(meta.mapStages);
  const [active, setActive] = useState(meta.activeMapStage);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isGm) return;
    void new AssetClient(identity.value).list("map").then(setMaps).catch(() => setStatus("Não foi possível carregar os mapas da Biblioteca."));
  }, [isGm, meta.sceneId]);

  const saveStages = async (nextStages: MapStagePayload[], nextActive: number) => {
    if (meta.sceneId == null) return;
    setBusy(true);
    try {
      const saved = await new SceneClient(identity.value).saveMapStages(meta.sceneId, ordered(nextStages), nextActive);
      setStages(saved.map_stages ?? []);
      setActive(saved.active_map_stage ?? 0);
      if (saved.background_url) session.value?.table.setSceneBackground(saved.background_url);
      else session.value?.table.openScene(meta.sceneId);
      setStatus("Mapa salvo automaticamente.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível salvar o mapa."); }
    finally { setBusy(false); }
  };

  const addStage = (asset: AssetOut) => {
    if (stages.some((stage) => stage.image_url === asset.url) || stages.length >= 12) return;
    const next = [...stages, { id: globalThis.crypto?.randomUUID?.() ?? `map-${Date.now()}`, name: cleanAssetName(asset.original_name), image_url: asset.url, order: stages.length }];
    void saveStages(next, stages.length ? active : 0);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    const nextActive = active === index ? target : active === target ? index : active;
    void saveStages(next, nextActive);
  };
  const remove = (index: number) => {
    const next = stages.filter((_, itemIndex) => itemIndex !== index);
    void saveStages(next, Math.min(active, Math.max(0, next.length - 1)));
  };
  const rename = (index: number, name: string) => {
    const next = stages.map((stage, itemIndex) => itemIndex === index ? { ...stage, name: name.trim() || `Mapa ${index + 1}` } : stage);
    void saveStages(next, active);
  };

  return <div class="scene-settings">
    <section class="scene-settings-section"><div class="scene-settings-title"><strong>Movimento</strong><span>Preferência deste dispositivo</span></div><label class="field field-inline"><input type="checkbox" checked={snap} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setSnap(enabled); session.value?.table.setSnap(enabled); }} /><span>Encaixar tokens no grid</span></label></section>

    {isGm && <><section class="scene-settings-section"><div class="scene-settings-title"><strong>Grid e escala</strong><span>{meta.width} × {meta.height} px</span></div><label class="field field-inline"><input type="checkbox" checked={currentGrid.enabled} onChange={(event) => session.value?.table.updateGrid({ enabled: (event.target as HTMLInputElement).checked })} /><span>Exibir grid</span></label><label class="field"><span>Metros por quadrado</span><input type="number" min={0.5} step={0.5} value={meters} onInput={(event) => setMeters(Number((event.target as HTMLInputElement).value) || 1.5)} onBlur={() => session.value?.table.updateGrid({ meters_per_square: meters })} /></label><div class="field"><span>Tamanho do mapa em pixels</span><div class="size-row"><input type="number" min={64} max={20000} value={width} onInput={(event) => setWidth(Number((event.target as HTMLInputElement).value) || 64)} /><span>×</span><input type="number" min={64} max={20000} value={height} onInput={(event) => setHeight(Number((event.target as HTMLInputElement).value) || 64)} /><button type="button" class="btn-ghost" onClick={() => session.value?.table.resizeScene(width, height)}>Aplicar</button></div></div></section>

    <section class="scene-settings-section scene-map-settings"><div class="scene-settings-title"><strong>Estados do mapa</strong><span>{stages.length}/12 imagens</span></div>{stages.length ? <div class="scene-map-stage-list">{stages.map((stage, index) => <article class={index === active ? "active" : ""} key={stage.id}><button type="button" class="scene-map-preview" style={{ backgroundImage: `url("${stage.image_url}")` }} onClick={() => void saveStages(stages, index)}><span>{index === active ? "Em uso" : `Mapa ${index + 1}`}</span></button><input defaultValue={stage.name} onBlur={(event) => rename(index, (event.target as HTMLInputElement).value)} /><div><button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowLeft size={14} /></button><button type="button" disabled={busy || index === stages.length - 1} onClick={() => move(index, 1)}><ArrowRight size={14} /></button><button type="button" disabled={busy} onClick={() => remove(index)}><Trash size={14} /></button></div></article>)}</div> : <div class="scene-map-empty"><ImageSquare size={25} /><span>Adicione o mapa atual e suas variações pela Biblioteca.</span></div>}
    <div class="scene-map-library"><span>Mapas da Biblioteca</span><div>{maps.map((map) => <button type="button" key={map.id} disabled={busy || stages.some((stage) => stage.image_url === map.url)} style={{ backgroundImage: `url("${map.url}")` }} title={`Adicionar ${cleanAssetName(map.original_name)}`} onClick={() => addStage(map)}><Plus size={18} /></button>)}</div></div></section></>}
    {status && <p class="sheet-status" role="status">{status}</p>}
  </div>;
}
