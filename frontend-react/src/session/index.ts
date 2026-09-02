/**
 * Sessão — instancia e conecta os controllers assim que os motores (PixiJS e
 * Three.js) estão prontos. Expõe a API para os componentes via signal.
 */
import { signal } from "@preact/signals";
import type { TableEngine } from "@/engine/table-engine";
import type { InputEngine } from "@/engine/input";
import type { DiceEngine } from "@/engine/dice-engine";
import { TableController } from "./table-controller";
import { DiceController } from "./dice-controller";
import { ToolsController } from "./tools-controller";
import { MESSAGE_TYPES } from "@/net/message-types";
import { ws, startWs } from "@/net/ws";
import { identity } from "@/state/identity";
import { activeTool, presence, publicSheetUpdates, pushLog, sharedItems, showUiNotice, type PresenceMember, type SharedItem } from "@/state/ui-store";
import { openTokenMenu } from "@/features/tokens/token-menu";

export interface SessionApi {
  table: TableController;
  dice: DiceController;
  tools: ToolsController;
  input: InputEngine;
}

export const session = signal<SessionApi | null>(null);

let engines: { table?: TableEngine; input?: InputEngine; dice?: DiceEngine } = {};

/** Chamado pelos wrappers quando cada motor termina de inicializar. */
export function registerTableEngine(table: TableEngine, input: InputEngine): void {
  engines.table = table;
  engines.input = input;
  tryStart();
}

export function registerDiceEngine(dice: DiceEngine): void {
  engines.dice = dice;
  tryStart();
}

function tryStart(): void {
  if (session.value) return;
  const { table, input, dice } = engines;
  if (!table || !input || !dice) return;

  const id = identity.value;
  const tableCtl = new TableController(table, id);
  const diceCtl = new DiceController(dice, id);
  const toolsCtl = new ToolsController(table);
  toolsCtl.onToolChange = (name) => {
    activeTool.value = name;
  };

  // Callbacks do motor → controllers (envio ao Host).
  table.onTokenDragEnd = (tid, x, y) => tableCtl.handleTokenDragEnd(tid, x, y);
  table.canControlToken = (tk) => tableCtl.canControlToken(tk);
  table.onTokenResizeEnd = (tid, w, h) => tableCtl.handleTokenResizeEnd(tid, w, h);
  table.onFogPaint = (cells, reveal) => tableCtl.paintFog(cells, reveal);
  table.onTokenContextMenu = (tid, cx, cy) => openTokenMenu(tid, cx, cy);

  wireChat();

  tableCtl.start();
  diceCtl.start();
  toolsCtl.start();

  // Solicita cena e quadro a cada (re)conexão — o socket já pode estar abrindo.
  ws.on("open", () => {
    tableCtl.requestScene();
    toolsCtl.requestBoard();
  });

  startWs();

  session.value = { table: tableCtl, dice: diceCtl, tools: toolsCtl, input };
}

function wireChat(): void {
  ws.on(MESSAGE_TYPES.ERROR, (p: { reason?: string; message?: string }) => {
    const messages: Record<string, string> = {
      gm_only: "Esta ação é exclusiva do Mestre da campanha.",
      asset_not_found: "O arquivo não está disponível nesta campanha.",
      edit_denied: "Você só pode alterar itens criados por você.",
      move_denied: "Você não tem permissão para mover este token.",
      update_denied: "Você não tem permissão para editar este token.",
    };
    showUiNotice("Ação não realizada", p?.message ?? messages[p?.reason ?? ""] ?? "Não foi possível concluir esta ação.");
  });
  ws.on(MESSAGE_TYPES.PRESENCE_LIST, (payload: { users?: PresenceMember[] }) => {
    presence.value = payload.users ?? [];
  });
  ws.on(MESSAGE_TYPES.CHAT, (p: { user_id?: string; text?: string }) => {
    pushLog({ author: p?.user_id ?? "?", text: p?.text ?? "", kind: "chat" });
  });

  let shareSeq = 0;
  const addShared = (kind: string, name: string, url: string, from: string) => {
    const item: SharedItem = { id: `shared-${++shareSeq}`, kind, name, url, from, ts: Date.now() };
    sharedItems.value = [item, ...sharedItems.value].slice(0, 100);
    pushLog({ author: from, text: `compartilhou ${name}`, kind: "share" });
  };
  ws.on(MESSAGE_TYPES.PDF_SHARE, (p: { url?: string; name?: string; from?: string }) => {
    if (p?.url) addShared("pdf", p.name ?? "PDF", p.url, p.from ?? "?");
  });
  ws.on(MESSAGE_TYPES.LIBRARY_SHARE, (p: { from?: string; item?: { url?: string; name?: string; kind?: string } }) => {
    if (p?.item?.url) addShared(p.item.kind ?? "doc", p.item.name ?? "Arquivo", p.item.url, p.from ?? "?");
  });
  ws.on(MESSAGE_TYPES.SHEET_PUBLIC_UPDATE, (p: { sheet_id?: string; title?: string; owner_name?: string; values?: Record<string, unknown> }) => {
    if (!p.sheet_id || !p.values) return;
    const current = publicSheetUpdates.value.get(p.sheet_id);
    const next = new Map(publicSheetUpdates.value);
    next.set(p.sheet_id, {
      sheet_id: p.sheet_id,
      title: p.title ?? current?.title ?? "Ficha",
      owner_name: p.owner_name ?? current?.owner_name ?? "Jogador",
      values: { ...(current?.values ?? {}), ...p.values },
      received_at: Date.now(),
    });
    publicSheetUpdates.value = next;
  });
}

/** Envia uma mensagem de chat. */
export function sendChat(text: string): void {
  const t = text.trim();
  if (!t) return;
  ws.send(MESSAGE_TYPES.CHAT, { text: t });
}
