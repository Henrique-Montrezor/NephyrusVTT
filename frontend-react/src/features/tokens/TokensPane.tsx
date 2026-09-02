import { Crosshair, MapPin, SignOut } from "@phosphor-icons/react";
import { tokenList } from "@/state/game-store";
import { tokenCatalog } from "@/state/token-catalog-store";
import { identity } from "@/state/identity";
import { session } from "@/session";

export function TokensPane() {
  const isGm = identity.value.isGm;
  const current = tokenList.value.filter((token) => isGm || token.ownerId === identity.value.userId);
  const catalog = new Map(tokenCatalog.value.map((token) => [token.id, token]));

  return (
    <section class="tab-pane active scene-token-pane">
      <header class="scene-token-header">
        <div>
          <span>Na cena aberta</span>
          <h2>Tokens no mapa</h2>
        </div>
        <strong>{current.length}</strong>
      </header>

      {current.length ? (
        <div class="scene-token-list">
          {current.map((token) => {
            const details = catalog.get(token.id);
            return (
              <article key={token.id} class="scene-token-row">
                <button
                  type="button"
                  class="scene-token-thumb"
                  style={token.imageUrl ? { backgroundImage: `url("${token.imageUrl}")` } : undefined}
                  onClick={() => session.value?.table.centerOnToken(token.id)}
                  aria-label={`Localizar ${token.name}`}
                >
                  {!token.imageUrl && token.name.slice(0, 2).toUpperCase()}
                  <MapPin size={14} weight="fill" />
                </button>
                <div class="scene-token-meta">
                  <strong>{token.name}</strong>
                  <span>{details?.sheet_title ?? details?.owner_name ?? (isGm ? "Sem ficha vinculada" : "Seu token")}</span>
                </div>
                <button type="button" class="scene-token-action" onClick={() => session.value?.table.centerOnToken(token.id)}>
                  <Crosshair size={17} />
                  <span>Localizar</span>
                </button>
                {isGm && (
                  <button type="button" class="scene-token-action is-danger" onClick={() => session.value?.table.removeToken(token.id)}>
                    <SignOut size={17} />
                    <span>Retirar</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div class="scene-token-empty">
          <MapPin size={28} />
          <strong>Nenhum token nesta cena</strong>
          <p>{isGm ? "Abra a Biblioteca e use “Adicionar à cena” em uma imagem de token." : "Seus tokens vinculados ainda não foram colocados neste mapa."}</p>
        </div>
      )}
    </section>
  );
}
