/**
 * GameState — estado do cliente para a cena atual (Model no MVC).
 *
 * Guarda a cena, o grid e os tokens indexados por id. Não conhece PixiJS
 * nem WebSocket; é apenas a fonte da verdade local.
 */
import { TokenModel } from "./token_model.js";

export class GameState {
  constructor() {
    this.sceneId = null;
    this.campaignId = null;
    this.name = "";
    this.backgroundUrl = null;
    this.width = 0;
    this.height = 0;
    this.grid = { enabled: true, size_px: 64, meters_per_square: 1.5 };
    // Névoa: ativa? + conjunto de células reveladas (chave "cx,cy").
    this.fog = { enabled: false, cells: new Set() };
    /** @type {Map<number, TokenModel>} */
    this.tokens = new Map();
  }

  /** Carrega o estado a partir do payload `scene:state`. */
  loadScene(scene) {
    this.sceneId = scene.id;
    this.campaignId = scene.campaign_id;
    this.name = scene.name;
    this.backgroundUrl = scene.background_url;
    this.width = scene.width;
    this.height = scene.height;
    this.grid = { ...scene.grid };
    this.setFog(scene.fog);
    this.tokens.clear();
    for (const t of scene.tokens ?? []) {
      this.tokens.set(t.id, new TokenModel(t));
    }
  }

  upsertToken(data) {
    const existing = this.tokens.get(data.id);
    if (existing) return existing.update(data);
    const token = new TokenModel(data);
    this.tokens.set(token.id, token);
    return token;
  }

  removeToken(tokenId) {
    this.tokens.delete(tokenId);
  }

  setGrid(grid) {
    this.grid = { ...this.grid, ...grid };
  }

  /** Substitui o estado completo da névoa (payload `fog:state`/`scene.fog`). */
  setFog(fog) {
    const enabled = Boolean(fog?.enabled);
    const cells = new Set();
    for (const [cx, cy] of fog?.cells ?? []) cells.add(`${cx},${cy}`);
    this.fog = { enabled, cells };
  }

  /** Aplica um lote incremental (payload `fog:update`). */
  applyFogUpdate({ cells = [], revealed = true } = {}) {
    for (const [cx, cy] of cells) {
      const key = `${cx},${cy}`;
      if (revealed) this.fog.cells.add(key);
      else this.fog.cells.delete(key);
    }
  }

  setFogEnabled(enabled) {
    this.fog.enabled = Boolean(enabled);
  }
}
