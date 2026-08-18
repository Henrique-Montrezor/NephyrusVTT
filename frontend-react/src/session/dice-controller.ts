/**
 * DiceController — liga a UI de dados e a rede ao motor 3D (DiceEngine).
 * Porta dice_controller.js: envia a intenção de rolar e, ao receber o resultado
 * autoritativo (`dice:result`), dispara a animação 3D e alimenta o histórico.
 */
import { MESSAGE_TYPES } from "@/net/message-types";
import { ws } from "@/net/ws";
import type { DiceEngine } from "@/engine/dice-engine";
import type { Identity } from "@/net/types";
import { diceHistory, pushLog, type DiceResult } from "@/state/ui-store";

interface DiceResultPayload {
  roller?: string;
  notation?: string | null;
  label?: string | null;
  total?: number;
  modifier?: number;
  dice?: { sides: number; value: number }[];
}

let seq = 0;

export class DiceController {
  constructor(
    private readonly engine: DiceEngine,
    private readonly identity: Identity,
  ) {}

  start(): void {
    ws.on(MESSAGE_TYPES.DICE_RESULT, (p) => this.onResult(p));
  }

  rollNotation(notation: string, label?: string | null): void {
    const n = String(notation || "").trim();
    if (!n) return;
    ws.send(MESSAGE_TYPES.DICE_ROLL, { notation: n, label: label || null });
  }

  rollDice(sides: number, count = 1, modifier = 0, label: string | null = null): void {
    ws.send(MESSAGE_TYPES.DICE_ROLL, {
      sides,
      count: Math.max(1, count),
      modifier: modifier | 0,
      label,
    });
  }

  private onResult(payload: DiceResultPayload): void {
    this.engine.roll(payload.dice ?? []);
    const entry: DiceResult = {
      id: `dice-${++seq}`,
      roller: payload.roller ?? this.identity.userId,
      notation: payload.notation ?? null,
      label: payload.label ?? null,
      total: payload.total ?? 0,
      dice: payload.dice ?? [],
      modifier: payload.modifier ?? 0,
      ts: Date.now(),
    };
    diceHistory.value = [entry, ...diceHistory.value].slice(0, 100);
    const detail = entry.label ? `${entry.label}: ` : "";
    pushLog({
      author: entry.roller,
      text: `${detail}rolou ${entry.notation ?? entry.dice.map((d) => `d${d.sides}`).join("+")} = ${entry.total}`,
      kind: "dice",
    });
  }
}
