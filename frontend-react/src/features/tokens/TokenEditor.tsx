import { useEffect, useRef, useState } from "preact/hooks";
import { ImageSquare, LinkSimple, UploadSimple } from "@phosphor-icons/react";
import { AssetClient, SheetClient, type AssetOut, type CharacterSheetOut, type SheetOwnerOut } from "@/net/rest";
import type { TokenCatalogItem } from "@/net/types";
import { identity } from "@/state/identity";
import { session } from "@/session";
import { openModal } from "@/ui/modal";
import { showUiNotice } from "@/state/ui-store";

export function openTokenEditor(token?: TokenCatalogItem): void {
  let close = () => {};
  const modal = openModal({
    title: token ? "Editar token" : "Novo token",
    body: <TokenEditor token={token} onSaved={() => close()} />,
  });
  close = modal.close;
}

function TokenEditor({ token, onSaved }: { token?: TokenCatalogItem; onSaved: () => void }) {
  const [name, setName] = useState(token?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(token?.image_url ?? null);
  const [link, setLink] = useState(token?.sheet_id ? `sheet:${token.sheet_id}` : token?.owner_id ? `owner:${token.owner_id}` : "");
  const [width, setWidth] = useState(token?.width ?? 64);
  const [height, setHeight] = useState(token?.height ?? 64);
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [sheets, setSheets] = useState<CharacterSheetOut[]>([]);
  const [owners, setOwners] = useState<SheetOwnerOut[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = identity.value;

  useEffect(() => {
    const assetsClient = new AssetClient(id);
    const sheetsClient = new SheetClient(id);
    void Promise.all([assetsClient.list("token"), sheetsClient.list(), sheetsClient.owners()])
      .then(([nextAssets, nextSheets, nextOwners]) => {
        setAssets(nextAssets);
        setSheets(nextSheets);
        setOwners(nextOwners.filter((owner) => owner.id !== id.userId));
      })
      .catch((error) => showUiNotice("Não foi possível carregar", String(error)));
  }, []);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await new AssetClient(id).upload("token", file, "Tokens");
      setAssets((current) => [asset, ...current]);
      setImageUrl(asset.url);
    } catch (error) {
      showUiNotice("Imagem não enviada", String(error));
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: Event) => {
    event.preventDefault();
    if (!name.trim()) return showUiNotice("Nome obrigatório", "Dê um nome para identificar o token.");
    if (!imageUrl) return showUiNotice("Escolha uma imagem", "Envie ou selecione uma imagem para o token.");
    const [kind, linkedId] = link.split(":");
    const data = {
      name: name.trim(), image_url: imageUrl, width, height,
      sheet_id: kind === "sheet" ? linkedId : null,
      owner_id: kind === "owner" ? linkedId : null,
    };
    setBusy(true);
    try {
      if (token) await session.value?.table.updateCatalogToken(token.id, data);
      else await session.value?.table.createCatalogToken(data);
      onSaved();
    } catch (error) {
      showUiNotice("Token não salvo", String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="token-editor" onSubmit={save}>
      <div class="token-editor-hero">
        <button type="button" class="token-editor-preview" onClick={() => fileRef.current?.click()} style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}>
          {!imageUrl && <><ImageSquare size={30} /><span>Adicionar imagem</span></>}
        </button>
        <div>
          <strong>Identidade visual</strong>
          <p>PNG, JPG ou WebP. A imagem será recortada apenas na miniatura.</p>
          <button type="button" class="btn-ghost" onClick={() => fileRef.current?.click()}><UploadSimple size={16} /> Enviar imagem</button>
          <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void upload((event.target as HTMLInputElement).files?.[0])} />
        </div>
      </div>
      {assets.length > 0 && <div class="token-image-strip" aria-label="Imagens da campanha">{assets.map((asset) => <button key={asset.id} type="button" class={asset.url === imageUrl ? "selected" : ""} title={asset.original_name} style={{ backgroundImage: `url("${asset.url}")` }} onClick={() => setImageUrl(asset.url)} />)}</div>}
      <label class="field"><span>Nome do token</span><input autoFocus value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="Ex.: Serafina" /></label>
      <label class="field"><span><LinkSimple size={14} /> Vincular a</span><select value={link} onChange={(event) => setLink((event.target as HTMLSelectElement).value)}><option value="">Somente o Mestre</option><optgroup label="Ficha (define o jogador)">{sheets.map((sheet) => <option key={sheet.id} value={`sheet:${sheet.id}`}>{sheet.title} · {sheet.owner_name}</option>)}</optgroup><optgroup label="Jogador sem ficha">{owners.map((owner) => <option key={owner.id} value={`owner:${owner.id}`}>{owner.display_name}</option>)}</optgroup></select></label>
      <div class="token-size-fields"><label class="field"><span>Largura (px)</span><input type="number" min="16" max="4000" value={width} onInput={(event) => setWidth(Number((event.target as HTMLInputElement).value) || 64)} /></label><label class="field"><span>Altura (px)</span><input type="number" min="16" max="4000" value={height} onInput={(event) => setHeight(Number((event.target as HTMLInputElement).value) || 64)} /></label></div>
      <div class="token-editor-actions"><button type="submit" class="btn-primary" disabled={busy}>{busy ? "Salvando…" : token ? "Salvar mudanças" : "Criar token"}</button></div>
    </form>
  );
}
