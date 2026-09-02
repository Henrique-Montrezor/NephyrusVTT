/**
 * TableController — orquestra o store (signals), o motor PixiJS e o WebSocket.
 * Porta table_controller.js: aplica atualizações remotas na tela e envia ações
 * locais ao Host. As permissões são checadas no cliente (o backend revalida).
 */
import { MESSAGE_TYPES } from "@/net/message-types";
import { ws } from "@/net/ws";
import type { TableEngine } from "@/engine/table-engine";
import type { Identity, SceneListItem, ScenePayload, TokenCatalogItem, TokenLayer, TokenPayload } from "@/net/types";
import { TokenClient, type TokenCatalogDraft } from "@/net/rest";
import {
  applyFogUpdate,
  fog,
  grid,
  loadScene,
  removeToken as storeRemoveToken,
  sceneMeta,
  setFog,
  setFogEnabled,
  setGrid,
  tokens,
  upsertToken,
} from "@/state/game-store";
import { sceneList } from "@/state/ui-store";
import type { Token } from "@/net/types";
import { removeCatalogToken, replaceTokenCatalog, upsertCatalogToken } from "@/state/token-catalog-store";

export class TableController {
  private readonly tokenClient: TokenClient;

  constructor(
    private readonly engine: TableEngine,
    private readonly identity: Identity,
  ) {
    this.engine.setTokenResolver((id) => tokens.value.get(id));
    this.tokenClient = new TokenClient(identity);
  }

  /** Registra os listeners de rede e solicita a cena. */
  start(): void {
    ws.on(MESSAGE_TYPES.SCENE_STATE, (p) => void this.onSceneState(p));
    ws.on(MESSAGE_TYPES.SCENE_LIST, (p) => this.onSceneList(p));
    ws.on(MESSAGE_TYPES.TOKEN_MOVE, (p) => this.onTokenUpsert(p));
    ws.on(MESSAGE_TYPES.TOKEN_ADD, (p) => this.onTokenUpsert(p));
    ws.on(MESSAGE_TYPES.TOKEN_UPDATE, (p) => this.onTokenUpsert(p));
    ws.on(MESSAGE_TYPES.TOKEN_REMOVE, (p) => this.onTokenRemove(p));
    ws.on(MESSAGE_TYPES.GRID_UPDATE, (p) => this.onGridUpdate(p));
    ws.on(MESSAGE_TYPES.FOG_STATE, (p) => this.onFogState(p));
    ws.on(MESSAGE_TYPES.FOG_UPDATE, (p) => this.onFogUpdate(p));
    ws.on(MESSAGE_TYPES.TOKEN_CATALOG_UPDATE, (p) => upsertCatalogToken(p as TokenCatalogItem));
    ws.on(MESSAGE_TYPES.TOKEN_CATALOG_REMOVE, (p: { token_id: number }) => removeCatalogToken(p.token_id));
    void this.reloadTokenCatalog().catch(() => replaceTokenCatalog([]));
  }

  requestScene(sceneId: number | null = null): void {
    ws.send(MESSAGE_TYPES.SCENE_REQUEST, sceneId != null ? { scene_id: sceneId } : {});
  }

  // --- Cenas (GM) ---
  listScenes(): void {
    ws.send(MESSAGE_TYPES.SCENE_LIST, {});
  }
  createScene(name?: string | null, backgroundUrl: string | null = null): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.SCENE_CREATE, { name: name || null, background_url: backgroundUrl });
  }
  renameScene(sceneId: number, name: string): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.SCENE_RENAME, { scene_id: sceneId, name });
  }
  activateScene(sceneId: number): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.SCENE_ACTIVATE, { scene_id: sceneId });
  }
  moveGroup(sceneId: number): void {
    if (this.identity.isGm) ws.send(MESSAGE_TYPES.SCENE_MOVE_GROUP, { scene_id: sceneId });
  }
  moveMembers(sceneId: number, memberIds: string[]): void {
    if (this.identity.isGm && memberIds.length) {
      ws.send(MESSAGE_TYPES.SCENE_MOVE_MEMBERS, { scene_id: sceneId, member_ids: memberIds });
    }
  }
  deleteScene(sceneId: number): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.SCENE_DELETE, { scene_id: sceneId });
  }
  openScene(sceneId: number): void {
    this.requestScene(sceneId);
  }

  private onSceneList(payload: { scenes?: SceneListItem[] }): void {
    sceneList.value = payload?.scenes ?? [];
  }

  async reloadTokenCatalog(): Promise<void> {
    replaceTokenCatalog(await this.tokenClient.list());
  }

  async createCatalogToken(data: TokenCatalogDraft): Promise<TokenCatalogItem> {
    const token = await this.tokenClient.create(data);
    upsertCatalogToken(token);
    return token;
  }

  async updateCatalogToken(id: number, patch: Partial<TokenCatalogDraft>): Promise<TokenCatalogItem> {
    const token = await this.tokenClient.update(id, patch);
    upsertCatalogToken(token);
    return token;
  }

  async deleteCatalogToken(id: number): Promise<void> {
    await this.tokenClient.remove(id);
    removeCatalogToken(id);
    storeRemoveToken(id);
    this.engine.removeToken(id);
  }

  placeToken(tokenId: number, x: number, y: number): void {
    if (sceneMeta.value.sceneId == null) return;
    ws.send(MESSAGE_TYPES.TOKEN_PLACE, {
      token_id: tokenId,
      scene_id: sceneMeta.value.sceneId,
      x,
      y,
    });
  }

  enginePointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    return this.engine.clientToWorld(clientX, clientY);
  }

  canControlToken(token: Token | undefined | null): boolean {
    if (!token) return false;
    return this.identity.isGm || token.ownerId === this.identity.userId;
  }

  // --- Handlers de rede ---
  private async onSceneState(scene: ScenePayload): Promise<void> {
    loadScene(scene);
    await this.engine.setBackground(scene.background_url, scene.width, scene.height);
    this.engine.drawGrid(grid.value, scene.width, scene.height);
    this.engine.clearTokens();
    for (const token of tokens.value.values()) this.engine.addOrUpdateToken(token);
    this.redrawFog();
  }

  private onTokenUpsert(data: TokenPayload & { scene_id?: number }): void {
    if (data.scene_id != null && data.scene_id !== sceneMeta.value.sceneId) return;
    const token = upsertToken(data);
    this.engine.addOrUpdateToken(token);
    this.redrawFog();
  }

  private onTokenRemove({ token_id }: { token_id: number }): void {
    storeRemoveToken(token_id);
    this.engine.removeToken(token_id);
    this.redrawFog();
  }

  private onGridUpdate(payload: { scene_id?: number } & Partial<typeof grid.value>): void {
    if (payload.scene_id != null && payload.scene_id !== sceneMeta.value.sceneId) return;
    setGrid(payload);
    this.engine.drawGrid(grid.value, sceneMeta.value.width, sceneMeta.value.height);
    this.redrawFog();
  }

  // --- Névoa ---
  private redrawFog(): void {
    this.updateLights();
    this.engine.drawFog(fog.value, sceneMeta.value.width, sceneMeta.value.height, this.identity.isGm);
  }

  private updateLights(): void {
    const g = grid.value;
    const pxPerMeter =
      g.size_px && g.meters_per_square ? g.size_px / g.meters_per_square : g.size_px || 64;
    const lights: { x: number; y: number; r: number }[] = [];
    for (const t of tokens.value.values()) {
      if (t.lightRadius > 0) {
        const w = t.width || (t.sizeSquares || 1) * (g.size_px || 64);
        const h = t.height || (t.sizeSquares || 1) * (g.size_px || 64);
        lights.push({ x: t.x + w / 2, y: t.y + h / 2, r: t.lightRadius * pxPerMeter });
      }
    }
    this.engine.setLights(lights);
  }

  private onFogState(payload: { enabled?: boolean; cells?: [number, number][]; scene_id?: number }): void {
    if (payload.scene_id != null && payload.scene_id !== sceneMeta.value.sceneId) return;
    setFog({ enabled: payload.enabled, cells: payload.cells });
    this.redrawFog();
  }

  private onFogUpdate(update: { cells?: [number, number][]; revealed?: boolean; scene_id?: number }): void {
    if (update.scene_id != null && update.scene_id !== sceneMeta.value.sceneId) return;
    applyFogUpdate(update);
    this.redrawFog();
  }

  // --- Ações locais ---
  handleTokenDragEnd(tokenId: number, x: number, y: number): void {
    const token = tokens.value.get(tokenId);
    if (!this.canControlToken(token)) {
      if (token) this.engine.addOrUpdateToken(token);
      return;
    }
    const updated = upsertToken({ id: tokenId, x, y });
    this.engine.addOrUpdateToken(updated);
    ws.send(MESSAGE_TYPES.TOKEN_MOVE, { token_id: tokenId, x, y });
  }

  // --- Ações de GM ---
  updateGrid(partial: Record<string, unknown>): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.GRID_UPDATE, { scene_id: sceneMeta.value.sceneId, ...partial });
  }

  setSceneBackground(url: string): void {
    if (!this.identity.isGm || sceneMeta.value.sceneId == null) return;
    ws.send(MESSAGE_TYPES.SCENE_BACKGROUND, {
      scene_id: sceneMeta.value.sceneId,
      url,
    });
  }

  addToken(opts: {
    name?: string;
    image_url?: string | null;
    owner_id?: string | null;
    is_hidden?: boolean;
    width?: number | null;
    height?: number | null;
    layer?: TokenLayer;
  } = {}): void {
    if (!this.identity.isGm) return;
    const step = grid.value.size_px || 64;
    ws.send(MESSAGE_TYPES.TOKEN_ADD, {
      scene_id: sceneMeta.value.sceneId,
      token: {
        name: opts.name || "Token",
        image_url: opts.image_url || null,
        x: step * 2,
        y: step * 2,
        size_squares: 1,
        width: opts.width || null,
        height: opts.height || null,
        layer: opts.layer || "object",
        owner_id: opts.owner_id || null,
        is_hidden: Boolean(opts.is_hidden),
      },
    });
  }

  toggleTokenVisibility(tokenId: number): void {
    if (!this.identity.isGm) return;
    const token = tokens.value.get(tokenId);
    if (!token) return;
    ws.send(MESSAGE_TYPES.TOKEN_VISIBILITY, { token_id: tokenId, is_hidden: !token.isHidden });
  }

  removeToken(tokenId: number): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.TOKEN_REMOVE, { token_id: tokenId });
  }

  updateToken(
    tokenId: number,
    props: {
      name?: string;
      width?: number;
      height?: number;
      is_locked?: boolean;
      light_radius?: number;
      conditions?: string[];
      layer?: TokenLayer;
      owner_id?: string | null;
    } = {},
  ): void {
    const token = tokens.value.get(tokenId);
    if (!this.canControlToken(token)) return;
    const payload: Record<string, unknown> = { token_id: tokenId };
    if (props.name != null) payload.name = props.name;
    if (props.width != null) payload.width = props.width;
    if (props.height != null) payload.height = props.height;
    if (props.is_locked != null) payload.is_locked = props.is_locked;
    if (props.light_radius != null) payload.light_radius = props.light_radius;
    if (props.conditions != null) payload.conditions = props.conditions;
    if (props.layer != null) payload.layer = props.layer;
    if (this.identity.isGm && props.owner_id !== undefined) payload.owner_id = props.owner_id;
    ws.send(MESSAGE_TYPES.TOKEN_UPDATE, payload);
  }

  setTokenLayer(tokenId: number, layer: TokenLayer): void {
    if (!this.identity.isGm) return;
    this.updateToken(tokenId, { layer });
  }
  setLayerVisible(layerKey: TokenLayer, visible: boolean): void {
    this.engine.setLayerVisible(layerKey, visible);
  }
  setTokenLock(tokenId: number, locked: boolean): void {
    this.updateToken(tokenId, { is_locked: Boolean(locked) });
  }
  setTokenLight(tokenId: number, meters: number): void {
    this.updateToken(tokenId, { light_radius: Math.max(0, meters || 0) });
  }
  setTokenConditions(tokenId: number, list: string[]): void {
    this.updateToken(tokenId, { conditions: list || [] });
  }
  handleTokenResizeEnd(tokenId: number, width: number, height: number): void {
    this.updateToken(tokenId, { width, height });
  }
  setSnap(enabled: boolean): void {
    this.engine.setSnap(enabled);
  }
  resizeScene(width: number, height: number): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.SCENE_RESIZE, {
      scene_id: sceneMeta.value.sceneId,
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  // --- Névoa (GM) ---
  toggleFog(enabled: boolean): void {
    if (!this.identity.isGm) return;
    setFogEnabled(enabled);
    this.redrawFog();
    ws.send(MESSAGE_TYPES.FOG_TOGGLE, { scene_id: sceneMeta.value.sceneId, enabled: Boolean(enabled) });
  }
  setFogEditMode(mode: string | null): void {
    if (!this.identity.isGm) return;
    this.engine.setFogEditMode(mode);
  }
  paintFog(cells: [number, number][], revealed: boolean): void {
    if (!this.identity.isGm || !cells?.length) return;
    applyFogUpdate({ cells, revealed });
    this.redrawFog();
    ws.send(MESSAGE_TYPES.FOG_REVEAL, {
      scene_id: sceneMeta.value.sceneId,
      cells,
      revealed: Boolean(revealed),
    });
  }
  resetFog(revealed: boolean): void {
    if (!this.identity.isGm) return;
    ws.send(MESSAGE_TYPES.FOG_RESET, { scene_id: sceneMeta.value.sceneId, revealed: Boolean(revealed) });
  }

  centerOnToken(tokenId: number): void {
    const token = tokens.value.get(tokenId);
    if (!token) return;
    this.engine.centerOn(token.x, token.y);
  }
}
