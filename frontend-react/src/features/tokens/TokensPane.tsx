import { tokenList } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { ICONS } from "@/lib/token-icons";
import { Icon } from "@/ui/Icon";
import { presence } from "@/state/ui-store";

export function TokensPane() {
  const isGm = identity.value.isGm;
  const tokens = isGm ? tokenList.value : tokenList.value.filter((token) => token.ownerId === identity.value.userId);

  return (
    <section class="tab-pane active">
      <div class="card">
        <h2 class="card-title">Tokens na cena</h2>
        <ul class="token-list">
          {tokens.length === 0 ? (
            <li class="token-empty">{isGm ? "Nenhum token na cena." : "Você ainda não possui um token nesta cena."}</li>
          ) : (
            tokens.map((t) => (
              <li key={t.id} class={`token-item${t.isHidden ? " hidden" : ""}`} onClick={() => session.value?.table.centerOnToken(t.id)}>
                <span class="swatch" style={t.imageUrl ? { backgroundImage: `url("${t.imageUrl}")` } : undefined} />
                <div class="meta">
                  <div class="name">{t.name}{t.isHidden ? " (oculto)" : ""}</div>
                  <div class="sub">{isGm ? (t.ownerId ? `dono: ${presence.value.find((member) => member.user_id === t.ownerId)?.display_name ?? t.ownerId}` : "sem dono") : "Seu personagem"}</div>
                </div>
                {isGm && (
                  <select
                    class="token-owner-select"
                    aria-label={`Responsável por ${t.name}`}
                    value={t.ownerId ?? ""}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation();
                      session.value?.table.updateToken(t.id, { owner_id: (event.target as HTMLSelectElement).value || null });
                    }}
                  >
                    <option value="">Mestre</option>
                    {presence.value.filter((member) => !member.is_gm).map((player) => (
                      <option key={player.user_id} value={player.user_id}>{player.display_name}</option>
                    ))}
                  </select>
                )}
                {isGm && (
                  <div class="token-actions">
                    <button
                      class="icon-btn"
                      title={t.isHidden ? "Revelar" : "Esconder"}
                      onClick={(e) => {
                        e.stopPropagation();
                        session.value?.table.toggleTokenVisibility(t.id);
                      }}
                    >
                      <Icon inner={t.isHidden ? ICONS.reveal : ICONS.hide} size={16} />
                    </button>
                    <button
                      class="icon-btn"
                      title="Remover"
                      onClick={(e) => {
                        e.stopPropagation();
                        session.value?.table.removeToken(t.id);
                      }}
                    >
                      <Icon inner={ICONS.remove} size={16} />
                    </button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
      {isGm && <AddTokenCard />}
    </section>
  );
}

import { useState } from "preact/hooks";

function AddTokenCard() {
  const [name, setName] = useState("");
  const [hidden, setHidden] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const players = presence.value.filter((member) => !member.is_gm);

  const add = (e: Event) => {
    e.preventDefault();
    session.value?.table.addToken({ name: name || "Token", is_hidden: hidden, owner_id: ownerId || null });
    setName("");
    setHidden(false);
  };

  return (
    <div class="card">
      <h2 class="card-title">
        <Icon inner={ICONS.plus} />
        Adicionar token
      </h2>
      <form class="add-token" onSubmit={add}>
        <input type="text" placeholder="Nome do token" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <label class="field">
          <span>Controlado por</span>
          <select value={ownerId} onChange={(e) => setOwnerId((e.target as HTMLSelectElement).value)}>
            <option value="">Somente mestre</option>
            {players.map((player) => <option key={player.user_id} value={player.user_id}>{player.display_name}</option>)}
          </select>
        </label>
        <label class="field-inline">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden((e.target as HTMLInputElement).checked)} />
          <span>Iniciar oculto</span>
        </label>
        <button type="submit" class="btn-ghost">Adicionar token vazio</button>
      </form>
    </div>
  );
}
