import { useEffect, useRef, useState } from "preact/hooks";
import { ArrowSquareIn, Broadcast, GearSix, ImageSquare, MapTrifold, PencilSimple, Plus, Trash, UploadSimple, UsersThree } from "@phosphor-icons/react";
import { sceneList, showUiNotice } from "@/state/ui-store";
import { sceneMeta } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { AssetClient, type AssetOut } from "@/net/rest";
import type { SceneListItem, SceneParticipant } from "@/net/types";
import { openModal } from "@/ui/modal";
import { SceneSettingsModal } from "./SceneSettingsModal";

export function ScenePane() {
  const isGm = identity.value.isGm;
  useEffect(() => { if (isGm) session.value?.table.listScenes(); }, []);
  const settings = () => openModal({ title: `Configurações · ${sceneMeta.value.name}`, body: <SceneSettingsModal /> });

  return (
    <section class="tab-pane active">
      {isGm ? <ScenesDirector onSettings={settings} /> : <header class="pane-lead"><div><span class="eyebrow">Cena aberta</span><h2>{sceneMeta.value.name}</h2><p>Ajuste como seus tokens se movem neste dispositivo.</p></div><button class="btn-ghost btn-mini" onClick={settings}><GearSix size={17} /> Configurar</button></header>}
    </section>
  );
}

function ScenesDirector({ onSettings }: { onSettings: () => void }) {
  const scenes = sceneList.value;
  return (
    <div class="scene-director">
      <header class="pane-lead"><div><span class="eyebrow">Direção da sessão</span><h2>Cenas</h2><p>Prepare mapas em silêncio ou direcione o grupo quando estiver pronto.</p></div><div class="scene-lead-actions"><button class="btn-ghost btn-mini" onClick={onSettings}><GearSix size={17} /> Ajustes</button><button class="btn-primary btn-mini" onClick={openSceneCreator}><Plus size={16} weight="bold" /> Nova</button></div></header>
      <div class="scene-rail">
        {scenes.map((scene) => <SceneCard key={scene.id} scene={scene} />)}
        {scenes.length === 0 && <button class="scene-empty-card" onClick={openSceneCreator}><MapTrifold size={30} /><strong>Crie a primeira cena</strong><span>Escolha um mapa e prepare o tabuleiro.</span></button>}
      </div>
    </div>
  );
}

function SceneCard({ scene }: { scene: SceneListItem }) {
  const viewing = sceneMeta.value.sceneId === scene.id;
  const rename = () => {
    const name = prompt("Novo nome da cena:", scene.name)?.trim();
    if (name) session.value?.table.renameScene(scene.id, name);
  };
  return (
    <article class={`scene-direction-card${viewing ? " viewing" : ""}`}>
      <button class="scene-direction-media" style={scene.background_url ? { backgroundImage: `url("${scene.background_url}")` } : undefined} onClick={() => session.value?.table.openScene(scene.id)}>
        {!scene.background_url && <ImageSquare size={28} />}
        <span class="scene-status">{scene.is_active ? "Padrão" : "Preparada"}</span>
        <span class="scene-open-label"><ArrowSquareIn size={15} /> {viewing ? "Visualizando" : "Abrir sem publicar"}</span>
      </button>
      <div class="scene-direction-body">
        <div class="scene-direction-title"><div><strong>{scene.name}</strong><span>{scene.token_count} token{scene.token_count === 1 ? "" : "s"} · {scene.participants.length} jogador{scene.participants.length === 1 ? "" : "es"}</span></div><button title="Renomear" onClick={rename}><PencilSimple size={15} /></button></div>
        <div class="scene-participants">{scene.participants.length ? scene.participants.map((participant) => <span key={participant.member_id} class={participant.online ? "online" : ""} title={participant.online ? "Online" : "Offline"}>{participant.display_name}</span>) : <em>Ninguém direcionado para esta cena</em>}</div>
        <div class="scene-direction-actions">
          <button class="scene-publish" onClick={() => session.value?.table.moveGroup(scene.id)}><Broadcast size={16} /> Mover grupo</button>
          <button title="Mover jogadores selecionados" onClick={() => openMemberMover(scene, allParticipants())}><UsersThree size={17} /></button>
          {!scene.is_active && <button class="danger" title="Excluir cena" onClick={() => confirm(`Excluir a cena ${scene.name}?`) && session.value?.table.deleteScene(scene.id)}><Trash size={16} /></button>}
        </div>
      </div>
    </article>
  );
}

function allParticipants(): SceneParticipant[] {
  const map = new Map<string, SceneParticipant>();
  for (const scene of sceneList.value) for (const participant of scene.participants) map.set(participant.member_id, participant);
  return [...map.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function openMemberMover(scene: SceneListItem, participants: SceneParticipant[]): void {
  let close = () => {};
  const modal = openModal({ title: `Mover para ${scene.name}`, body: <MemberMover sceneId={scene.id} participants={participants} onDone={() => close()} /> });
  close = modal.close;
}

function MemberMover({ sceneId, participants, onDone }: { sceneId: number; participants: SceneParticipant[]; onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const move = () => { session.value?.table.moveMembers(sceneId, [...selected]); onDone(); };
  return <div class="member-mover"><p>Selecione jogadores. Apenas eles mudarão de cena.</p><div class="member-mover-list">{participants.map((participant) => <label key={participant.member_id}><input type="checkbox" checked={selected.has(participant.member_id)} onChange={(event) => { const next = new Set(selected); (event.target as HTMLInputElement).checked ? next.add(participant.member_id) : next.delete(participant.member_id); setSelected(next); }} /><span><i class={participant.online ? "online" : ""} />{participant.display_name}<small>{participant.online ? "online" : "offline"}</small></span></label>)}</div><button class="btn-primary" disabled={!selected.size} onClick={move}>Mover {selected.size || ""} selecionado{selected.size === 1 ? "" : "s"}</button></div>;
}

function openSceneCreator(): void {
  let close = () => {};
  const modal = openModal({ title: "Preparar nova cena", body: <SceneCreator onDone={() => close()} /> });
  close = modal.close;
}

function SceneCreator({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [maps, setMaps] = useState<AssetOut[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void new AssetClient(identity.value).list("map").then(setMaps).catch((error) => showUiNotice("Mapas não carregados", String(error))); }, []);
  const upload = async (file?: File) => { if (!file) return; setBusy(true); try { const map = await new AssetClient(identity.value).upload("map", file, "Mapas"); setMaps((current) => [map, ...current]); setUrl(map.url); } catch (error) { showUiNotice("Mapa não enviado", String(error)); } finally { setBusy(false); } };
  const create = (event: Event) => { event.preventDefault(); session.value?.table.createScene(name.trim() || null, url); onDone(); };
  return <form class="scene-creator" onSubmit={create}><div class="scene-upload-row"><button type="button" class="scene-upload" onClick={() => input.current?.click()}><UploadSimple size={24} /><strong>Enviar mapa</strong><span>PNG, JPG ou WebP</span></button><input ref={input} hidden type="file" accept="image/*" onChange={(event) => void upload((event.target as HTMLInputElement).files?.[0])} /><label class="field"><span>Nome da cena</span><input autoFocus value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="Ex.: Templo submerso" /></label></div><div class="map-library"><span>Mapas da campanha</span><div>{maps.map((map) => <button type="button" key={map.id} class={url === map.url ? "selected" : ""} title={map.original_name} style={{ backgroundImage: `url("${map.url}")` }} onClick={() => setUrl(map.url)} />)}{!maps.length && <p>Nenhum mapa enviado ainda.</p>}</div></div><button class="btn-primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Enviando…" : "Criar cena preparada"}</button></form>;
}

