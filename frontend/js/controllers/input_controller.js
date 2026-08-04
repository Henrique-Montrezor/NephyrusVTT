/**
 * InputController — pan e zoom da Mesa (mouse + touch).
 *
 * Opera diretamente sobre o container "world" da TableView. O arraste de
 * tokens tem prioridade (o token chama stopPropagation no pointerdown),
 * então o pan só age quando o clique começa em área vazia.
 */
export class InputController {
  /**
   * @param {import("../views/table_view.js").TableView} view
   * @param {object} [options]
   */
  constructor(view, options = {}) {
    this.view = view;
    this.minScale = options.minScale ?? 0.25;
    this.maxScale = options.maxScale ?? 3;

    this._panning = false;
    this._last = { x: 0, y: 0 };
    this._pointers = new Map(); // suporte a pinch (2 dedos)
    this._pinchDist = 0;
  }

  attach() {
    const app = this.view.app;
    const stage = app.stage;
    stage.eventMode = "static";

    stage.on("pointerdown", (e) => this._onDown(e));
    stage.on("pointermove", (e) => this._onMove(e));
    stage.on("pointerup", (e) => this._onUp(e));
    stage.on("pointerupoutside", (e) => this._onUp(e));

    // Zoom por roda do mouse (desktop).
    app.canvas.addEventListener("wheel", (e) => this._onWheel(e), {
      passive: false,
    });
  }

  _onDown(event) {
    this._pointers.set(event.pointerId, { x: event.global.x, y: event.global.y });
    // No modo de pincel de névoa ou com uma ferramenta ativa, o arraste não faz pan.
    if (this.view.fogEditMode || this.view.tool) return;
    // Só inicia pan se o alvo é o próprio stage (área vazia).
    if (event.target === this.view.app.stage) {
      this._panning = true;
      this._last = { x: event.global.x, y: event.global.y };
    }
  }

  _onMove(event) {
    if (this._pointers.has(event.pointerId)) {
      this._pointers.set(event.pointerId, {
        x: event.global.x,
        y: event.global.y,
      });
    }

    // Pinch-to-zoom com dois ponteiros.
    if (this._pointers.size === 2) {
      this._handlePinch();
      return;
    }

    if (!this._panning) return;
    const world = this.view.worldContainer;
    world.x += event.global.x - this._last.x;
    world.y += event.global.y - this._last.y;
    this._last = { x: event.global.x, y: event.global.y };
  }

  _onUp(event) {
    this._pointers.delete(event.pointerId);
    if (this._pointers.size < 2) this._pinchDist = 0;
    if (this._pointers.size === 0) this._panning = false;
  }

  _handlePinch() {
    const [a, b] = [...this._pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (this._pinchDist === 0) {
      this._pinchDist = dist;
      return;
    }
    const factor = dist / this._pinchDist;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this._zoomAt(center, factor);
    this._pinchDist = dist;
  }

  _onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this._zoomAt({ x: event.offsetX, y: event.offsetY }, factor);
  }

  /** Aplica zoom mantendo o ponto sob o cursor fixo. */
  _zoomAt(screenPoint, factor) {
    const world = this.view.worldContainer;
    const newScale = Math.min(
      this.maxScale,
      Math.max(this.minScale, world.scale.x * factor),
    );
    const realFactor = newScale / world.scale.x;
    world.x = screenPoint.x - (screenPoint.x - world.x) * realFactor;
    world.y = screenPoint.y - (screenPoint.y - world.y) * realFactor;
    world.scale.set(newScale);
  }

  /** Zoom a partir do centro da tela (usado pelos botões da barra de ferramentas). */
  zoomAtCenter(factor) {
    const app = this.view.app;
    if (!app) return;
    this._zoomAt({ x: app.screen.width / 2, y: app.screen.height / 2 }, factor);
  }

  zoomIn() {
    this.zoomAtCenter(1.2);
  }

  zoomOut() {
    this.zoomAtCenter(1 / 1.2);
  }
}
