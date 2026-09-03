import { useEffect, useState } from "preact/hooks";
import { Crosshair, DotsSixVertical, MapPin, SignOut, SortDescending } from "@phosphor-icons/react";
import { SheetClient, type CharacterSheetOut } from "@/net/rest";
import { tokenList } from "@/state/game-store";
import { tokenCatalog } from "@/state/token-catalog-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { reorderTokens, sortInitiative } from "./token-flow";

const QUEUE_MIME = "application/x-nephyrus-initiative";

export function TokensPane() {
  const currentIdentity = identity.value;
  const isGm = currentIdentity.isGm;
  const [sheets, setSheets] = useState<CharacterSheetOut[]>([]);
  const visible = tokenList.value.filter((token) => isGm || token.ownerId === currentIdentity.userId);
  const current = [...visible].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const catalog = new Map(tokenCatalog.value.map((token) => [token.id, token]));
  const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));

  useEffect(() => {
    void new SheetClient(currentIdentity).list().then(setSheets).catch(() => setSheets([]));
  }, [currentIdentity.accessToken, currentIdentity.campaignId]);

  const persistOrder = (tokens: typeof current) => tokens.forEach((token, index) => session.value?.table.updateToken(token.id, { sort_order: index }));
  const dropBefore = (event: DragEvent, beforeId: number) => {
    event.preventDefault();
    const tokenId = Number(event.dataTransfer?.getData(QUEUE_MIME));
    if (!Number.isInteger(tokenId) || tokenId === beforeId) return;
    persistOrder(reorderTokens(current, tokenId, beforeId));
  };
  const orderByInitiative = () => persistOrder(sortInitiative(current));

  return <section class="tab-pane active scene-token-pane">
    <header class="scene-token-header">
      <div><span>Na cena aberta</span><h2>Ordem da mesa</h2></div>
      <strong>{current.length}</strong>
    </header>
    {isGm && current.length > 1 && <button type="button" class="scene-token-sort" onClick={orderByInitiative}><SortDescending size={17} /> Ordenar por iniciativa</button>}

    {current.length ? <div class="scene-token-list">{current.map((token, index) => {
      const details = catalog.get(token.id);
      const sheet = details?.sheet_id ? sheetById.get(details.sheet_id) : undefined;
      return <article key={token.id} class="scene-token-row" draggable={isGm} onDragStart={(event) => { if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(QUEUE_MIME, String(token.id)); } }} onDragOver={(event) => { if (isGm) event.preventDefault(); }} onDrop={(event) => isGm && dropBefore(event, token.id)}>
        <span class={`scene-token-grip${isGm ? "" : " placeholder"}`} title={isGm ? "Arrastar na fila" : undefined}>{isGm && <DotsSixVertical size={18} />}</span>
        <span class="scene-token-position">{index + 1}</span>
        <button type="button" class="scene-token-thumb" style={token.imageUrl ? { backgroundImage: `url("${token.imageUrl}")` } : undefined} onClick={() => session.value?.table.centerOnToken(token.id)} aria-label={`Localizar ${token.name}`}>{!token.imageUrl && token.name.slice(0, 2).toUpperCase()}<MapPin size={14} weight="fill" /></button>
        <div class="scene-token-meta"><strong>{token.name}</strong><span>{details?.sheet_title ?? details?.owner_name ?? (isGm ? "Sem ficha vinculada" : "Seu token")}</span>{sheet && sheet.token_stages.length > 1 && <div class="scene-token-stage-buttons">{sheet.token_stages.map((stage, stageIndex) => <button key={stage.id} type="button" class={stageIndex === token.activeStage ? "active" : ""} title={stage.name} aria-label={`Ativar ${stage.name}`} onClick={() => session.value?.table.setTokenStage(token.id, stageIndex)}>{stageIndex + 1}</button>)}</div>}</div>
        <label class="scene-token-initiative" title="Iniciativa"><span>INI</span><input type="number" inputMode="numeric" defaultValue={token.initiative} onBlur={(event) => session.value?.table.setTokenInitiative(token.id, Number((event.target as HTMLInputElement).value) || 0)} /></label>
        <button type="button" class="scene-token-action" onClick={() => session.value?.table.centerOnToken(token.id)}><Crosshair size={17} /><span>Localizar</span></button>
        {isGm && <button type="button" class="scene-token-action is-danger" onClick={() => session.value?.table.removeToken(token.id)}><SignOut size={17} /><span>Retirar</span></button>}
      </article>;
    })}</div> : <div class="scene-token-empty"><MapPin size={28} /><strong>Nenhum token nesta cena</strong><p>{isGm ? "Arraste um token da Biblioteca ou de uma ficha para o mapa." : "Seus tokens vinculados ainda não foram colocados neste mapa."}</p></div>}
  </section>;
}
