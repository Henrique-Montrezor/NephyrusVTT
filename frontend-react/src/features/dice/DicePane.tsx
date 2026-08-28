import { useState } from "preact/hooks";
import { diceHistory } from "@/state/ui-store";
import { session } from "@/session";

const QUICK = [4, 6, 8, 10, 12, 20, 100];

export function DicePane() {
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [notation, setNotation] = useState("");

  const roll = (sides: number) => session.value?.dice.rollDice(sides, count, mod);
  const rollNotation = (e: Event) => {
    e.preventDefault();
    if (!notation.trim()) return;
    session.value?.dice.rollNotation(notation);
    setNotation("");
  };

  return (
    <section class="tab-pane active">
      <div class="card">
        <div class="dice-quick">
          {QUICK.map((s) => (
            <button key={s} type="button" class={`die-btn${s === 20 ? " die-hero" : ""}`} onClick={() => roll(s)}>
              d{s}
            </button>
          ))}
        </div>
        <div class="dice-params">
          <label class="field">
            <span>Quantidade</span>
            <input type="number" min={1} max={100} step={1} value={count} onInput={(e) => setCount(Number((e.target as HTMLInputElement).value) || 1)} />
          </label>
          <label class="field">
            <span>Modificador</span>
            <input type="number" step={1} value={mod} onInput={(e) => setMod(Number((e.target as HTMLInputElement).value) || 0)} />
          </label>
        </div>
        <form class="dice-form" autocomplete="off" onSubmit={rollNotation}>
          <input type="text" placeholder="Notação (ex.: 2d20+3)" value={notation} onInput={(e) => setNotation((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn-primary">Rolar</button>
        </form>
      </div>
      <div class="card">
        <h2 class="card-title">Histórico</h2>
        <ul class="dice-history">
          {diceHistory.value.map((r) => (
            <li key={r.id}>
              <strong>{r.total}</strong> <span aria-hidden="true">/</span> {r.roller} {r.notation ?? r.dice.map((d) => `d${d.sides}`).join("+")}
              {r.label ? ` (${r.label})` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
