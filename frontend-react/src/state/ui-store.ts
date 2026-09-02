/**
 * Estado da UI (não sincronizado): tema, conexão, aba ativa do dock, logs de
 * chat/dados e lista de cenas. Persistências locais usam localStorage.
 */
import { signal } from "@preact/signals";
import type { SceneListItem } from "@/net/types";

export type Theme = "light" | "dark";
export type DockTab = "chat" | "dice" | "sheet" | "tokens" | "scene" | "shared" | "library" | "system";

const THEME_KEY = "nephyrus:theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export const theme = signal<Theme>(initialTheme());
export const connected = signal(false);
export const connectionState = signal<"connecting" | "online" | "reconnecting" | "offline">("connecting");
export const activeTab = signal<DockTab>("chat");
export const dockOpen = signal(false);
export const sceneList = signal<SceneListItem[]>([]);
export const activeTool = signal<string | null>(null);
export const openPanel = signal<"fog" | "turn" | "layers" | null>(null);

export interface ChatEntry {
  id: string;
  author: string;
  text: string;
  kind: "chat" | "system" | "dice" | "share";
  ts: number;
}

export const chatLog = signal<ChatEntry[]>([]);

export interface DiceResult {
  id: string;
  roller: string;
  notation: string | null;
  label: string | null;
  total: number;
  dice: { sides: number; value: number }[];
  modifier: number;
  ts: number;
}

export const diceHistory = signal<DiceResult[]>([]);

export interface TurnCombatant {
  id: string;
  name: string;
  initiative: number;
}

export interface TurnState {
  order: TurnCombatant[];
  active: number;
  round: number;
}

export const turnState = signal<TurnState>({ order: [], active: 0, round: 1 });

export interface SharedItem {
  id: string;
  kind: string;
  name: string;
  url: string;
  from: string;
  ts: number;
}

export const sharedItems = signal<SharedItem[]>([]);

export interface UiNotice {
  id: number;
  title: string;
  message: string;
}

export const uiNotice = signal<UiNotice | null>(null);

let noticeSeq = 0;
export function showUiNotice(title: string, message: string): void {
  uiNotice.value = { id: ++noticeSeq, title, message };
}

export interface PresenceMember {
  user_id: string;
  display_name: string;
  is_gm: boolean;
}

export const presence = signal<PresenceMember[]>([]);

export interface PublicSheetUpdate {
  sheet_id: string;
  title: string;
  owner_name: string;
  values: Record<string, unknown>;
  received_at: number;
}

export const publicSheetUpdates = signal<Map<string, PublicSheetUpdate>>(new Map());

let logSeq = 0;
export function pushLog(entry: Omit<ChatEntry, "id" | "ts">): void {
  const next: ChatEntry = { ...entry, id: `log-${++logSeq}`, ts: Date.now() };
  chatLog.value = [...chatLog.value, next].slice(-500);
}

export function applyTheme(next: Theme): void {
  theme.value = next;
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

export function toggleTheme(): void {
  applyTheme(theme.value === "dark" ? "light" : "dark");
}
