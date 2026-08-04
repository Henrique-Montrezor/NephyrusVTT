/**
 * ToolsController — ferramentas da mesa (caneta, texto, régua, raio, magia).
 *
 * Traduz gestos do ponteiro (via TableView.setTool) em anotações desenhadas
 * e sincronizadas com a sala. Régua e raio são medições locais e efêmeras.
 */
import { MESSAGE_TYPES } from "../network/message_types.js";

export class ToolsController {
  /**
   * @param {object} deps
   * @param {import("../views/table_view.js").TableView} deps.view
   * @param {import("./websocket_controller.js").WebSocketController} deps.ws
   * @param {import("../models/game_state.js").GameState} deps.state
   * @param {object} deps.identity
   */
  constructor({ view, ws, state, identity }) {
    this.view = view;
    this.ws = ws;
    this.state = state;
    this.identity = identity;
    this.active = null;
    this.color = "#e5484d";
    this.metricShape = "circle"; // ruler | circle | cone | line
    this.persist = true; // fixar a métrica no mapa (sincronizada)
    this.onToolChange = null; // (name) => void
    this.onBoardTurn = null; // (turn) => void
  }

  start() {
    this.ws.on(MESSAGE_TYPES.BOARD_STATE, (b) => this._applyBoard(b));
    this.ws.on(MESSAGE_TYPES.DRAW_STROKE, (s) => this.view.addStroke(s));
    this.ws.on(MESSAGE_TYPES.DRAW_CLEAR, () => this.view.clearStrokes());
    this.ws.on(MESSAGE_TYPES.TEXT_ADD, (t) => this.view.addText(t));
    this.ws.on(MESSAGE_TYPES.TEXT_REMOVE, (p) => this.view.removeText(p?.id));
    this.ws.on(MESSAGE_TYPES.TEMPLATE_ADD, (t) => this.view.addTemplate(t));
    this.ws.on(MESSAGE_TYPES.TEMPLATE_MOVE, (p) =>
      this.view.moveTemplate(p?.id, p?.x, p?.y, p?.x2, p?.y2),
    );
    this.ws.on(MESSAGE_TYPES.TEMPLATE_REMOVE, (p) => this.view.removeTemplate(p?.id));
    this.ws.on(MESSAGE_TYPES.TEMPLATE_CLEAR, () => this.view.clearTemplates());
    // Métricas persistentes são movíveis/apagáveis por qualquer um (sem restrição).
    this.view.setTemplateCallbacks({
      onMove: (id, x, y, x2, y2) =>
        this.ws.send(MESSAGE_TYPES.TEMPLATE_MOVE, { id, x, y, x2, y2 }),
      onDelete: (id) => this.ws.send(MESSAGE_TYPES.TEMPLATE_REMOVE, { id }),
    });
    this.ws.send(MESSAGE_TYPES.BOARD_REQUEST, {});
  }

  _applyBoard(b) {
    this.view.clearStrokes();
    (b?.strokes || []).forEach((s) => this.view.addStroke(s));
    this.view.clearTexts();
    (b?.texts || []).forEach((t) => this.view.addText(t));
    this.view.clearTemplates();
    (b?.templates || []).forEach((t) => this.view.addTemplate(t));
    if (typeof this.onBoardTurn === "function") this.onBoardTurn(b?.turn);
  }

  setColor(c) {
    this.color = c;
  }

  setMetricShape(s) {
    this.metricShape = s;
  }

  setPersist(b) {
    this.persist = Boolean(b);
  }

  /** Ativa uma ferramenta ("select"|"pen"|"text"|"ruler"|"radius"|"spell"). */
  selectTool(name) {
    // Clicar na ferramenta ativa a desliga (volta a selecionar).
    this.active = this.active === name ? null : name;
    const tool = this.active;
    if (!tool || tool === "select") this.view.setTool(null, null);
    else if (tool === "pen") this._activatePen();
    else if (tool === "text") this._activateText();
    else if (tool === "metric") this._activateMetric();
    if (typeof this.onToolChange === "function") this.onToolChange(this.active);
  }

  // --- Ações do Mestre ---
  clearDrawings() {
    this.ws.send(MESSAGE_TYPES.DRAW_CLEAR, {});
  }
  clearTemplatesAll() {
    this.ws.send(MESSAGE_TYPES.TEMPLATE_CLEAR, {});
  }

  // --- Utilidades ---
  _uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  /** Restringe um ponto aos limites do mapa. */
  _clamp(p) {
    return this.view.clampPoint ? this.view.clampPoint(p.x, p.y) : p;
  }

  _metersLabel(px) {
    const g = this.state.grid;
    if (!g || !g.size_px || !g.meters_per_square) return `${Math.round(px)} px`;
    const pxPerMeter = g.size_px / g.meters_per_square;
    return `${(px / pxPerMeter).toFixed(1)} m`;
  }

  // --- Ferramentas ---
  _activatePen() {
    let pts = null;
    this.view.setTool("pen", {
      onDown: (p0) => {
        const p = this._clamp(p0);
        pts = [p.x, p.y];
      },
      onMove: (p0) => {
        if (!pts) return;
        const p = this._clamp(p0);
        const lx = pts[pts.length - 2];
        const ly = pts[pts.length - 1];
        if (Math.hypot(p.x - lx, p.y - ly) > 3) {
          pts.push(p.x, p.y);
          this.view.showStrokePreview(pts, this.color);
        }
      },
      onUp: () => {
        this.view.clearMeasure();
        if (pts && pts.length >= 4) {
          const stroke = { id: this._uid(), points: pts, color: this.color, width: 3 };
          this.view.addStroke(stroke);
          this.ws.send(MESSAGE_TYPES.DRAW_STROKE, stroke);
        }
        pts = null;
      },
    });
  }

  _activateText() {
    this.view.setTool("text", {
      onDown: (p0) => {
        const p = this._clamp(p0);
        const txt = prompt("Texto no mapa:");
        if (!txt || !txt.trim()) return;
        const t = {
          id: this._uid(),
          x: p.x,
          y: p.y,
          text: txt.trim(),
          color: this.color,
          size: 22,
        };
        this.view.addText(t);
        this.ws.send(MESSAGE_TYPES.TEXT_ADD, t);
      },
    });
  }

  _activateMetric() {
    const st = { a: null, b: null };
    const labelFor = (a, b) =>
      this._metersLabel(Math.hypot(b.x - a.x, b.y - a.y));
    this.view.setTool("metric", {
      onDown: (p) => {
        st.a = this._clamp(p);
        st.b = st.a;
      },
      onMove: (p) => {
        if (!st.a) return;
        st.b = this._clamp(p);
        this.view.showMetricPreview(this.metricShape, st.a, st.b, this.color, labelFor(st.a, st.b));
      },
      onUp: () => {
        this.view.clearMeasure();
        const { a, b } = st;
        st.a = null;
        if (!a || !b) return;
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        if (r < 6) return;
        // Persistir: vira um objeto no mapa (sincronizado, movível, apagável).
        if (this.persist) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const t = {
            id: this._uid(),
            shape: this.metricShape,
            x: a.x,
            y: a.y,
            x2: b.x,
            y2: b.y,
            radius: r,
            angle,
            color: this.color,
            label: labelFor(a, b),
          };
          this.view.addTemplate(t);
          this.ws.send(MESSAGE_TYPES.TEMPLATE_ADD, t);
        }
      },
    });
  }
}
