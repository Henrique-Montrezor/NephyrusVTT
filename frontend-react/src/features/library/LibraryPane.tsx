import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  AssetClient,
  FolderClient,
  type AssetKind,
  type AssetOut,
  type LibraryFolderOut,
} from "@/net/rest";
import { identity } from "@/state/identity";
import { presence } from "@/state/ui-store";
import { ws } from "@/net/ws";
import { MESSAGE_TYPES } from "@/net/message-types";
import { session } from "@/session";
import { Icon } from "@/ui/Icon";
import { ICONS } from "@/lib/token-icons";
import { libraryPlacement } from "@/features/tokens/token-flow";

type SortMode = "name" | "recent";
type Editing = { type: "asset" | "folder"; id: number; value: string } | null;

const ACCEPTED_FILES = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.mp3,.ogg,.wav,.m4a,.txt,.md,.rtf,.doc,.docx,.odt,.csv";

function fileKind(file: File, folder: string): AssetKind {
  const root = folder.split("/")[0].toLocaleLowerCase("pt-BR");
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return root === "tokens" ? "token" : "map";
  return "doc";
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function kindLabel(kind: AssetKind): string {
  return { map: "Mapa", token: "Token", pdf: "PDF", audio: "Áudio", doc: "Documento" }[kind];
}

function iconForAsset(kind: AssetKind): string {
  if (kind === "map") return ICONS.image;
  return ICONS[kind];
}

export function LibraryPane() {
  const assetClient = useMemo(() => new AssetClient(identity.value), []);
  const folderClient = useMemo(() => new FolderClient(identity.value), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [folders, setFolders] = useState<LibraryFolderOut[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shareAsset, setShareAsset] = useState<number | null>(null);
  const [shareTargets, setShareTargets] = useState<Record<number, string>>({});

  const refresh = async () => {
    setError(null);
    try {
      const [nextAssets, nextFolders] = await Promise.all([assetClient.list(), folderClient.list()]);
      setAssets(nextAssets);
      setFolders(nextFolders);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const players = presence.value.filter((member) => !member.is_gm);
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const currentFolders = folders
    .filter((folder) => folder.parent === currentPath)
    .filter((folder) => !normalizedQuery || folder.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const currentAssets = assets
    .filter((asset) => asset.folder === currentPath)
    .filter((asset) => !normalizedQuery || asset.original_name.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    .sort((a, b) => sort === "name"
      ? a.original_name.localeCompare(b.original_name, "pt-BR")
      : Date.parse(b.created_at) - Date.parse(a.created_at));
  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  const uploadFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let uploaded = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadStatus(`Enviando ${index + 1} de ${files.length}`);
        await assetClient.upload(fileKind(file, currentPath), file, currentPath);
        uploaded += 1;
      }
      setNotice(`${uploaded} ${uploaded === 1 ? "arquivo enviado" : "arquivos enviados"}.`);
      await refresh();
    } catch (err) {
      setError(`${(err as Error).message}. ${uploaded} de ${files.length} enviados.`);
      await refresh();
    } finally {
      setBusy(false);
      setUploadStatus("");
      setDragActive(false);
    }
  };

  const createFolder = async (event: Event) => {
    event.preventDefault();
    if (!newFolderName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await folderClient.create(newFolderName, currentPath);
      setNewFolderName("");
      setCreatingFolder(false);
      setNotice("Pasta criada.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (event: Event) => {
    event.preventDefault();
    if (!editing?.value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.type === "folder") {
        const folder = folders.find((item) => item.id === editing.id);
        if (!folder) return;
        const updated = await folderClient.update(editing.id, { name: editing.value });
        if (currentPath === folder.path || currentPath.startsWith(`${folder.path}/`)) {
          setCurrentPath(updated.path + currentPath.slice(folder.path.length));
        }
      } else {
        await assetClient.update(editing.id, { original_name: editing.value });
      }
      setEditing(null);
      setNotice("Nome atualizado.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (folder: LibraryFolderOut) => {
    if (confirmDelete !== `folder-${folder.id}`) {
      setConfirmDelete(`folder-${folder.id}`);
      return;
    }
    try {
      await folderClient.remove(folder.id);
      setConfirmDelete(null);
      setNotice("Pasta excluída.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeAsset = async (asset: AssetOut) => {
    if (confirmDelete !== `asset-${asset.id}`) {
      setConfirmDelete(`asset-${asset.id}`);
      return;
    }
    try {
      await assetClient.remove(asset.id);
      setConfirmDelete(null);
      setNotice("Arquivo excluído.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const useAsset = async (asset: AssetOut) => {
    const placement = libraryPlacement(asset.kind);
    if (placement === "map") {
      session.value?.table.setSceneBackground(asset.url);
      setNotice("Mapa aplicado à cena atual.");
    } else if (placement === "token") {
      setBusy(true);
      try {
        const token = await session.value?.table.createCatalogToken({
          name: asset.original_name.replace(/\.[^.]+$/, ""),
          image_url: asset.url,
          width: 64,
          height: 64,
        });
        if (token) session.value?.table.placeToken(token.id, 160, 160);
        setNotice("Token adicionado à cena atual.");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Não foi possível adicionar o token.");
      } finally {
        setBusy(false);
      }
    }
  };

  const share = (asset: AssetOut) => {
    const target = shareTargets[asset.id] ?? "*";
    ws.send(MESSAGE_TYPES.LIBRARY_SHARE, {
      to: target,
      item: {
        id: String(asset.id),
        kind: asset.kind,
        name: asset.original_name,
        url: asset.url,
      },
    });
    const player = players.find((member) => member.user_id === target);
    setNotice(target === "*" ? "Arquivo compartilhado com todos." : `Arquivo enviado para ${player?.display_name ?? "o jogador"}.`);
    setShareAsset(null);
  };

  const openParent = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const renderRename = () => (
    <form class="library-inline-form" onSubmit={saveRename}>
      <input
        class="input"
        value={editing?.value ?? ""}
        maxLength={120}
        aria-label="Novo nome"
        autofocus
        onInput={(event) => setEditing(editing ? { ...editing, value: (event.target as HTMLInputElement).value } : null)}
      />
      <button type="submit" class="btn-primary btn-mini" disabled={busy}>Salvar</button>
      <button type="button" class="btn-ghost btn-mini" onClick={() => setEditing(null)}>Cancelar</button>
    </form>
  );

  return (
    <section class="tab-pane active library-pane">
      <div
        class={`library-explorer${dragActive ? " is-dragging" : ""}`}
        onDragEnter={(event) => {
          if (event.dataTransfer?.types.includes("Files")) setDragActive(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer?.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void uploadFiles(Array.from(event.dataTransfer?.files ?? []));
        }}
      >
        <header class="library-header">
          <div>
            <h2>Arquivos da campanha</h2>
            <p>Organize e compartilhe o material da mesa.</p>
          </div>
          <div class="library-header-actions">
            <button type="button" class="btn-ghost" onClick={() => setCreatingFolder(true)}>
              <Icon inner={ICONS.folder} size={17} />
              Nova pasta
            </button>
            <button type="button" class="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Icon inner={ICONS.plus} size={17} />
              {uploadStatus || "Enviar"}
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept={ACCEPTED_FILES}
              onChange={(event) => {
                const input = event.target as HTMLInputElement;
                void uploadFiles(Array.from(input.files ?? []));
                input.value = "";
              }}
            />
          </div>
        </header>

        {(error || notice) && (
          <div class={error ? "error-banner library-feedback" : "library-feedback is-success"} role="status">
            {error ?? notice}
            <button type="button" aria-label="Fechar aviso" onClick={() => { setError(null); setNotice(null); }}>Fechar</button>
          </div>
        )}

        <div class="library-toolbar">
          <button type="button" class="library-up" onClick={openParent} disabled={!currentPath} aria-label="Voltar uma pasta" title="Voltar uma pasta">
            <Icon inner={ICONS.back} size={17} />
          </button>
          <nav class="library-breadcrumbs" aria-label="Caminho da pasta">
            <button type="button" class={!currentPath ? "current" : ""} onClick={() => setCurrentPath("")}>Raiz</button>
            {breadcrumbs.map((part, index) => {
              const path = breadcrumbs.slice(0, index + 1).join("/");
              const current = index === breadcrumbs.length - 1;
              return (
                <span key={path}>
                  <span aria-hidden="true">/</span>
                  <button type="button" class={current ? "current" : ""} onClick={() => setCurrentPath(path)}>{part}</button>
                </span>
              );
            })}
          </nav>
          <label class="library-search">
            <span class="sr-only">Buscar nesta pasta</span>
            <input class="input" type="search" value={query} placeholder="Buscar nesta pasta" onInput={(event) => setQuery((event.target as HTMLInputElement).value)} />
          </label>
          <select class="select library-sort" value={sort} aria-label="Ordenar arquivos" onChange={(event) => setSort((event.target as HTMLSelectElement).value as SortMode)}>
            <option value="name">Nome</option>
            <option value="recent">Recentes</option>
          </select>
        </div>

        {creatingFolder && (
          <form class="library-create-folder" onSubmit={createFolder}>
            <Icon inner={ICONS.folder} size={19} />
            <input class="input" value={newFolderName} maxLength={80} placeholder="Nome da pasta" aria-label="Nome da pasta" autofocus onInput={(event) => setNewFolderName((event.target as HTMLInputElement).value)} />
            <button type="submit" class="btn-primary btn-mini" disabled={busy || !newFolderName.trim()}>Criar</button>
            <button type="button" class="btn-ghost btn-mini" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancelar</button>
          </form>
        )}

        <div class="library-layout">
          <aside class="library-tree" aria-label="Pastas da campanha">
            <button type="button" class={!currentPath ? "active" : ""} onClick={() => setCurrentPath("")}>
              <Icon inner={ICONS.folder} size={17} />
              <span>Raiz</span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                class={currentPath === folder.path ? "active" : ""}
                style={{ paddingLeft: `${12 + folder.path.split("/").length * 12}px` }}
                onClick={() => setCurrentPath(folder.path)}
                title={folder.path}
              >
                <Icon inner={ICONS.folder} size={16} />
                <span>{folder.name}</span>
              </button>
            ))}
          </aside>

          <main class="library-content">
            <div class="library-list-head" aria-hidden="true">
              <span>Nome</span>
              <span>Tipo</span>
              <span>Tamanho</span>
              <span>Ações</span>
            </div>

            <div class="library-list">
              {currentFolders.map((folder) => {
                const deleting = confirmDelete === `folder-${folder.id}`;
                return (
                  <div key={`folder-${folder.id}`} class="library-row is-folder">
                    <button type="button" class="library-row-main" onClick={() => setCurrentPath(folder.path)} title={`Abrir ${folder.name}`}>
                      <span class="library-file-icon"><Icon inner={ICONS.folder} size={20} /></span>
                      <span class="library-file-name">{folder.name}</span>
                    </button>
                    <span class="library-file-type">Pasta</span>
                    <span class="library-file-size">{folders.filter((item) => item.parent === folder.path).length + assets.filter((item) => item.folder === folder.path).length} itens</span>
                    <div class="library-row-actions">
                      {deleting ? (
                        <>
                          <button type="button" class="library-action is-danger" onClick={() => void removeFolder(folder)}>Confirmar</button>
                          <button type="button" class="library-action" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" class="library-icon-action" aria-label={`Renomear ${folder.name}`} title="Renomear" onClick={() => setEditing({ type: "folder", id: folder.id, value: folder.name })}><Icon inner={ICONS.rename} size={16} /></button>
                          <button type="button" class="library-icon-action is-danger" aria-label={`Excluir ${folder.name}`} title="Excluir pasta vazia" onClick={() => void removeFolder(folder)}><Icon inner={ICONS.remove} size={16} /></button>
                        </>
                      )}
                    </div>
                    {editing?.type === "folder" && editing.id === folder.id && <div class="library-row-expansion">{renderRename()}</div>}
                  </div>
                );
              })}

              {currentAssets.map((asset) => {
                const deleting = confirmDelete === `asset-${asset.id}`;
                return (
                  <div key={`asset-${asset.id}`} class="library-row">
                    <a class="library-row-main" href={asset.url} target="_blank" rel="noopener noreferrer" title={`Abrir ${asset.original_name}`}>
                      {asset.kind === "map" || asset.kind === "token" ? (
                        <span class="library-file-icon is-thumb" style={{ backgroundImage: `url("${asset.url}")` }} />
                      ) : (
                        <span class="library-file-icon"><Icon inner={iconForAsset(asset.kind)} size={20} /></span>
                      )}
                      <span class="library-file-name">{asset.original_name}</span>
                    </a>
                    <span class="library-file-type">{kindLabel(asset.kind)}</span>
                    <span class="library-file-size">{formatBytes(asset.size)}</span>
                    <div class="library-row-actions">
                      {deleting ? (
                        <>
                          <button type="button" class="library-action is-danger" onClick={() => void removeAsset(asset)}>Confirmar</button>
                          <button type="button" class="library-action" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          {(asset.kind === "map" || asset.kind === "token") && (
                            <button
                              type="button"
                              class="library-use-action"
                              aria-label={asset.kind === "map" ? `Usar ${asset.original_name} como mapa` : `Adicionar ${asset.original_name} à cena`}
                              onClick={() => void useAsset(asset)}
                            >
                              <Icon inner={asset.kind === "map" ? ICONS.map : ICONS.token} size={16} />
                              {asset.kind === "map" ? "Usar como mapa" : "Adicionar à cena"}
                            </button>
                          )}
                          <button type="button" class="library-icon-action" aria-label={`Compartilhar ${asset.original_name}`} title="Compartilhar" onClick={() => setShareAsset(shareAsset === asset.id ? null : asset.id)}><Icon inner={ICONS.share} size={16} /></button>
                          <button type="button" class="library-icon-action" aria-label={`Renomear ${asset.original_name}`} title="Renomear" onClick={() => setEditing({ type: "asset", id: asset.id, value: asset.original_name })}><Icon inner={ICONS.rename} size={16} /></button>
                          <button type="button" class="library-icon-action is-danger" aria-label={`Excluir ${asset.original_name}`} title="Excluir" onClick={() => void removeAsset(asset)}><Icon inner={ICONS.remove} size={16} /></button>
                        </>
                      )}
                    </div>
                    {editing?.type === "asset" && editing.id === asset.id && <div class="library-row-expansion">{renderRename()}</div>}
                    {shareAsset === asset.id && (
                      <div class="library-row-expansion library-share-form">
                        <label>
                          <span>Compartilhar com</span>
                          <select class="select" value={shareTargets[asset.id] ?? "*"} onChange={(event) => setShareTargets({ ...shareTargets, [asset.id]: (event.target as HTMLSelectElement).value })}>
                            <option value="*">Todos os jogadores online</option>
                            {players.map((player) => <option key={player.user_id} value={player.user_id}>{player.display_name}</option>)}
                          </select>
                        </label>
                        <button type="button" class="btn-primary btn-mini" onClick={() => share(asset)}>Compartilhar</button>
                        <button type="button" class="btn-ghost btn-mini" onClick={() => setShareAsset(null)}>Cancelar</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {!currentFolders.length && !currentAssets.length && (
                <div class="library-empty">
                  <Icon inner={normalizedQuery ? ICONS.doc : ICONS.folder} size={28} />
                  <strong>{normalizedQuery ? "Nenhum resultado" : "Esta pasta está vazia"}</strong>
                  <span>{normalizedQuery ? "Tente outro termo de busca." : "Arraste arquivos para cá ou use o botão Enviar."}</span>
                </div>
              )}
            </div>
          </main>
        </div>

        {dragActive && (
          <div class="library-drop-overlay" aria-hidden="true">
            <Icon inner={ICONS.plus} size={28} />
            <strong>Solte para enviar</strong>
            <span>Destino: {currentPath || "Raiz"}</span>
          </div>
        )}
      </div>
    </section>
  );
}
