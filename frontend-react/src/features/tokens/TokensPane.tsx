import { tokenList } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { ICONS } from "@/lib/token-icons";
import { Icon } from "@/ui/Icon";

export function TokensPane() {
  const isGm = identity.value.isGm;
  const tokens = tokenList.value;

  return (
    <section class="tab-pane active">
      <div class="card">
        <h2 class="card-title">Tokens na cena</h2>
        <ul class="token-list">
          {tokens.length === 0 ? (
            <li class="token-empty">Nenhum token na cena.</li>
          ) : (
            tokens.map((t) => (
              <li key={t.id} class={`token-item${t.isHidden ? " hidden" : ""}`} onClick={() => session.value?.table.centerOnToken(t.id)}>
                <span class="swatch" style={t.imageUrl ? { backgroundImage: `url("${t.imageUrl}")` } : undefined} />
                <div class="meta">
                  <div class="name">{t.name}{t.isHidden ? " (oculto)" : ""}</div>
                  <div class="sub">{t.ownerId ? `dono: ${t.ownerId}` : "sem dono"}</div>
                </div>
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

  const add = (e: Event) => {
    e.preventDefault();
    session.value?.table.addToken({ name: name || "Token", is_hidden: hidden });
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
        <label class="field-inline">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden((e.target as HTMLInputElement).checked)} />
          <span>Iniciar oculto</span>
        </label>
        <button type="submit" class="btn-ghost">Adicionar token vazio</button>
      </form>
    </div>
  );
}
