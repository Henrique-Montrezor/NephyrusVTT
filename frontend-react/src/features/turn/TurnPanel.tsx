import { useState } from "preact/hooks";
import { turnState, openPanel, type TurnCombatant } from "@/state/ui-store";
import { identity } from "@/state/identity";
import { session } from "@/session";

export function TurnPanel() {
  const isGm = identity.value.isGm;
  const state = turnState.value;
  const [name, setName] = useState("");
  const [init, setInit] = useState("");

  const push = (order: TurnCombatant[], active: number, round: number) =>
    session.value?.tools.setTurn({ order, active, round });

  const sorted = (list: TurnCombatant[]) => [...list].sort((a, b) => b.initiative - a.initiative);

  const add = () => {
    if (!name.trim()) return;
    const combatant: TurnCombatant = { id: `c-${Date.now()}`, name: name.trim(), initiative: Number(init) || 0 };
    push(sorted([...state.order, combatant]), state.active, state.round);
    setName("");
    setInit("");
  };

  const next = () => {
    if (state.order.length === 0) return;
    let active = state.active + 1;
    let round = state.round;
    if (active >= state.order.length) {
      active = 0;
      round += 1;
    }
    push(state.order, active, round);
  };
  const prev = () => {
    if (state.order.length === 0) return;
    let active = state.active - 1;
    let round = state.round;
    if (active < 0) {
      active = state.order.length - 1;
      round = Math.max(1, round - 1);
    }
    push(state.order, active, round);
  };
  const clear = () => push([], 0, 1);

  return (
    <div class="turn-panel">
      <div class="turn-head">
        <span class="turn-title">Ordem de Turnos</span>
        <span class="turn-round">Rodada {state.round}</span>
        <button type="button" class="icon-btn" title="Fechar" onClick={() => (openPanel.value = null)}>✕</button>
      </div>
      <ul class="turn-list">
        {state.order.length === 0 ? (
          <li class="turn-empty">Sem combatentes.</li>
        ) : (
          state.order.map((c, i) => (
            <li key={c.id} class={`turn-row${i === state.active ? " active" : ""}`}>
              <span class="turn-name">{c.name}</span>
              <span class="turn-init">{c.initiative}</span>
            </li>
          ))
        )}
      </ul>
      {isGm && (
        <div class="turn-gm">
          <div class="turn-add">
            <input type="text" placeholder="Nome" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <input type="number" placeholder="Init" value={init} onInput={(e) => setInit((e.target as HTMLInputElement).value)} />
            <button type="button" class="btn-ghost btn-mini" onClick={add}>+</button>
          </div>
          <div class="turn-controls">
            <button type="button" class="btn-ghost btn-mini" onClick={prev}>◀</button>
            <button type="button" class="btn-primary btn-mini" onClick={next}>Próximo ▶</button>
            <button type="button" class="btn-ghost btn-mini" onClick={clear}>Limpar</button>
          </div>
        </div>
      )}
    </div>
  );
}
