/**
 * TableView — renderização da Mesa 2D com PixiJS (View no MVC).
 *
 * Responsável apenas por DESENHAR: mapa de fundo, grid métrico, camadas e
 * tokens. Não fala com o WebSocket nem contém regras — expõe callbacks
 * (onTokenDragEnd) e métodos que o TableController usa para atualizar a tela.
 *
 * PixiJS v8 é carregado via CDN (ES Modules).
 */
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Assets,
  BlurFilter,
  Texture,
  RenderTexture,
} from "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs";
import { CONDITION_DEFS, BADGE_ICONS } from "../ui/token_icons.js";

/** Mapa de condição por chave (cor + ícone). */
const CONDITION_MAP = Object.fromEntries(CONDITION_DEFS.map((c) => [c.key, c]));

export class TableView {
  /**
   * @param {HTMLElement} mountEl Container onde o canvas é inserido.
   * @param {object} callbacks
   * @param {(id:number, x:number, y:number)=>void} callbacks.onTokenDragEnd
   * @param {(token:object)=>boolean} callbacks.canControlToken
   * @param {(id:number, clientX:number, clientY:number)=>void} [callbacks.onTokenContextMenu]
   * @param {(id:number, w:number, h:number)=>void} [callbacks.onTokenResizeEnd]
   */
  constructor(mountEl, {
    onTokenDragEnd,
    canControlToken,
    onTokenContextMenu,
    onTokenResizeEnd,
    onFogPaint,
  } = {}) {
    this.mountEl = mountEl;
    this.onTokenDragEnd = onTokenDragEnd ?? (() => {});
    this.canControlToken = canControlToken ?? (() => false);
    this.onTokenContextMenu = onTokenContextMenu ?? (() => {});
    this.onTokenResizeEnd = onTokenResizeEnd ?? (() => {});
    this.onFogPaint = onFogPaint ?? (() => {});

    this.app = null;
    this.world = null; // container pan/zoom
    this.layers = {};
    /** @type {Map<number, Container>} */
    this.tokenViews = new Map();
    this.grid = { enabled: true, size_px: 64, meters_per_square: 1.5 };

    // Preferência LOCAL: encaixar no grid ao soltar (independente da exibição).
    this.snapEnabled = true;

    // Névoa de guerra: dimensões atuais e modo de pincel do GM.
    this._sceneSize = { width: 0, height: 0 };
    this.fogEditMode = null; // null | "reveal" | "hide"
    this._fogStroke = null; // Set de células já pintadas no traço atual

    // Estado de arraste / redimensionamento ativos.
    this._drag = null;
    this._resize = null;
    this.selectedId = null;

    // Ferramentas (caneta, texto, métrica).
    this.tool = null; // nome da ferramenta ativa (ou null)
    this._toolCb = null; // { onDown, onMove, onUp } em coordenadas do mundo
    this._toolDragging = false;

    // Métricas persistentes (movíveis/apagáveis) e callbacks de rede.
    this._templateDrag = null;
    this.onTemplateMove = () => {};
    this.onTemplateDelete = () => {};

    // Fontes de luz (tokens) que abrem buracos na névoa: [{x, y, r}] em px.
    this._lights = [];
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      background: _readTableBg(),
      resizeTo: this.mountEl,
      antialias: true,
    });
    this.mountEl.appendChild(this.app.canvas);

    // Desativa o menu de contexto nativo do navegador sobre o canvas.
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Container do mundo (alvo de pan/zoom).
    this.world = new Container();
    this.app.stage.addChild(this.world);

    // Camadas empilhadas (ordem = z-index).
    for (const name of [
      "background",
      "map",
      "grid",
      "templates",
      "object",
      "gm",
      "drawings",
      "texts",
      "overlay",
      "measure",
    ]) {
      const c = new Container();
      c.label = name;
      this.layers[name] = c;
      this.world.addChild(c);
    }
    // Névoa de guerra: bordas suavizadas por um desfoque bem leve.
    this.layers.overlay.filters = [new BlurFilter({ strength: 4, quality: 3 })];
    // Camadas puramente visuais não capturam ponteiro (deixam passar p/ tokens).
    this.layers.overlay.eventMode = "none";
    this.layers.measure.eventMode = "none";
    this.layers.background.eventMode = "none";
    this.layers.grid.eventMode = "none";

    // Registros para anotações (por id) e pulsação dos templates de magia.
    this._strokeViews = new Map();
    this._textViews = new Map();
    this._templateViews = new Map();
    this.app.ticker.add((tk) => this._pulseTemplates(tk));

    // Ícones SVG (condições/travado/luz) como textura, para os badges.
    await this._preloadIcons();

    // Encerramento de arraste/resize captura solturas fora do alvo.
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerup", () => {
      this._endDrag();
      this._endResize();
      this._endFogStroke();
      this._endTool();
      this._endTemplateDrag();
    });
    this.app.stage.on("pointerupoutside", () => {
      this._endDrag();
      this._endResize();
      this._endFogStroke();
      this._endTool();
      this._endTemplateDrag();
    });
    this.app.stage.on("pointermove", (e) => {
      this._onDragMove(e);
      this._onResizeMove(e);
      this._onFogPaintMove(e);
      this._onToolMove(e);
      this._onTemplateDragMove(e);
    });
    // Clique em área vazia desmarca o token selecionado (ou aciona ferramenta/névoa).
    this.app.stage.on("pointerdown", (e) => {
      if (e.target !== this.app.stage) return;
      if (this.fogEditMode) {
        this._startFogStroke(e);
        return;
      }
      if (this._toolCb) {
        this._toolDragging = true;
        this._toolCb.onDown?.(this._worldPoint(e), e);
        return;
      }
      this.deselectToken();
    });
  }

  get worldContainer() {
    return this.world;
  }

  // --- Limites do mapa (nada de tokens/assets fora da cena) ---

  /** Restringe um ponto aos limites da cena (0..width, 0..height). */
  clampPoint(x, y) {
    const { width, height } = this._sceneSize;
    if (!width || !height) return { x, y };
    return {
      x: Math.min(Math.max(0, x), width),
      y: Math.min(Math.max(0, y), height),
    };
  }

  /** Restringe um token para caber inteiramente dentro da cena. */
  _clampTokenPos(x, y, w, h) {
    const { width, height } = this._sceneSize;
    if (!width || !height) return { x, y };
    return {
      x: Math.min(Math.max(0, x), Math.max(0, width - w)),
      y: Math.min(Math.max(0, y), Math.max(0, height - h)),
    };
  }

  // --- Cena / fundo / grid ---

  async setBackground(url, width, height) {
    this._sceneSize = { width, height };
    const layer = this.layers.background;
    layer.removeChildren();

    // Tabuleiro visível (mesmo sem imagem): sombra + papel + borda.
    const shadow = new Graphics();
    shadow.rect(7, 9, width, height).fill({ color: 0x000000, alpha: 0.14 });
    layer.addChild(shadow);

    const board = new Graphics();
    this._boardBg = board;
    this._paintBoard(board, width, height);
    layer.addChild(board);

    if (!url) return;
    try {
      const texture = await Assets.load(url);
      const sprite = new Sprite(texture);
      sprite.width = width;
      sprite.height = height;
      layer.addChild(sprite);
    } catch (err) {
      console.warn("[TableView] Falha ao carregar mapa:", err);
    }
  }

  /** Preenche o retângulo do tabuleiro com a cor de papel do tema. */
  _paintBoard(board, width, height) {
    const paper = _toHex(_readVar("--table-paper", "#f7f9fd"), 0xf7f9fd);
    board.clear();
    board.rect(0, 0, width, height).fill({ color: paper });
    board.rect(0, 0, width, height).stroke({ width: 2, color: 0x8a93a8, alpha: 0.7 });
  }

  /** Reaplica as cores do tema à mesa (void + tabuleiro). */
  refreshThemeColors() {
    this.setBackgroundColor(_readTableBg());
    if (this._boardBg && this._sceneSize.width) {
      this._paintBoard(this._boardBg, this._sceneSize.width, this._sceneSize.height);
    }
  }

  drawGrid(grid, width, height) {
    this.grid = { ...grid };
    const layer = this.layers.grid;
    layer.removeChildren();
    if (!grid.enabled) return;

    const g = new Graphics();
    const step = grid.size_px;
    for (let x = 0; x <= width; x += step) {
      g.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      g.moveTo(0, y).lineTo(width, y);
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
    layer.addChild(g);
  }

  // --- Névoa de Guerra (recorte suave por gradiente) ---

  /**
   * Desenha a névoa na camada "overlay". Um retângulo escuro cobre a cena e
   * dele são "recortadas" as áreas reveladas: células pintadas pelo GM e
   * círculos de luz com gradiente (luz → escuridão) nas bordas.
   */
  drawFog(fog, width, height, isGm) {
    this._sceneSize = { width, height };
    const layer = this.layers.overlay;
    layer.removeChildren();
    if (this._fogSprite) {
      this._fogSprite.destroy();
      this._fogSprite = null;
    }
    if (this._fogRT) {
      this._fogRT.destroy(true);
      this._fogRT = null;
    }
    if (!fog || !fog.enabled || !this.app) return;

    const step = this.grid.size_px || 64;
    const pad = Math.max(1, step * 0.04);
    const lights = this._lights || [];

    // Cena auxiliar renderizada para textura (o blend "erase" precisa de um
    // alvo isolado para recortar apenas a névoa, não o mapa por trás).
    const scene = new Container();
    const dark = new Graphics();
    dark.rect(0, 0, width, height).fill({ color: 0x0a1018, alpha: 1 });
    scene.addChild(dark);

    // Células reveladas manualmente pelo GM (união, sem emendas internas).
    if (fog.cells && fog.cells.size) {
      const holes = new Graphics();
      for (const key of fog.cells) {
        const [cx, cy] = key.split(",").map(Number);
        holes.rect(cx * step - pad, cy * step - pad, step + pad * 2, step + pad * 2);
      }
      holes.fill({ color: 0xffffff });
      holes.blendMode = "erase";
      scene.addChild(holes);
    }

    // Pontos de luz: círculos com gradiente que recortam a névoa suavemente.
    if (this._lightGradTex) {
      for (const l of lights) {
        const s = new Sprite(this._lightGradTex);
        s.anchor.set(0.5);
        s.x = l.x;
        s.y = l.y;
        s.width = s.height = l.r * 2;
        s.blendMode = "erase";
        scene.addChild(s);
      }
    }

    const rt = RenderTexture.create({
      width: Math.max(1, Math.ceil(width)),
      height: Math.max(1, Math.ceil(height)),
    });
    this.app.renderer.render({ container: scene, target: rt });
    scene.destroy({ children: true });

    const sprite = new Sprite(rt);
    sprite.alpha = isGm ? 0.5 : 0.97;
    layer.addChild(sprite);
    this._fogSprite = sprite;
    this._fogRT = rt;
  }

  /** Define as fontes de luz (em px) que abrem a névoa. */
  setLights(list) {
    this._lights = list || [];
  }

  // --- Ferramentas / anotações (desenho, texto, régua, raio, magia) ---

  _worldPoint(e) {
    return this.world.toLocal(e.global);
  }

  /** Define a ferramenta ativa e seus callbacks (mundo). null = seleção. */
  setTool(name, callbacks) {
    this.tool = name || null;
    this._toolCb = callbacks || null;
    if (this.app) {
      this.app.canvas.style.cursor = this.tool ? "crosshair" : "default";
    }
    this.clearMeasure();
  }

  _onToolMove(e) {
    if (this._toolDragging && this._toolCb) {
      this._toolCb.onMove?.(this._worldPoint(e), e);
    }
  }

  _endTool() {
    if (this._toolDragging && this._toolCb) {
      this._toolCb.onUp?.();
    }
    this._toolDragging = false;
  }

  // Desenho (caneta) — traços persistentes na camada "drawings".
  addStroke(stroke) {
    if (this._strokeViews.has(stroke.id)) return;
    const pts = stroke.points || [];
    if (pts.length < 4) return;
    const g = new Graphics();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({
      width: stroke.width || 3,
      color: _toHex(stroke.color, 0xe5484d),
      alpha: 0.95,
      cap: "round",
      join: "round",
    });
    this.layers.drawings.addChild(g);
    this._strokeViews.set(stroke.id, g);
  }

  clearStrokes() {
    for (const g of this._strokeViews.values()) g.destroy();
    this._strokeViews.clear();
  }

  // Texto — rótulos na camada "texts".
  addText(t) {
    if (this._textViews.has(t.id)) return;
    const label = new Text({
      text: t.text,
      style: {
        fill: _toHex(t.color, 0xf8fafc),
        fontSize: t.size || 20,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: "700",
        stroke: { color: 0x0a0e18, width: 4 },
        align: "center",
      },
    });
    label.anchor.set(0.5);
    label.x = t.x;
    label.y = t.y;
    this.layers.texts.addChild(label);
    this._textViews.set(t.id, label);
  }

  removeText(id) {
    const v = this._textViews.get(id);
    if (v) {
      v.destroy();
      this._textViews.delete(id);
    }
  }

  clearTexts() {
    for (const v of this._textViews.values()) v.destroy();
    this._textViews.clear();
  }

  // Métricas persistentes (círculo/cone/linha/régua) — movíveis e apagáveis.
  setTemplateCallbacks({ onMove, onDelete } = {}) {
    if (onMove) this.onTemplateMove = onMove;
    if (onDelete) this.onTemplateDelete = onDelete;
  }

  addTemplate(t) {
    if (this._templateViews.has(t.id)) return;
    const color = _toHex(t.color, 0x8b5cf6);
    const relEx = t.shape === "ruler" ? (t.x2 || 0) - t.x : Math.cos(t.angle || 0) * (t.radius || 0);
    const relEy = t.shape === "ruler" ? (t.y2 || 0) - t.y : Math.sin(t.angle || 0) * (t.radius || 0);

    const container = new Container();
    const g = new Graphics();
    this._drawMetricShape(g, t.shape, 0, 0, relEx, relEy, color);
    container.addChild(g);

    if (t.label) {
      const lbl = new Text({
        text: t.label,
        style: {
          fill: 0xffffff,
          fontSize: 14,
          fontWeight: "700",
          fontFamily: "Inter, system-ui, sans-serif",
          stroke: { color: 0x0a1018, width: 4 },
        },
      });
      lbl.anchor.set(0.5);
      if (t.shape === "ruler") {
        lbl.x = relEx / 2;
        lbl.y = relEy / 2;
      } else {
        lbl.y = -(t.radius || 0) - 10;
      }
      container.addChild(lbl);
    }

    container.position.set(t.x, t.y);
    container.eventMode = "static";
    container.cursor = "move";
    container.on("pointerdown", (e) => {
      if (e.button === 2) return;
      this._startTemplateDrag(t.id, e);
    });
    container.on("rightdown", (e) => {
      e.stopPropagation();
      this.onTemplateDelete(t.id);
    });

    this.layers.templates.addChild(container);
    this._templateViews.set(t.id, { container, shape: g, data: { ...t } });
  }

  moveTemplate(id, x, y, x2, y2) {
    const e = this._templateViews.get(id);
    if (!e) return;
    e.container.position.set(x, y);
    e.data.x = x;
    e.data.y = y;
    e.data.x2 = x2;
    e.data.y2 = y2;
  }

  removeTemplate(id) {
    const e = this._templateViews.get(id);
    if (e) {
      e.container.destroy({ children: true });
      this._templateViews.delete(id);
    }
  }

  clearTemplates() {
    for (const e of this._templateViews.values()) e.container.destroy({ children: true });
    this._templateViews.clear();
  }

  /** Desenha a forma da métrica em `g` (coords locais), origem→fim. */
  _drawMetricShape(g, shape, ox, oy, ex, ey, color) {
    const dx = ex - ox;
    const dy = ey - oy;
    const r = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    if (shape === "ruler") {
      g.moveTo(ox, oy).lineTo(ex, ey);
      g.stroke({ width: 3, color, alpha: 0.95, cap: "round" });
      g.circle(ox, oy, 4).circle(ex, ey, 4).fill({ color });
      return { r, angle };
    }
    if (shape === "cone") {
      const spread = (Math.PI / 180) * 53;
      g.moveTo(ox, oy);
      g.arc(ox, oy, r, angle - spread / 2, angle + spread / 2);
      g.lineTo(ox, oy);
    } else if (shape === "line") {
      const w = (this.grid.size_px || 64) * 0.5;
      const px = -Math.sin(angle) * w;
      const py = Math.cos(angle) * w;
      const tx = ox + Math.cos(angle) * r;
      const ty = oy + Math.sin(angle) * r;
      g.moveTo(ox + px, oy + py);
      g.lineTo(tx + px, ty + py);
      g.lineTo(tx - px, ty - py);
      g.lineTo(ox - px, oy - py);
      g.closePath();
    } else {
      g.circle(ox, oy, r); // círculo / esfera
    }
    g.fill({ color, alpha: 0.22 });
    g.stroke({ width: 2, color, alpha: 0.85 });
    return { r, angle };
  }

  _pulseTemplates(tk) {
    if (!this._templateViews || this._templateViews.size === 0) return;
    const t = (this._pulseT = (this._pulseT || 0) + (tk?.deltaMS ?? 16) / 1000);
    const a = 0.8 + Math.sin(t * 2.4) * 0.16;
    for (const e of this._templateViews.values()) e.shape.alpha = a;
  }

  _startTemplateDrag(id, e) {
    const entry = this._templateViews.get(id);
    if (!entry) return;
    const p = this.world.toLocal(e.global);
    this._templateDrag = {
      id,
      container: entry.container,
      offsetX: p.x - entry.container.x,
      offsetY: p.y - entry.container.y,
    };
    e.stopPropagation();
  }

  _onTemplateDragMove(e) {
    if (!this._templateDrag) return;
    const p = this.world.toLocal(e.global);
    const { container, offsetX, offsetY } = this._templateDrag;
    container.position.set(p.x - offsetX, p.y - offsetY);
  }

  _endTemplateDrag() {
    if (!this._templateDrag) return;
    const { id, container } = this._templateDrag;
    this._templateDrag = null;
    const entry = this._templateViews.get(id);
    if (!entry) return;
    // Mantém a métrica dentro dos limites do mapa.
    const cp = this.clampPoint(container.x, container.y);
    container.position.set(cp.x, cp.y);
    const dx = cp.x - entry.data.x;
    const dy = cp.y - entry.data.y;
    const nx2 = (entry.data.x2 || 0) + dx;
    const ny2 = (entry.data.y2 || 0) + dy;
    entry.data.x = cp.x;
    entry.data.y = cp.y;
    entry.data.x2 = nx2;
    entry.data.y2 = ny2;
    this.onTemplateMove(id, cp.x, cp.y, nx2, ny2);
  }

  // Prévia de medição efêmera (camada "measure", só local).
  showMetricPreview(shape, a, b, color, label) {
    const layer = this.layers.measure;
    layer.removeChildren();
    const g = new Graphics();
    this._drawMetricShape(g, shape, a.x, a.y, b.x, b.y, _toHex(color, 0x38bdf8));
    layer.addChild(g);
    if (label) {
      if (shape === "ruler") {
        this._measureLabel(label, (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else {
        this._measureLabel(label, a.x, a.y - Math.hypot(b.x - a.x, b.y - a.y) - 12);
      }
    }
  }

  _measureLabel(text, x, y) {
    const label = new Text({
      text,
      style: {
        fill: 0xffffff,
        fontSize: 15,
        fontWeight: "700",
        fontFamily: "Inter, system-ui, sans-serif",
        stroke: { color: 0x0a1018, width: 4 },
      },
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    this.layers.measure.addChild(label);
  }

  clearMeasure() {
    this.layers.measure?.removeChildren();
  }

  /** Prévia do traço da caneta enquanto se desenha (camada de medição). */
  showStrokePreview(points, color) {
    const layer = this.layers.measure;
    layer.removeChildren();
    if (!points || points.length < 4) return;
    const g = new Graphics();
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.stroke({
      width: 3,
      color: _toHex(color, 0xe5484d),
      alpha: 0.9,
      cap: "round",
      join: "round",
    });
    layer.addChild(g);
  }

  /** Ativa o pincel de névoa do GM: null | "reveal" | "hide". */
  setFogEditMode(mode) {
    this.fogEditMode = mode || null;
    if (this.app) {
      this.app.canvas.style.cursor = this.fogEditMode ? "crosshair" : "default";
    }
  }

  /** Converte um evento de ponteiro em coordenadas de célula do grid. */
  _cellFromEvent(event) {
    const p = this.world.toLocal(event.global);
    const step = this.grid.size_px || 64;
    return { cx: Math.floor(p.x / step), cy: Math.floor(p.y / step) };
  }

  _startFogStroke(event) {
    this._fogStroke = new Set();
    this._paintFogCell(event);
    event.stopPropagation();
  }

  _onFogPaintMove(event) {
    if (!this._fogStroke) return;
    this._paintFogCell(event);
  }

  _paintFogCell(event) {
    const { cx, cy } = this._cellFromEvent(event);
    const { width, height } = this._sceneSize;
    const step = this.grid.size_px || 64;
    // Ignora fora dos limites do mapa.
    if (cx < 0 || cy < 0 || cx * step >= width || cy * step >= height) return;
    const key = `${cx},${cy}`;
    if (this._fogStroke.has(key)) return;
    this._fogStroke.add(key);
    this.onFogPaint([[cx, cy]], this.fogEditMode === "reveal");
  }

  _endFogStroke() {
    this._fogStroke = null;
  }

  // --- Tokens ---

  /** Tamanho efetivo do token em px (width/height ou fallback por grid). */
  _tokenSize(token) {
    const fallback = Math.max(8, (token.sizeSquares || 1) * this.grid.size_px);
    return {
      w: Math.max(8, token.width || fallback),
      h: Math.max(8, token.height || fallback),
    };
  }

  addOrUpdateToken(token) {
    let view = this.tokenViews.get(token.id);
    if (!view) {
      view = this._createTokenView(token);
      this.tokenViews.set(token.id, view);
    }
    // (Re)posiciona o token na camada correta (map/object/gm).
    const target = this.layers[token.layer] || this.layers.object;
    if (view.parent !== target) target.addChild(view);
    this._applyTokenView(view, token);
    if (this.selectedId === token.id) this._drawHandles(view);
  }

  /** Mostra/esconde uma camada de tokens localmente (map | object | gm). */
  setLayerVisible(layerKey, visible) {
    const c = this.layers[layerKey];
    if (c) c.visible = visible !== false;
  }

  removeToken(tokenId) {
    const view = this.tokenViews.get(tokenId);
    if (!view) return;
    if (this.selectedId === tokenId) this.deselectToken();
    view.parent?.removeChild(view);
    view.destroy({ children: true });
    this.tokenViews.delete(tokenId);
  }

  clearTokens() {
    this.deselectToken();
    for (const id of [...this.tokenViews.keys()]) this.removeToken(id);
  }

  _createTokenView(token) {
    const view = new Container();
    view.eventMode = "static";
    view.cursor = "pointer";
    view._tokenId = token.id;

    // Placeholder (só aparece quando NÃO há imagem). Sem fundo por trás da arte.
    const ph = new Graphics();
    ph.label = "ph";
    view.addChild(ph);

    const img = new Sprite();
    img.label = "img";
    view.addChild(img);

    const label = new Text({
      text: token.name,
      style: {
        fill: 0xffffff,
        fontSize: 12,
        fontFamily: "system-ui",
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.label = "label";
    label.anchor.set(0.5, 0);
    view.addChild(label);

    // Container das alças de resize (preenchido quando selecionado).
    const handles = new Container();
    handles.label = "handles";
    view.addChild(handles);

    // Badges de condições / travado / luz.
    const badges = new Container();
    badges.label = "badges";
    view.addChild(badges);

    view.on("pointerdown", (e) => this._startDrag(token.id, e));
    view.on("rightdown", (e) => {
      e.stopPropagation();
      const oe = e.nativeEvent || e;
      this.onTokenContextMenu(token.id, oe.clientX ?? 0, oe.clientY ?? 0);
    });

    if (token.imageUrl) {
      Assets.load(token.imageUrl)
        .then((tex) => {
          img.texture = tex;
          this._applyTokenView(view, this._lookupToken?.(token.id) || token);
        })
        .catch(() => {});
    }
    return view;
  }

  _applyTokenView(view, token) {
    const { w, h } = this._tokenSize(token);
    view.x = token.x;
    view.y = token.y;
    view.alpha = token.isHidden ? 0.55 : 1;

    const img = view.getChildByLabel("img");
    const ph = view.getChildByLabel("ph");
    ph.clear();
    if (img.texture && img.texture.width > 1) {
      img.visible = true;
      img.width = w;
      img.height = h;
    } else {
      // Sem imagem: círculo discreto para o token ficar visível.
      img.visible = false;
      ph.circle(w / 2, h / 2, Math.min(w, h) / 2 - 1);
      ph.fill({ color: token.isHidden ? 0x7c3aed : 0x475569, alpha: 0.9 });
      ph.stroke({ width: 2, color: 0x0b0b12, alpha: 0.8 });
    }

    const label = view.getChildByLabel("label");
    label.text = token.name;
    label.x = w / 2;
    label.y = h + 2;

    view._w = w;
    view._h = h;
    this._drawTokenBadges(view, token, w, h);
  }

  /** Desenha os ícones de condição/travado/luz sobre o token. */
  _drawTokenBadges(view, token, w) {
    const badges = view.getChildByLabel("badges");
    badges.removeChildren();
    const size = 18;
    let bx = 0;
    for (const key of token.conditions || []) {
      const def = CONDITION_MAP[key];
      const color = def ? _toHex(def.color, 0x64748b) : 0x64748b;
      this._badge(badges, bx + size / 2, -size / 2 - 1, size, color, this._iconTex?.[key]);
      bx += size + 2;
    }
    let rx = w;
    if (token.isLocked) {
      this._badge(badges, rx - size / 2, -size / 2 - 1, size, 0x334155, this._iconTex?.__lock);
      rx -= size + 2;
    }
    if (token.lightRadius > 0) {
      this._badge(badges, rx - size / 2, -size / 2 - 1, size, 0xca8a04, this._iconTex?.__light);
    }
  }

  /** Desenha um badge circular colorido com um ícone branco (textura). */
  _badge(parent, cx, cy, size, color, tex) {
    const bg = new Graphics();
    bg.circle(cx, cy, size / 2 + 1).fill({ color }).stroke({ width: 1.5, color: 0x0a1018, alpha: 0.5 });
    parent.addChild(bg);
    if (tex) {
      const s = new Sprite(tex);
      s.width = size - 4;
      s.height = size - 4;
      s.anchor.set(0.5);
      s.x = cx;
      s.y = cy;
      parent.addChild(s);
    }
  }

  /** Carrega os ícones SVG (condições/travado/luz) como texturas Pixi. */
  async _preloadIcons() {
    // Textura radial (branco → transparente) usada para recortar a luz na névoa.
    this._lightGradTex = _makeLightTexture();
    this._iconTex = {};
    for (const c of CONDITION_DEFS) {
      this._iconTex[c.key] = await _svgTexture(c.svg);
    }
    this._iconTex.__lock = await _svgTexture(BADGE_ICONS.lock);
    this._iconTex.__light = await _svgTexture(BADGE_ICONS.light);
    // Redesenha badges de tokens já existentes agora que os ícones carregaram.
    for (const [id, view] of this.tokenViews) {
      const t = this._lookupToken?.(id);
      if (t) this._drawTokenBadges(view, t, view._w);
    }
  }

  // --- Seleção / alças de resize ---

  selectToken(tokenId) {
    if (this.selectedId && this.selectedId !== tokenId) this.deselectToken();
    this.selectedId = tokenId;
    const view = this.tokenViews.get(tokenId);
    if (view) this._drawHandles(view);
  }

  deselectToken() {
    if (this.selectedId == null) return;
    const view = this.tokenViews.get(this.selectedId);
    view?.getChildByLabel("handles")?.removeChildren();
    this.selectedId = null;
  }

  _drawHandles(view) {
    const handles = view.getChildByLabel("handles");
    handles.removeChildren();
    const w = view._w;
    const h = view._h;
    const corners = [
      ["tl", 0, 0],
      ["tr", w, 0],
      ["bl", 0, h],
      ["br", w, h],
    ];
    for (const [corner, hx, hy] of corners) {
      const g = new Graphics();
      g.rect(-6, -6, 12, 12).fill({ color: 0xa855f7 }).stroke({ width: 1, color: 0xffffff });
      g.x = hx;
      g.y = hy;
      g.eventMode = "static";
      g.cursor = "nwse-resize";
      g.on("pointerdown", (e) => this._startResize(view._tokenId, corner, e));
      handles.addChild(g);
    }
  }

  _startResize(tokenId, corner, event) {
    const token = this._lookupToken?.(tokenId);
    if (token && !this.canControlToken(token)) return;
    const view = this.tokenViews.get(tokenId);
    if (!view) return;
    this._resize = {
      tokenId,
      view,
      corner,
      x0: view.x,
      y0: view.y,
      w0: view._w,
      h0: view._h,
    };
    event.stopPropagation();
  }

  _onResizeMove(event) {
    if (!this._resize) return;
    const { view, corner, x0, y0, w0, h0 } = this._resize;
    const p = view.parent.toLocal(event.global);
    const right = x0 + w0;
    const bottom = y0 + h0;
    let nx = x0;
    let ny = y0;
    let nw = w0;
    let nh = h0;

    if (corner === "br") {
      nw = p.x - x0;
      nh = p.y - y0;
    } else if (corner === "tl") {
      nx = p.x;
      ny = p.y;
      nw = right - p.x;
      nh = bottom - p.y;
    } else if (corner === "tr") {
      ny = p.y;
      nw = p.x - x0;
      nh = bottom - p.y;
    } else if (corner === "bl") {
      nx = p.x;
      nw = right - p.x;
      nh = p.y - y0;
    }
    nw = Math.max(8, nw);
    nh = Math.max(8, nh);
    view.x = nx;
    view.y = ny;
    view._w = nw;
    view._h = nh;
    this._applyLiveSize(view, nw, nh);
    this._drawHandles(view);
  }

  _applyLiveSize(view, w, h) {
    const img = view.getChildByLabel("img");
    const ph = view.getChildByLabel("ph");
    if (img.visible) {
      img.width = w;
      img.height = h;
    } else {
      ph.clear();
      ph.circle(w / 2, h / 2, Math.min(w, h) / 2 - 1);
      ph.fill({ color: 0x475569, alpha: 0.9 });
      ph.stroke({ width: 2, color: 0x0b0b12, alpha: 0.8 });
    }
    const label = view.getChildByLabel("label");
    label.x = w / 2;
    label.y = h + 2;
  }

  _endResize() {
    if (!this._resize) return;
    const { tokenId, view, x0, y0 } = this._resize;
    this._resize = null;
    // Se a posição mudou (cantos tl/tr/bl), sincroniza também o movimento.
    if (view.x !== x0 || view.y !== y0) {
      this.onTokenDragEnd(tokenId, view.x, view.y);
    }
    this.onTokenResizeEnd(tokenId, Math.round(view._w), Math.round(view._h));
  }

  /** Preferência local: encaixar no grid ao soltar. */
  setSnap(enabled) {
    this.snapEnabled = Boolean(enabled);
  }

  // --- Arraste de tokens ---

  _startDrag(tokenId, event) {
    // Botão direito não inicia arraste (abre menu de contexto).
    if (event.button === 2) return;
    const token = this._lookupToken?.(tokenId);
    if (token && token.isLocked) return; // travado: não move
    if (token && !this.canControlToken(token)) return;
    const view = this.tokenViews.get(tokenId);
    if (!view) return;
    const pos = view.parent.toLocal(event.global);
    this._drag = {
      tokenId,
      view,
      offsetX: pos.x - view.x,
      offsetY: pos.y - view.y,
    };
    event.stopPropagation();
  }

  _onDragMove(event) {
    if (!this._drag) return;
    const { view, offsetX, offsetY } = this._drag;
    const pos = view.parent.toLocal(event.global);
    const c = this._clampTokenPos(pos.x - offsetX, pos.y - offsetY, view._w, view._h);
    view.x = c.x;
    view.y = c.y;
  }

  _endDrag() {
    if (!this._drag) return;
    const { tokenId, view } = this._drag;
    this._drag = null;
    // Snap-to-grid apenas se a preferência local estiver ligada.
    const step = this.grid.size_px;
    const snapped = this.snapEnabled
      ? {
          x: Math.round(view.x / step) * step,
          y: Math.round(view.y / step) * step,
        }
      : { x: view.x, y: view.y };
    // Mantém o token dentro dos limites do mapa.
    const c = this._clampTokenPos(snapped.x, snapped.y, view._w, view._h);
    view.x = c.x;
    view.y = c.y;
    this.onTokenDragEnd(tokenId, c.x, c.y);
  }

  /** Permite ao controller injetar um resolvedor de token (para permissão). */
  setTokenResolver(fn) {
    this._lookupToken = fn;
  }

  /** Centraliza a câmera (world) sobre um ponto do mundo da cena. */
  centerOn(worldX, worldY) {
    if (!this.app || !this.world) return;
    const scale = this.world.scale.x;
    this.world.x = this.app.screen.width / 2 - worldX * scale;
    this.world.y = this.app.screen.height / 2 - worldY * scale;
  }

  /** Atualiza a cor de fundo da Mesa (usado ao alternar o tema). */
  setBackgroundColor(cssColor) {
    if (this.app?.renderer) this.app.renderer.background.color = cssColor;
  }
}

/** Lê uma variável CSS do :root com fallback. */
function _readVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Lê a cor de fundo da mesa a partir da variável CSS --table-bg. */
function _readTableBg() {
  return _readVar("--table-bg", "#c9d0e2");
}

/** Converte uma cor CSS "#rrggbb" em número (0xRRGGBB). */
function _toHex(css, fallback) {
  if (typeof css === "number") return css;
  if (typeof css === "string" && /^#?[0-9a-fA-F]{6}$/.test(css.trim())) {
    return parseInt(css.trim().replace("#", ""), 16);
  }
  return fallback;
}

/** Textura radial (branco no centro → transparente na borda) para os pontos de luz. */
function _makeLightTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.6, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}

/** Cria uma Texture Pixi a partir do conteúdo interno de um SVG. */
function _svgTexture(inner, color = "#ffffff") {
  return new Promise((resolve) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
      `width="48" height="48" fill="none" style="color:${color}">${inner}</svg>`;
    const uri = "data:image/svg+xml;base64," + btoa(svg);
    const img = new Image();
    img.onload = () => resolve(Texture.from(img));
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
