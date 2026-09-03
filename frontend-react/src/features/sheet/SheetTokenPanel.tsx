import { useEffect, useState } from "preact/hooks";
import { ArrowLeft, ArrowRight, Crosshair, ImageSquare, MapPin, Plus, SignOut, Trash } from "@phosphor-icons/react";
import { AssetClient, SheetClient, type AssetOut, type CharacterSheetOut, type TokenStageOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { sceneMeta } from "@/state/game-store";
import { tokenCatalog } from "@/state/token-catalog-store";
import { session } from "@/session";
import { writeTokenDrag } from "@/features/tokens/token-dnd";
import { cleanAssetName, findSheetToken } from "@/features/tokens/token-flow";

const ordered = (stages: TokenStageOut[]): TokenStageOut[] => stages.map((stage, order) => ({ ...stage, order }));

export function SheetTokenPanel({ sheet, onChange }: { sheet: CharacterSheetOut; onChange?: (sheet: CharacterSheetOut) => void }) {
  const isGm = identity.value.isGm;
  const token = findSheetToken(tokenCatalog.value, sheet.id);
  const activeStage = Math.min(token?.active_stage ?? 0, Math.max(0, sheet.token_stages.length - 1));
  const currentImage = sheet.token_stages[activeStage]?.image_url ?? token?.image_url ?? "";
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [name, setName] = useState(token?.name ?? sheet.title);
  const [size, setSize] = useState(token?.width ?? 64);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const inCurrentScene = token?.scene_id === sceneMeta.value.sceneId;

  useEffect(() => {
    setName(token?.name ?? sheet.title);
    setSize(token?.width ?? 64);
  }, [token?.id, token?.name, token?.width, sheet.id]);

  useEffect(() => {
    if (!isGm) return;
    void new AssetClient(identity.value).list("token").then(setAssets).catch(() => setStatus("Não foi possível carregar as imagens da Biblioteca."));
  }, [isGm, sheet.id]);

  const saveStages = async (stages: TokenStageOut[], message = "Estágios salvos automaticamente.") => {
    setBusy(true);
    setStatus("");
    try {
      const nextSheet = await new SheetClient(identity.value).saveTokenStages(sheet.id, ordered(stages));
      onChange?.(nextSheet);
      const firstImage = nextSheet.token_stages[0]?.image_url;
      if (firstImage) {
        const data = { name: name.trim() || sheet.title, image_url: firstImage, sheet_id: sheet.id, width: size, height: size };
        if (token) await session.value?.table.updateCatalogToken(token.id, data);
        else await session.value?.table.createCatalogToken(data);
      }
      setStatus(message);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível salvar os estágios."); }
    finally { setBusy(false); }
  };

  const addStage = (asset: AssetOut) => {
    if (sheet.token_stages.some((stage) => stage.image_url === asset.url) || sheet.token_stages.length >= 12) return;
    const stage: TokenStageOut = { id: globalThis.crypto?.randomUUID?.() ?? `stage-${Date.now()}`, name: cleanAssetName(asset.original_name), image_url: asset.url, order: sheet.token_stages.length };
    void saveStages([...sheet.token_stages, stage], "Imagem adicionada ao personagem.");
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sheet.token_stages.length) return;
    const next = [...sheet.token_stages];
    [next[index], next[target]] = [next[target], next[index]];
    void saveStages(next);
  };

  const renameStage = (index: number, value: string) => {
    const next = sheet.token_stages.map((stage, itemIndex) => itemIndex === index ? { ...stage, name: value.trim() || `Estágio ${index + 1}` } : stage);
    void saveStages(next);
  };

  const saveToken = async () => {
    if (!currentImage || !name.trim()) return;
    setBusy(true);
    try {
      const data = { name: name.trim(), image_url: currentImage, sheet_id: sheet.id, width: size, height: size };
      if (token) await session.value?.table.updateCatalogToken(token.id, data);
      else await session.value?.table.createCatalogToken(data);
      setStatus("Token do personagem salvo.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível salvar o token."); }
    finally { setBusy(false); }
  };

  const place = () => {
    if (!token || sceneMeta.value.sceneId == null) return;
    session.value?.table.placeToken(token.id, Math.max(0, sceneMeta.value.width / 2 - size / 2), Math.max(0, sceneMeta.value.height / 2 - size / 2));
  };

  if (!isGm && !token) return <div class="sheet-token-empty"><ImageSquare size={30} /><strong>Token ainda não definido</strong><p>O Mestre pode vincular imagens a esta ficha.</p></div>;

  return <div class="sheet-token-panel">
    <div class="sheet-token-identity">
      <div class={`sheet-token-portrait${token ? " draggable" : ""}`} draggable={Boolean(token)} onDragStart={(event) => { if (token && event.dataTransfer) writeTokenDrag(event.dataTransfer, { source: "catalog", id: token.id }); }} style={currentImage ? { backgroundImage: `url("${currentImage}")` } : undefined}>{!currentImage && <ImageSquare size={32} />}</div>
      <div><span>Token de {sheet.owner_name}</span><h3>{token?.name ?? sheet.title}</h3><p>{inCurrentScene ? "Presente na cena aberta" : token?.scene_name ? `Está em ${token.scene_name}` : token ? "Arraste o retrato para o mapa" : "Adicione o primeiro estágio"}</p></div>
    </div>

    {!!sheet.token_stages.length && <div class="sheet-token-stages"><div class="sheet-token-section-title"><span>Estados do personagem</span><small>Selecione o token e troque a imagem por estágio</small></div><div class="sheet-token-stage-list">{sheet.token_stages.map((stage, index) => <div class={`sheet-token-stage${index === activeStage ? " active" : ""}`} key={stage.id}>
      <button type="button" class="sheet-token-stage-image" style={{ backgroundImage: `url("${stage.image_url}")` }} title={`Ativar ${stage.name}`} onClick={() => token && session.value?.table.setTokenStage(token.id, index)}><span>{index + 1}</span></button>
      {isGm ? <input aria-label={`Nome do estágio ${index + 1}`} defaultValue={stage.name} onBlur={(event) => renameStage(index, (event.target as HTMLInputElement).value)} /> : <strong>{stage.name}</strong>}
      {isGm && <div class="sheet-token-stage-actions"><button type="button" disabled={index === 0 || busy} aria-label="Mover estágio para a esquerda" onClick={() => moveStage(index, -1)}><ArrowLeft size={14} /></button><button type="button" disabled={index === sheet.token_stages.length - 1 || busy} aria-label="Mover estágio para a direita" onClick={() => moveStage(index, 1)}><ArrowRight size={14} /></button><button type="button" disabled={busy} aria-label="Remover estágio" onClick={() => void saveStages(sheet.token_stages.filter((_, itemIndex) => itemIndex !== index))}><Trash size={14} /></button></div>}
    </div>)}</div></div>}

    {isGm && <div class="sheet-token-config">
      <label class="field"><span>Nome no mapa</span><input type="text" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} /></label>
      <label class="field sheet-token-size"><span>Tamanho inicial</span><select class="select" value={size} onChange={(event) => setSize(Number((event.target as HTMLSelectElement).value))}><option value={48}>Pequeno</option><option value={64}>Médio</option><option value={96}>Grande</option><option value={128}>Enorme</option></select></label>
      <div class="sheet-token-library"><span>Adicionar estado da Biblioteca</span>{assets.length ? <div>{assets.map((asset) => <button type="button" key={asset.id} disabled={busy || sheet.token_stages.some((stage) => stage.image_url === asset.url)} style={{ backgroundImage: `url("${asset.url}")` }} title={`Adicionar ${cleanAssetName(asset.original_name)}`} aria-label={`Adicionar ${cleanAssetName(asset.original_name)}`} onClick={() => addStage(asset)}><Plus size={18} /></button>)}</div> : <p>Envie imagens para a pasta Tokens na Biblioteca.</p>}</div>
      <button type="button" class="btn-primary sheet-token-save" disabled={busy || !currentImage || !name.trim()} onClick={() => void saveToken()}>{busy ? "Salvando…" : token ? "Salvar nome e tamanho" : "Vincular token à ficha"}</button>
    </div>}

    {token && <div class="sheet-token-map-actions">{inCurrentScene ? <><button type="button" class="btn-primary" onClick={() => session.value?.table.centerOnToken(token.id)}><Crosshair size={17} /> Localizar no mapa</button>{isGm && <button type="button" class="btn-ghost" onClick={() => session.value?.table.removeToken(token.id)}><SignOut size={17} /> Retirar da cena</button>}</> : <button type="button" class="btn-primary" onClick={place}><MapPin size={17} /> Colocar na cena aberta</button>}</div>}
    {status && <p class="sheet-token-status" role="status">{status}</p>}
  </div>;
}
