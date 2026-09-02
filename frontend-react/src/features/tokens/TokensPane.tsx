import { useState } from "preact/hooks";
import { PencilSimple, Plus, Trash, TrayArrowDown } from "@phosphor-icons/react";
import { tokenCatalog } from "@/state/token-catalog-store";
import { identity } from "@/state/identity";
import { sceneMeta } from "@/state/game-store";
import { session } from "@/session";
import { writeTokenDrag } from "./token-dnd";
import { openTokenEditor } from "./TokenEditor";
import type { TokenCatalogItem } from "@/net/types";

type Filter = "scene" | "available" | "all";

export function TokensPane() {
  const isGm = identity.value.isGm;
  const [filter, setFilter] = useState<Filter>("scene");
  const currentScene = sceneMeta.value.sceneId;
  const catalog = tokenCatalog.value;
  const filtered = catalog.filter((token) => filter === "all" || (filter === "scene" ? token.scene_id === currentScene : token.scene_id !== currentScene));

  return (
    <section class="tab-pane active token-shelf">
      <header class="pane-lead">
        <div><span class="eyebrow">Miniaturas persistentes</span><h2>Tokens</h2><p>Arraste um token para o mapa. Cada token existe em uma única cena.</p></div>
        {isGm && <button type="button" class="btn-primary btn-mini" onClick={() => openTokenEditor()}><Plus size={16} weight="bold" /> Novo</button>}
      </header>
      <div class="segmented token-filters" role="tablist">
        <button class={filter === "scene" ? "active" : ""} onClick={() => setFilter("scene")}>Nesta cena</button>
        <button class={filter === "available" ? "active" : ""} onClick={() => setFilter("available")}>Disponíveis</button>
        <button class={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
      </div>
      <div class="token-catalog-grid">
        {filtered.length === 0 ? <div class="token-catalog-empty"><TrayArrowDown size={28} /><strong>Nenhum token aqui</strong><span>{isGm ? "Crie um token com imagem ou procure em outro filtro." : "O Mestre ainda não vinculou tokens a você."}</span></div> : filtered.map((token) => <CatalogCard key={token.id} token={token} isGm={isGm} currentScene={currentScene} />)}
      </div>
    </section>
  );
}

function CatalogCard({ token, isGm, currentScene }: { token: TokenCatalogItem; isGm: boolean; currentScene: number | null }) {
  const placedHere = token.scene_id === currentScene;
  return (
    <article class={`token-catalog-card${placedHere ? " placed" : ""}`} draggable onDragStart={(event) => event.dataTransfer && writeTokenDrag(event.dataTransfer, token.id)}>
      <div class="token-art" style={token.image_url ? { backgroundImage: `url("${token.image_url}")` } : undefined}>{!token.image_url && <span>{token.name.slice(0, 2).toUpperCase()}</span>}<i>{placedHere ? "na mesa" : token.scene_name ?? "disponível"}</i></div>
      <div class="token-card-body"><strong>{token.name}</strong><span>{token.sheet_title ?? token.owner_name ?? "Somente Mestre"}</span></div>
      <div class="token-card-actions">
        {!placedHere && currentScene != null && <button type="button" title="Colocar no centro da cena" onClick={() => session.value?.table.placeToken(token.id, 160, 160)}><TrayArrowDown size={16} /></button>}
        {placedHere && <button type="button" class="token-focus" onClick={() => session.value?.table.centerOnToken(token.id)}>Localizar</button>}
        {isGm && <><button type="button" title="Editar" onClick={() => openTokenEditor(token)}><PencilSimple size={16} /></button><button type="button" class="danger" title="Excluir" onClick={() => confirm(`Excluir ${token.name}?`) && void session.value?.table.deleteCatalogToken(token.id)}><Trash size={16} /></button></>}
      </div>
    </article>
  );
}
