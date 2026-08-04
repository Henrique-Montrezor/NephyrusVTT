/**
 * TableController — orquestra GameState, TableView e WebSocketController.
 *
 * Aplica atualizações remotas na tela e envia ações locais (mover token) ao
 * Host. Também decide permissões de controle no cliente (o backend revalida).
 */
import { MESSAGE_TYPES } from "../network/message_types.js";

export class TableController {
  /**
   * @param {object} deps
   * @param {import("../models/game_state.js").GameState} deps.state
   * @param {import("../views/table_view.js").TableView} deps.view
   * @param {import("./websocket_controller.js").WebSocketController} deps.ws
   * @param {object} deps.identity  { userId, isGm }
   */
  constructor({ state, view, ws, identity }) {
    this.state = state;
    this.view = view;
    this.ws = ws;
    this.identity = identity;

    /** Callback opcional chamado quando a lista de tokens muda (para a UI). */
    this.onTokensChanged = null;

    // Permite ao View consultar o modelo do token para checar permissão.
    this.view.setTokenResolver((id) => this.state.tokens.get(id));
  }

  _notifyTokens() {
    if (typeof this.onTokensChanged === "function") {
      this.onTokensChanged([...this.state.tokens.values()]);
    }
  }

  /** Registra os listeners de rede e solicita a cena. */
  start() {
    this.ws.on(MESSAGE_TYPES.SCENE_STATE, (p) => this._onSceneState(p));
    this.ws.on(MESSAGE_TYPES.SCENE_LIST, (p) => this._onSceneList(p));
    this.ws.on(MESSAGE_TYPES.TOKEN_MOVE, (p) => this._onTokenUpsert(p));
    this.ws.on(MESSAGE_TYPES.TOKEN_ADD, (p) => this._onTokenUpsert(p));
    this.ws.on(MESSAGE_TYPES.TOKEN_UPDATE, (p) => this._onTokenUpsert(p));
    this.ws.on(MESSAGE_TYPES.TOKEN_REMOVE, (p) => this._onTokenRemove(p));
    this.ws.on(MESSAGE_TYPES.GRID_UPDATE, (p) => this._onGridUpdate(p));
    this.ws.on(MESSAGE_TYPES.FOG_STATE, (p) => this._onFogState(p));
    this.ws.on(MESSAGE_TYPES.FOG_UPDATE, (p) => this._onFogUpdate(p));

    this.requestScene();
  }

  /** Solicita uma cena (GM pode passar um id; jogadores recebem a ativa). */
  requestScene(sceneId = null) {
    this.ws.send(MESSAGE_TYPES.SCENE_REQUEST, sceneId != null ? { scene_id: sceneId } : {});
  }

  // --- Gerenciamento de cenas (GM) ---

  /** Pede a lista de cenas ao servidor. */
  listScenes() {
    this.ws.send(MESSAGE_TYPES.SCENE_LIST, {});
  }
  createScene(name, backgroundUrl = null) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.SCENE_CREATE, { name: name || null, background_url: backgroundUrl });
  }
  renameScene(sceneId, name) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.SCENE_RENAME, { scene_id: sceneId, name });
  }
  /** Traz todos os jogadores para esta cena (torna-a ativa). */
  activateScene(sceneId) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.SCENE_ACTIVATE, { scene_id: sceneId });
  }
  deleteScene(sceneId) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.SCENE_DELETE, { scene_id: sceneId });
  }
  /** Abre uma cena na visão do GM (sem trazer os jogadores). */
  openScene(sceneId) {
    this.requestScene(sceneId);
  }

  _onSceneList(payload) {
    if (typeof this.onScenesChanged === "function") {
      this.onScenesChanged(payload?.scenes || []);
    }
  }

  /** Verdadeiro se o usuário pode controlar o token (GM ou dono). */
  canControlToken(token) {
    if (!token) return false;
    return this.identity.isGm || token.ownerId === this.identity.userId;
  }

  // --- Handlers de rede ---

  async _onSceneState(scene) {
    this.state.loadScene(scene);
    await this.view.setBackground(scene.background_url, scene.width, scene.height);
    this.view.drawGrid(this.state.grid, scene.width, scene.height);
    this.view.clearTokens();
    for (const token of this.state.tokens.values()) {
      this.view.addOrUpdateToken(token);
    }
    this._redrawFog();
    this._notifyTokens();
  }

  _onTokenUpsert(data) {
    // Ignora tokens de uma cena que este cliente não está vendo.
    if (data.scene_id != null && data.scene_id !== this.state.sceneId) return;
    const token = this.state.upsertToken(data);
    this.view.addOrUpdateToken(token);
    this._redrawFog(); // luz do token pode ter mudado → recorta a névoa
    this._notifyTokens();
  }

  _onTokenRemove({ token_id }) {
    this.state.removeToken(token_id);
    this.view.removeToken(token_id);
    this._redrawFog();
    this._notifyTokens();
  }

  _onGridUpdate(grid) {
    if (grid.scene_id != null && grid.scene_id !== this.state.sceneId) return;
    this.state.setGrid(grid);
    this.view.drawGrid(this.state.grid, this.state.width, this.state.height);
    this._redrawFog();
  }

  // --- Névoa de Guerra ---

  _redrawFog() {
    this._updateLights();
    this.view.drawFog(
      this.state.fog,
      this.state.width,
      this.state.height,
      this.identity.isGm,
    );
    if (typeof this.onFogChanged === "function") this.onFogChanged(this.state.fog);
  }

  /** Calcula as fontes de luz (tokens com light_radius) em pixels. */
  _updateLights() {
    const g = this.state.grid || {};
    const pxPerMeter =
      g.size_px && g.meters_per_square ? g.size_px / g.meters_per_square : g.size_px || 64;
    const lights = [];
    for (const t of this.state.tokens.values()) {
      if (t.lightRadius > 0) {
        const w = t.width || (t.sizeSquares || 1) * (g.size_px || 64);
        const h = t.height || (t.sizeSquares || 1) * (g.size_px || 64);
        lights.push({ x: t.x + w / 2, y: t.y + h / 2, r: t.lightRadius * pxPerMeter });
      }
    }
    this.view.setLights(lights);
  }

  _onFogState({ enabled, cells, scene_id } = {}) {
    if (scene_id != null && scene_id !== this.state.sceneId) return;
    this.state.setFog({ enabled, cells });
    this._redrawFog();
  }

  _onFogUpdate(update) {
    if (update.scene_id != null && update.scene_id !== this.state.sceneId) return;
    this.state.applyFogUpdate(update);
    this._redrawFog();
  }

  // --- Ações locais ---

  /** Chamado pela View ao soltar um token: envia o movimento ao Host. */
  handleTokenDragEnd(tokenId, x, y) {
    const token = this.state.tokens.get(tokenId);
    if (!this.canControlToken(token)) {
      // Reverte visualmente para a posição autoritativa conhecida.
      if (token) this.view.addOrUpdateToken(token);
      return;
    }
    // Atualização otimista local; o broadcast do servidor confirma.
    token.update({ x, y });
    this.ws.send(MESSAGE_TYPES.TOKEN_MOVE, { token_id: tokenId, x, y });
  }

  // --- Ações de GM ---

  updateGrid(partial) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.GRID_UPDATE, {
      scene_id: this.state.sceneId,
      ...partial,
    });
  }

  /** GM: adiciona um novo token à cena atual. */
  addToken({ name, image_url, owner_id, is_hidden, width, height, layer } = {}) {
    if (!this.identity.isGm) return;
    const step = this.state.grid.size_px || 64;
    this.ws.send(MESSAGE_TYPES.TOKEN_ADD, {
      scene_id: this.state.sceneId,
      token: {
        name: name || "Token",
        image_url: image_url || null,
        x: step * 2,
        y: step * 2,
        size_squares: 1,
        width: width || null,
        height: height || null,
        layer: layer || "object",
        owner_id: owner_id || null,
        is_hidden: Boolean(is_hidden),
      },
    });
  }

  /** GM: alterna a visibilidade (esconder/revelar) de um token. */
  toggleTokenVisibility(tokenId) {
    if (!this.identity.isGm) return;
    const token = this.state.tokens.get(tokenId);
    if (!token) return;
    this.ws.send(MESSAGE_TYPES.TOKEN_VISIBILITY, {
      token_id: tokenId,
      is_hidden: !token.isHidden,
    });
  }

  /** GM: remove um token da cena. */
  removeToken(tokenId) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.TOKEN_REMOVE, { token_id: tokenId });
  }

  /** Atualiza nome/tamanho/estado de um token (dono ou GM). */
  updateToken(tokenId, props = {}) {
    const token = this.state.tokens.get(tokenId);
    if (!this.canControlToken(token)) return;
    const { name, width, height, is_locked, light_radius, conditions, layer } = props;
    const payload = { token_id: tokenId };
    if (name != null) payload.name = name;
    if (width != null) payload.width = width;
    if (height != null) payload.height = height;
    if (is_locked != null) payload.is_locked = is_locked;
    if (light_radius != null) payload.light_radius = light_radius;
    if (conditions != null) payload.conditions = conditions;
    if (layer != null) payload.layer = layer;
    this.ws.send(MESSAGE_TYPES.TOKEN_UPDATE, payload);
  }

  /** GM: move um token para outra camada (map | object | gm). */
  setTokenLayer(tokenId, layer) {
    if (!this.identity.isGm) return;
    this.updateToken(tokenId, { layer });
  }

  /** Mostra/esconde uma camada localmente (preferência do GM). */
  setLayerVisible(layerKey, visible) {
    this.view.setLayerVisible(layerKey, visible);
  }

  /** Atalhos do menu de contexto. */
  setTokenLock(tokenId, locked) {
    this.updateToken(tokenId, { is_locked: Boolean(locked) });
  }
  setTokenLight(tokenId, meters) {
    this.updateToken(tokenId, { light_radius: Math.max(0, meters || 0) });
  }
  setTokenConditions(tokenId, list) {
    this.updateToken(tokenId, { conditions: list || [] });
  }

  /** Chamado pela View ao terminar o resize por alças. */
  handleTokenResizeEnd(tokenId, width, height) {
    this.updateToken(tokenId, { width, height });
  }

  /** Preferência LOCAL de snap (não sincronizada). */
  setSnap(enabled) {
    this.view.setSnap(enabled);
  }

  /** GM: redimensiona o mapa (em pixels). */
  resizeScene(width, height) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.SCENE_RESIZE, {
      scene_id: this.state.sceneId,
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  // --- Névoa de Guerra (GM) ---

  /** GM: ativa/desativa a névoa. Atualização otimista local. */
  toggleFog(enabled) {
    if (!this.identity.isGm) return;
    this.state.setFogEnabled(enabled);
    this._redrawFog();
    this.ws.send(MESSAGE_TYPES.FOG_TOGGLE, {
      scene_id: this.state.sceneId,
      enabled: Boolean(enabled),
    });
  }

  /** GM: define o modo do pincel de névoa (null | "reveal" | "hide"). */
  setFogEditMode(mode) {
    if (!this.identity.isGm) return;
    this.view.setFogEditMode(mode);
  }

  /** GM: pincelada — revela/oculta células. Otimista local + envia ao Host. */
  paintFog(cells, revealed) {
    if (!this.identity.isGm || !cells?.length) return;
    this.state.applyFogUpdate({ cells, revealed });
    this._redrawFog();
    this.ws.send(MESSAGE_TYPES.FOG_REVEAL, {
      scene_id: this.state.sceneId,
      cells,
      revealed: Boolean(revealed),
    });
  }

  /** GM: revela tudo (revealed=true) ou oculta tudo (false). */
  resetFog(revealed) {
    if (!this.identity.isGm) return;
    this.ws.send(MESSAGE_TYPES.FOG_RESET, {
      scene_id: this.state.sceneId,
      revealed: Boolean(revealed),
    });
  }

  /** Centraliza a Mesa no token informado (pan da câmera). */
  centerOnToken(tokenId) {
    const token = this.state.tokens.get(tokenId);
    if (!token) return;
    this.view.centerOn(token.x, token.y);
  }
}
