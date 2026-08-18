/**
 * ToolsController — ferramentas da mesa (caneta, texto, métrica).
 * Porta tools_controller.js: traduz gestos do ponteiro (via TableEngine.setTool)
 * em anotações desenhadas e sincronizadas com a sala.
 */
import { MESSAGE_TYPES } from "@/net/message-types";
import { ws } from "@/net/ws";
import type { TableEngine } from "@/engine/table-engine";
import { grid } from "@/state/game-store";
import { turnState } from "@/state/ui-store";

type Pt = { x: number; y: number };
export type ToolName = "select" | "pen" | "text" | "metric";
export type MetricShape = "ruler" | "circle" | "cone" | "line";

interface BoardState {
  strokes?: { id: number; points?: number[]; width?: number; color?: string | number }[];
  texts?: { id: number; text: string; color?: string | number; size?: number; x: number; y: number }[];
  templates?: { id: number; shape: string; x: number; y: number; x2?: number; y2?: number; angle?: number; radius?: number; color?: string | number; label?: string }[];
  turn?: { order?: { id: string; name: string; initiative: number }[]; active?: number; round?: number };
}

export class ToolsController {
  active: ToolName | null = null;
  color = "#e5484d";
  metricShape: MetricShape = "circle";
  persist = true;
  onToolChange: ((name: ToolName | null) => void) | null = null;

  constructor(private readonly engine: TableEngine) {}

  start(): void {
    ws.on(MESSAGE_TYPES.BOARD_STATE, (b) => this.applyBoard(b));
    ws.on(MESSAGE_TYPES.DRAW_STROKE, (s) => this.engine.addStroke(s));
    ws.on(MESSAGE_TYPES.DRAW_CLEAR, () => this.engine.clearStrokes());
    ws.on(MESSAGE_TYPES.TEXT_ADD, (t) => this.engine.addText(t));
    ws.on(MESSAGE_TYPES.TEXT_REMOVE, (p) => this.engine.removeText(p?.id));
    ws.on(MESSAGE_TYPES.TEMPLATE_ADD, (t) => this.engine.addTemplate(t));
    ws.on(MESSAGE_TYPES.TEMPLATE_MOVE, (p) => this.engine.moveTemplate(p?.id, p?.x, p?.y, p?.x2, p?.y2));
    ws.on(MESSAGE_TYPES.TEMPLATE_REMOVE, (p) => this.engine.removeTemplate(p?.id));
    ws.on(MESSAGE_TYPES.TEMPLATE_CLEAR, () => this.engine.clearTemplates());
    ws.on(MESSAGE_TYPES.TURN_STATE, (t: { order?: { id: string; name: string; initiative: number }[]; active?: number; round?: number }) => {
      turnState.value = { order: t?.order ?? [], active: t?.active ?? 0, round: t?.round ?? 1 };
    });
    this.engine.setTemplateCallbacks({
      onMove: (id, x, y, x2, y2) => ws.send(MESSAGE_TYPES.TEMPLATE_MOVE, { id, x, y, x2, y2 }),
      onDelete: (id) => ws.send(MESSAGE_TYPES.TEMPLATE_REMOVE, { id }),
    });
  }

  /** Solicita o estado do quadro colaborativo (desenhos, textos, métricas, turnos). */
  requestBoard(): void {
    ws.send(MESSAGE_TYPES.BOARD_REQUEST, {});
  }

  private applyBoard(b: BoardState): void {
    this.engine.clearStrokes();
    (b?.strokes ?? []).forEach((s) => this.engine.addStroke(s));
    this.engine.clearTexts();
    (b?.texts ?? []).forEach((t) => this.engine.addText(t));
    this.engine.clearTemplates();
    (b?.templates ?? []).forEach((t) => this.engine.addTemplate(t));
    if (b?.turn) {
      turnState.value = {
        order: b.turn.order ?? [],
        active: b.turn.active ?? 0,
        round: b.turn.round ?? 1,
      };
    }
  }

  setColor(c: string): void {
    this.color = c;
  }
  setMetricShape(s: MetricShape): void {
    this.metricShape = s;
  }
  setPersist(b: boolean): void {
    this.persist = Boolean(b);
  }

  selectTool(name: ToolName): void {
    this.active = this.active === name ? null : name;
    const tool = this.active;
    if (!tool || tool === "select") this.engine.setTool(null, null);
    else if (tool === "pen") this.activatePen();
    else if (tool === "text") this.activateText();
    else if (tool === "metric") this.activateMetric();
    this.onToolChange?.(this.active);
  }

  clearDrawings(): void {
    ws.send(MESSAGE_TYPES.DRAW_CLEAR, {});
  }
  clearTemplatesAll(): void {
    ws.send(MESSAGE_TYPES.TEMPLATE_CLEAR, {});
  }

  /** Define a ordem de turnos completa (GM). O servidor reemite TURN_STATE. */
  setTurn(state: { order: { id: string; name: string; initiative: number }[]; active: number; round: number }): void {
    ws.send(MESSAGE_TYPES.TURN_SET, state);
  }

  private uid(): number {
    return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9));
  }
  private clamp(p: Pt): Pt {
    return this.engine.clampPoint ? this.engine.clampPoint(p.x, p.y) : p;
  }
  private metersLabel(px: number): string {
    const g = grid.value;
    if (!g || !g.size_px || !g.meters_per_square) return `${Math.round(px)} px`;
    const pxPerMeter = g.size_px / g.meters_per_square;
    return `${(px / pxPerMeter).toFixed(1)} m`;
  }

  private activatePen(): void {
    let pts: number[] | null = null;
    this.engine.setTool("pen", {
      onDown: (p0) => {
        const p = this.clamp(p0);
        pts = [p.x, p.y];
      },
      onMove: (p0) => {
        if (!pts) return;
        const p = this.clamp(p0);
        const lx = pts[pts.length - 2];
        const ly = pts[pts.length - 1];
        if (Math.hypot(p.x - lx, p.y - ly) > 3) {
          pts.push(p.x, p.y);
          this.engine.showStrokePreview(pts, this.color);
        }
      },
      onUp: () => {
        this.engine.clearMeasure();
        if (pts && pts.length >= 4) {
          const stroke = { id: this.uid(), points: pts, color: this.color, width: 3 };
          this.engine.addStroke(stroke);
          ws.send(MESSAGE_TYPES.DRAW_STROKE, stroke);
        }
        pts = null;
      },
    });
  }

  private activateText(): void {
    this.engine.setTool("text", {
      onDown: (p0) => {
        const p = this.clamp(p0);
        const txt = prompt("Texto no mapa:");
        if (!txt || !txt.trim()) return;
        const t = { id: this.uid(), x: p.x, y: p.y, text: txt.trim(), color: this.color, size: 22 };
        this.engine.addText(t);
        ws.send(MESSAGE_TYPES.TEXT_ADD, t);
      },
    });
  }

  private activateMetric(): void {
    const st: { a: Pt | null; b: Pt | null } = { a: null, b: null };
    const labelFor = (a: Pt, b: Pt) => this.metersLabel(Math.hypot(b.x - a.x, b.y - a.y));
    this.engine.setTool("metric", {
      onDown: (p) => {
        st.a = this.clamp(p);
        st.b = st.a;
      },
      onMove: (p) => {
        if (!st.a) return;
        st.b = this.clamp(p);
        this.engine.showMetricPreview(this.metricShape, st.a, st.b, this.color, labelFor(st.a, st.b));
      },
      onUp: () => {
        this.engine.clearMeasure();
        const { a, b } = st;
        st.a = null;
        if (!a || !b) return;
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        if (r < 6) return;
        if (this.persist) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const t = {
            id: this.uid(),
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
          this.engine.addTemplate(t);
          ws.send(MESSAGE_TYPES.TEMPLATE_ADD, t);
        }
      },
    });
  }
}
