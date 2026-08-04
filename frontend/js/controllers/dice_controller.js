/**
 * DiceController — liga a UI de dados e a rede à DiceView.
 *
 * Envia a intenção de rolar ao Host e, ao receber o resultado autoritativo
 * (`dice:result`), dispara a animação 3D e notifica a UI (log/toast).
 */
import { MESSAGE_TYPES } from "../network/message_types.js";

export class DiceController {
  /**
   * @param {object} deps
   * @param {import("./websocket_controller.js").WebSocketController} deps.ws
   * @param {import("../views/dice_view.js").DiceView} deps.view
   * @param {object} deps.identity  { userId, isGm }
   */
  constructor({ ws, view, identity }) {
    this.ws = ws;
    this.view = view;
    this.identity = identity;
    /** Callback opcional chamado com o resultado (para log/toast na UI). */
    this.onResult = null;
  }

  start() {
    this.ws.on(MESSAGE_TYPES.DICE_RESULT, (p) => this._onResult(p));
  }

  /** Rola por notação livre (ex.: "2d20+3"). */
  rollNotation(notation, label) {
    const n = String(notation || "").trim();
    if (!n) return;
    this.ws.send(MESSAGE_TYPES.DICE_ROLL, { notation: n, label: label || null });
  }

  /** Rola de forma estruturada (quantidade/faces/modificador). */
  rollDice(sides, count = 1, modifier = 0, label = null) {
    this.ws.send(MESSAGE_TYPES.DICE_ROLL, {
      sides,
      count: Math.max(1, count),
      modifier: modifier | 0,
      label,
    });
  }

  _onResult(payload) {
    this.view.roll(payload.dice || []);
    if (typeof this.onResult === "function") this.onResult(payload);
  }
}
