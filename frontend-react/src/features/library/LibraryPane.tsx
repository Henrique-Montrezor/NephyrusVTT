import { useEffect, useMemo, useState } from "preact/hooks";
import { AssetClient, type AssetKind, type AssetOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { ws } from "@/net/ws";
import { MESSAGE_TYPES } from "@/net/message-types";
import { session } from "@/session";

const KINDS: { value: AssetKind; label: string }[] = [
  { value: "map", label: "Mapa" },
  { value: "token", label: "Token" },
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "Documento" },
  { value: "audio", label: "Áudio" },
];

export function LibraryPane() {
  const client = useMemo(() => new AssetClient(identity.value), []);
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [kind, setKind] = useState<AssetKind>("map");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setAssets(await client.list());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const upload = async (e: Event) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await client.upload(kind, file);
      setFile(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useAsset = (a: AssetOut) => {
    if (a.kind === "map") {
      // Aplica como fundo da cena atual via redimensionamento/atualização de cena.
      ws.send(MESSAGE_TYPES.SCENE_BACKGROUND, { background_url: a.url });
    } else if (a.kind === "token") {
      session.value?.table.addToken({ name: a.original_name, image_url: a.url });
    }
  };

  const share = (a: AssetOut) => {
    ws.send(MESSAGE_TYPES.LIBRARY_SHARE, { url: a.url, name: a.original_name, kind: a.kind });
  };

  return (
    <section class="tab-pane active">
      <div class="card">
        <h2 class="card-title">Biblioteca de Assets</h2>
        {error && <div class="error-banner">{error}</div>}
        <form class="upload-form" onSubmit={upload}>
          <label class="dropzone">
            <input
              type="file"
              hidden
              onChange={(e) => setFile((e.target as HTMLInputElement).files?.[0] ?? null)}
            />
            <span class="dz-text">Clique para escolher um arquivo</span>
            <span class="dz-hint">{file ? file.name : "Imagens, PDF ou áudio"}</span>
          </label>
          <div class="upload-row">
            <select class="select" value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as AssetKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <button type="submit" class="btn-primary" disabled={busy || !file}>
              {busy ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>

        <div class="asset-grid">
          {assets.length === 0 ? (
            <div class="asset-empty">Nenhum arquivo enviado.</div>
          ) : (
            assets.map((a) => (
              <div key={a.id} class="asset-card">
                {a.kind === "map" || a.kind === "token" ? (
                  <span class="asset-thumb" style={{ backgroundImage: `url("${a.url}")` }} />
                ) : (
                  <span class="asset-thumb asset-file">{a.kind}</span>
                )}
                <span class="asset-name" title={a.original_name}>{a.original_name}</span>
                <div class="asset-actions">
                  {(a.kind === "map" || a.kind === "token") && (
                    <button type="button" class="btn-ghost btn-mini" onClick={() => useAsset(a)}>Usar</button>
                  )}
                  <button type="button" class="btn-ghost btn-mini" onClick={() => share(a)}>Compartilhar</button>
                  <button
                    type="button"
                    class="btn-ghost btn-mini"
                    onClick={async () => {
                      await client.remove(a.id);
                      await refresh();
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
