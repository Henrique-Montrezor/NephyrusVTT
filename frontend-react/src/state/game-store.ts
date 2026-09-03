/**
 * Store da cena atual (fonte da verdade local), baseado em signals.
 * Substitui GameState + TokenModel do cliente vanilla. Não conhece PixiJS
 * nem WebSocket — apenas normaliza payloads e expõe estado reativo.
 */
import { computed, signal } from "@preact/signals";
import type {
  FogPayload,
  FogUpdatePayload,
  GridState,
  ScenePayload,
  MapStagePayload,
  Token,
  TokenPayload,
} from "@/net/types";

export interface SceneMeta {
  sceneId: number | null;
  campaignId: string | null;
  name: string;
  backgroundUrl: string | null;
  mapStages: MapStagePayload[];
  activeMapStage: number;
  width: number;
  height: number;
}

export interface FogState {
  enabled: boolean;
  cells: Set<string>;
}

const DEFAULT_GRID: GridState = { enabled: true, size_px: 64, meters_per_square: 1.5 };

export const sceneMeta = signal<SceneMeta>({
  sceneId: null,
  campaignId: null,
  name: "",
  backgroundUrl: null,
  mapStages: [],
  activeMapStage: 0,
  width: 0,
  height: 0,
});

export const grid = signal<GridState>({ ...DEFAULT_GRID });
export const fog = signal<FogState>({ enabled: false, cells: new Set() });

/** Tokens indexados por id. Cada mutação substitui o Map para reatividade. */
export const tokens = signal<Map<number, Token>>(new Map());

export const tokenList = computed(() => [...tokens.value.values()]);

function normalizeToken(data: TokenPayload, prev?: Token): Token {
  const base: Token = prev ?? {
    id: data.id,
    name: "Token",
    imageUrl: null,
    x: 0,
    y: 0,
    sizeSquares: 1,
    width: null,
    height: null,
    layer: "object",
    ownerId: null,
    isHidden: false,
    isLocked: false,
    lightRadius: 0,
    conditions: [],
    activeStage: 0,
    initiative: 0,
    sortOrder: 0,
  };
  return {
    id: data.id,
    name: data.name ?? base.name,
    imageUrl: data.image_url !== undefined ? data.image_url : base.imageUrl,
    x: data.x ?? base.x,
    y: data.y ?? base.y,
    sizeSquares: data.size_squares ?? base.sizeSquares,
    width: data.width !== undefined ? data.width : base.width,
    height: data.height !== undefined ? data.height : base.height,
    layer: data.layer ?? base.layer,
    ownerId: data.owner_id !== undefined ? data.owner_id : base.ownerId,
    isHidden: data.is_hidden !== undefined ? Boolean(data.is_hidden) : base.isHidden,
    isLocked: data.is_locked !== undefined ? Boolean(data.is_locked) : base.isLocked,
    lightRadius: data.light_radius ?? base.lightRadius,
    conditions: data.conditions !== undefined ? data.conditions : base.conditions,
    activeStage: data.active_stage ?? base.activeStage,
    initiative: data.initiative ?? base.initiative,
    sortOrder: data.sort_order ?? base.sortOrder,
  };
}

/** Carrega o estado a partir do payload `scene:state`. */
export function loadScene(scene: ScenePayload): void {
  sceneMeta.value = {
    sceneId: scene.id,
    campaignId: scene.campaign_id,
    name: scene.name,
    backgroundUrl: scene.background_url,
    mapStages: scene.map_stages ?? [],
    activeMapStage: scene.active_map_stage ?? 0,
    width: scene.width,
    height: scene.height,
  };
  grid.value = { ...scene.grid };
  setFog(scene.fog);
  const next = new Map<number, Token>();
  for (const t of scene.tokens ?? []) next.set(t.id, normalizeToken(t));
  tokens.value = next;
}

export function upsertToken(data: TokenPayload): Token {
  const next = new Map(tokens.value);
  const token = normalizeToken(data, next.get(data.id));
  next.set(token.id, token);
  tokens.value = next;
  return token;
}

export function removeToken(tokenId: number): void {
  if (!tokens.value.has(tokenId)) return;
  const next = new Map(tokens.value);
  next.delete(tokenId);
  tokens.value = next;
}

export function setGrid(patch: Partial<GridState>): void {
  grid.value = { ...grid.value, ...patch };
}

/** Substitui o estado completo da névoa (payload `fog:state`/`scene.fog`). */
export function setFog(payload?: FogPayload): void {
  const enabled = Boolean(payload?.enabled);
  const cells = new Set<string>();
  for (const [cx, cy] of payload?.cells ?? []) cells.add(`${cx},${cy}`);
  fog.value = { enabled, cells };
}

/** Aplica um lote incremental (payload `fog:update`). */
export function applyFogUpdate({ cells = [], revealed = true }: FogUpdatePayload = {}): void {
  const nextCells = new Set(fog.value.cells);
  for (const [cx, cy] of cells) {
    const key = `${cx},${cy}`;
    if (revealed) nextCells.add(key);
    else nextCells.delete(key);
  }
  fog.value = { ...fog.value, cells: nextCells };
}

export function setFogEnabled(enabled: boolean): void {
  fog.value = { ...fog.value, enabled: Boolean(enabled) };
}
