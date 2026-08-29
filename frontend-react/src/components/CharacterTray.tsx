import { useEffect, useState } from "preact/hooks";
import { identity } from "@/state/identity";
import { session } from "@/session";

interface FavoriteAction {
  label: string;
  notation: string;
}

interface CharacterQuickState {
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  resourceLabel: string;
  favorites: FavoriteAction[];
}

const DEFAULT_STATE: CharacterQuickState = {
  hp: 10,
  maxHp: 10,
  resource: 3,
  maxResource: 3,
  resourceLabel: "Recurso",
  favorites: [
    { label: "Teste", notation: "1d20" },
    { label: "Dano", notation: "1d6" },
  ],
};

function storageKey(): string {
  const id = identity.value;
  return `nephyrus:character-tray:${id.campaignId}:${id.userId}`;
}

function readState(): CharacterQuickState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return DEFAULT_STATE;
    const saved = JSON.parse(raw) as Partial<CharacterQuickState>;
    return {
      ...DEFAULT_STATE,
      ...saved,
      favorites: Array.isArray(saved.favorites) ? saved.favorites.slice(0, 3) : DEFAULT_STATE.favorites,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(Math.max(1, max), value));
}

export function CharacterTray() {
  const [state, setState] = useState<CharacterQuickState>(readState);

  useEffect(() => {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  }, [state]);

  const setPool = (field: "hp" | "resource", value: number) => {
    const max = field === "hp" ? state.maxHp : state.maxResource;
    setState({ ...state, [field]: clamp(value, max) });
  };

  return (
    <aside class="character-tray" aria-label="Bandeja rápida do personagem">
      <div class="character-vitals">
        <div class="vital" aria-label={`Pontos de vida ${state.hp} de ${state.maxHp}`}>
          <span>PV</span>
          <button type="button" aria-label="Remover um ponto de vida" onClick={() => setPool("hp", state.hp - 1)}>−</button>
          <strong>{state.hp}<small>/{state.maxHp}</small></strong>
          <button type="button" aria-label="Adicionar um ponto de vida" onClick={() => setPool("hp", state.hp + 1)}>+</button>
        </div>
        <div class="vital" aria-label={`${state.resourceLabel} ${state.resource} de ${state.maxResource}`}>
          <span>{state.resourceLabel}</span>
          <button type="button" aria-label={`Remover um ponto de ${state.resourceLabel}`} onClick={() => setPool("resource", state.resource - 1)}>−</button>
          <strong>{state.resource}<small>/{state.maxResource}</small></strong>
          <button type="button" aria-label={`Adicionar um ponto de ${state.resourceLabel}`} onClick={() => setPool("resource", state.resource + 1)}>+</button>
        </div>
      </div>

      <div class="favorite-actions" aria-label="Ações favoritas">
        {state.favorites.map((favorite, index) => (
          <button key={`${favorite.label}-${index}`} type="button" onClick={() => session.value?.dice.rollNotation(favorite.notation)}>
            <span>{favorite.label}</span>
            <small>{favorite.notation}</small>
          </button>
        ))}
      </div>

      <details class="tray-settings">
        <summary aria-label="Configurar bandeja">Ajustar</summary>
        <div class="tray-settings-panel">
          <label class="field"><span>PV máximo</span><input type="number" min="1" value={state.maxHp} onInput={(event) => {
            const maxHp = Math.max(1, Number((event.target as HTMLInputElement).value) || 1);
            setState({ ...state, maxHp, hp: clamp(state.hp, maxHp) });
          }} /></label>
          <label class="field"><span>Nome do recurso</span><input maxLength={16} value={state.resourceLabel} onInput={(event) => setState({ ...state, resourceLabel: (event.target as HTMLInputElement).value || "Recurso" })} /></label>
          <label class="field"><span>Recurso máximo</span><input type="number" min="1" value={state.maxResource} onInput={(event) => {
            const maxResource = Math.max(1, Number((event.target as HTMLInputElement).value) || 1);
            setState({ ...state, maxResource, resource: clamp(state.resource, maxResource) });
          }} /></label>
          {state.favorites.map((favorite, index) => (
            <div class="favorite-editor" key={index}>
              <input aria-label={`Nome da ação ${index + 1}`} maxLength={18} value={favorite.label} onInput={(event) => {
                const favorites = [...state.favorites];
                favorites[index] = { ...favorite, label: (event.target as HTMLInputElement).value };
                setState({ ...state, favorites });
              }} />
              <input aria-label={`Rolagem da ação ${index + 1}`} maxLength={32} value={favorite.notation} onInput={(event) => {
                const favorites = [...state.favorites];
                favorites[index] = { ...favorite, notation: (event.target as HTMLInputElement).value };
                setState({ ...state, favorites });
              }} />
            </div>
          ))}
        </div>
      </details>
    </aside>
  );
}
