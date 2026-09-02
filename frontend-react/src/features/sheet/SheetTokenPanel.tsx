import { useEffect, useState } from "preact/hooks";
import { Crosshair, ImageSquare, MapPin, SignOut } from "@phosphor-icons/react";
import { AssetClient, type AssetOut, type CharacterSheetOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { sceneMeta } from "@/state/game-store";
import { tokenCatalog } from "@/state/token-catalog-store";
import { session } from "@/session";
import { findSheetToken } from "@/features/tokens/token-flow";

export function SheetTokenPanel({ sheet }: { sheet: CharacterSheetOut }) {
  const isGm = identity.value.isGm;
  const token = findSheetToken(tokenCatalog.value, sheet.id);
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [imageUrl, setImageUrl] = useState(token?.image_url ?? "");
  const [name, setName] = useState(token?.name ?? sheet.title);
  const [size, setSize] = useState(token?.width ?? 64);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const inCurrentScene = token?.scene_id === sceneMeta.value.sceneId;

  useEffect(() => {
    setImageUrl(token?.image_url ?? "");
    setName(token?.name ?? sheet.title);
    setSize(token?.width ?? 64);
  }, [token?.id, token?.image_url, token?.width, sheet.id]);

  useEffect(() => {
    if (!isGm) return;
    void new AssetClient(identity.value).list("token")
      .then(setAssets)
      .catch(() => setStatus("Não foi possível carregar as imagens da Biblioteca."));
  }, [isGm, sheet.id]);

  const save = async () => {
    if (!imageUrl || !name.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const data = {
        name: name.trim(),
        image_url: imageUrl,
        sheet_id: sheet.id,
        width: size,
        height: size,
      };
      if (token) await session.value?.table.updateCatalogToken(token.id, data);
      else await session.value?.table.createCatalogToken(data);
      setStatus("Token do personagem salvo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar o token.");
    } finally {
      setBusy(false);
    }
  };

  const place = () => {
    if (!token || sceneMeta.value.sceneId == null) return;
    session.value?.table.placeToken(
      token.id,
      Math.max(0, sceneMeta.value.width / 2 - size / 2),
      Math.max(0, sceneMeta.value.height / 2 - size / 2),
    );
  };

  if (!isGm && !token) {
    return <div class="sheet-token-empty"><ImageSquare size={30} /><strong>Token ainda não definido</strong><p>O Mestre pode vincular uma imagem a esta ficha.</p></div>;
  }

  return (
    <div class="sheet-token-panel">
      <div class="sheet-token-identity">
        <div class="sheet-token-portrait" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}>
          {!imageUrl && <ImageSquare size={32} />}
        </div>
        <div>
          <span>Token de {sheet.owner_name}</span>
          <h3>{token?.name ?? sheet.title}</h3>
          <p>{inCurrentScene ? "Presente na cena aberta" : token?.scene_name ? `Está em ${token.scene_name}` : "Fora do mapa"}</p>
        </div>
      </div>

      {isGm && (
        <div class="sheet-token-config">
          <label class="field">
            <span>Nome no mapa</span>
            <input type="text" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field sheet-token-size">
            <span>Tamanho</span>
            <select class="select" value={size} onChange={(event) => setSize(Number((event.target as HTMLSelectElement).value))}>
              <option value={48}>Pequeno</option>
              <option value={64}>Médio</option>
              <option value={96}>Grande</option>
              <option value={128}>Enorme</option>
            </select>
          </label>
          <div class="sheet-token-library">
            <span>Imagem da Biblioteca</span>
            {assets.length ? (
              <div>{assets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  class={asset.url === imageUrl ? "selected" : ""}
                  style={{ backgroundImage: `url("${asset.url}")` }}
                  title={asset.original_name}
                  aria-label={`Usar ${asset.original_name}`}
                  onClick={() => setImageUrl(asset.url)}
                />
              ))}</div>
            ) : <p>Envie uma imagem para a pasta Tokens na Biblioteca.</p>}
          </div>
          <button type="button" class="btn-primary sheet-token-save" disabled={busy || !imageUrl || !name.trim()} onClick={() => void save()}>
            {busy ? "Salvando…" : token ? "Salvar token" : "Vincular token à ficha"}
          </button>
        </div>
      )}

      {token && (
        <div class="sheet-token-map-actions">
          {inCurrentScene ? (
            <>
              <button type="button" class="btn-primary" onClick={() => session.value?.table.centerOnToken(token.id)}><Crosshair size={17} /> Localizar no mapa</button>
              {isGm && <button type="button" class="btn-ghost" onClick={() => session.value?.table.removeToken(token.id)}><SignOut size={17} /> Retirar da cena</button>}
            </>
          ) : (
            <button type="button" class="btn-primary" onClick={place}><MapPin size={17} /> Colocar na cena aberta</button>
          )}
        </div>
      )}
      {status && <p class="sheet-token-status" role="status">{status}</p>}
    </div>
  );
}
