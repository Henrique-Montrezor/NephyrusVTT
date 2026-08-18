/**
 * InputEngine — pan e zoom da Mesa (mouse + touch).
 *
 * Opera diretamente sobre o container "world" da TableEngine. O arraste de
 * tokens tem prioridade (o token chama stopPropagation no pointerdown),
 * então o pan só age quando o clique começa em área vazia.
 */
import type { FederatedPointerEvent } from "pixi.js";
import type { TableEngine } from "./table-engine";

interface InputOptions {
  minScale?: number;
  maxScale?: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

export class InputEngine {
  view: TableEngine;
  minScale: number;
  maxScale: number;
  private _panning: boolean;
  private _last: ScreenPoint;
  private _pointers: Map<number, ScreenPoint>;
  private _pinchDist: number;

  constructor(view: TableEngine, options: InputOptions = {}) {
    this.view = view;
    this.minScale = options.minScale ?? 0.25;
    this.maxScale = options.maxScale ?? 3;

    this._panning = false;
    this._last = { x: 0, y: 0 };
    this._pointers = new Map(); // suporte a pinch (2 dedos)
    this._pinchDist = 0;
  }

  attach(): void {
    const app = this.view.app;
    const stage = app.stage;
    stage.eventMode = "static";

    stage.on("pointerdown", (e: FederatedPointerEvent) => this._onDown(e));
    stage.on("pointermove", (e: FederatedPointerEvent) => this._onMove(e));
    stage.on("pointerup", (e: FederatedPointerEvent) => this._onUp(e));
    stage.on("pointerupoutside", (e: FederatedPointerEvent) => this._onUp(e));

    // Zoom por roda do mouse (desktop).
    app.canvas.addEventListener("wheel", (e) => this._onWheel(e), {
      passive: false,
    });
  }

  private _onDown(event: FederatedPointerEvent): void {
    this._pointers.set(event.pointerId, { x: event.global.x, y: event.global.y });
    // No modo de pincel de névoa ou com uma ferramenta ativa, o arraste não faz pan.
    if (this.view.fogEditMode || this.view.tool) return;
    // Só inicia pan se o alvo é o próprio stage (área vazia).
    if (event.target === this.view.app.stage) {
      this._panning = true;
      this._last = { x: event.global.x, y: event.global.y };
    }
  }

  private _onMove(event: FederatedPointerEvent): void {
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

  private _onUp(event: FederatedPointerEvent): void {
    this._pointers.delete(event.pointerId);
    if (this._pointers.size < 2) this._pinchDist = 0;
    if (this._pointers.size === 0) this._panning = false;
  }

  private _handlePinch(): void {
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

  private _onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this._zoomAt({ x: event.offsetX, y: event.offsetY }, factor);
  }

  /** Aplica zoom mantendo o ponto sob o cursor fixo. */
  private _zoomAt(screenPoint: ScreenPoint, factor: number): void {
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
  zoomAtCenter(factor: number): void {
    const app = this.view.app;
    if (!app) return;
    this._zoomAt({ x: app.screen.width / 2, y: app.screen.height / 2 }, factor);
  }

  zoomIn(): void {
    this.zoomAtCenter(1.2);
  }

  zoomOut(): void {
    this.zoomAtCenter(1 / 1.2);
  }
}
