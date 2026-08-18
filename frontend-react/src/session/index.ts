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
import { activeTool, pushLog, sharedItems, type SharedItem } from "@/state/ui-store";
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
  ws.on(MESSAGE_TYPES.LIBRARY_SHARE, (p: { url?: string; name?: string; kind?: string; from?: string }) => {
    if (p?.url) addShared(p.kind ?? "doc", p.name ?? "Arquivo", p.url, p.from ?? "?");
  });
}

/** Envia uma mensagem de chat. */
export function sendChat(text: string): void {
  const t = text.trim();
  if (!t) return;
  ws.send(MESSAGE_TYPES.CHAT, { text: t });
}
