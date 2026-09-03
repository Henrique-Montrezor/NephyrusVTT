import { useEffect, useMemo, useState } from "preact/hooks";
import { FilePdf, GearSix, Plus, UserCircle } from "@phosphor-icons/react";
import { SheetClient, type CharacterSheetOut, type SheetOwnerOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { tokenCatalog } from "@/state/token-catalog-store";
import { openModal } from "@/ui/modal";
import { writeTokenDrag } from "@/features/tokens/token-dnd";
import { sheetCards } from "@/features/tokens/token-flow";
import { SheetWorkspaceModal } from "./SheetWorkspaceModal";

function NewSheetForm({ client, owners, onCreated }: { client: SheetClient; owners: SheetOwnerOut[]; onCreated: (sheet: CharacterSheetOut) => void }) {
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const submit = async (event: Event) => {
    event.preventDefault();
    if (!ownerId || !title.trim()) return;
    setBusy(true);
    try { onCreated(await client.createFromTemplate(ownerId, title.trim())); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível montar a ficha."); }
    finally { setBusy(false); }
  };
  return <form class="sheet-create-form" onSubmit={submit}>
    <p>Cria uma nova ficha usando os campos e o PDF definidos no sistema desta mesa.</p>
    <label class="field"><span>Personagem</span><input autoFocus type="text" placeholder="Nome da ficha" value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} /></label>
    <label class="field"><span>Responsável</span><select value={ownerId} onChange={(event) => setOwnerId((event.target as HTMLSelectElement).value)}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name}</option>)}</select></label>
    <button type="submit" class="btn-primary" disabled={busy || !ownerId || !title.trim()}>{busy ? "Montando…" : "Montar ficha"}</button>
    {status && <p class="sheet-status" role="status">{status}</p>}
  </form>;
}

function ImportSheetForm({ client, owners, onCreated }: { client: SheetClient; owners: SheetOwnerOut[]; onCreated: (sheet: CharacterSheetOut) => void }) {
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const submit = async (event: Event) => {
    event.preventDefault();
    if (!ownerId || !file) return;
    setBusy(true);
    try { onCreated(await client.upload(file, ownerId, file.name.replace(/\.pdf$/i, ""))); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível importar o PDF."); }
    finally { setBusy(false); }
  };
  return <form class="sheet-create-form" onSubmit={submit}>
    <p>Importe uma ficha específica. O arquivo original será preservado.</p>
    <label class="sheet-file"><span>{file?.name ?? "Escolher arquivo PDF"}</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] ?? null)} /></label>
    <label class="field"><span>Responsável</span><select value={ownerId} onChange={(event) => setOwnerId((event.target as HTMLSelectElement).value)}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name}</option>)}</select></label>
    <button type="submit" class="btn-primary" disabled={busy || !ownerId || !file}>{busy ? "Importando…" : "Importar PDF"}</button>
    {status && <p class="sheet-status" role="status">{status}</p>}
  </form>;
}

export function SheetPane() {
  const currentIdentity = identity.value;
  const client = useMemo(() => new SheetClient(currentIdentity), [currentIdentity.accessToken, currentIdentity.campaignId]);
  const [sheets, setSheets] = useState<CharacterSheetOut[]>([]);
  const [owners, setOwners] = useState<SheetOwnerOut[]>([]);
  const [status, setStatus] = useState("Carregando fichas…");
  const cards = sheetCards(sheets, tokenCatalog.value);
  const replace = (next: CharacterSheetOut) => setSheets((current) => current.map((sheet) => sheet.id === next.id ? next : sheet));
  const add = (next: CharacterSheetOut) => setSheets((current) => [next, ...current.filter((sheet) => sheet.id !== next.id)]);

  useEffect(() => {
    void Promise.all([client.list(), currentIdentity.isGm ? client.owners() : Promise.resolve([])])
      .then(([loadedSheets, loadedOwners]) => {
        setSheets(loadedSheets);
        setOwners(loadedOwners);
        setStatus(loadedSheets.length ? "" : currentIdentity.isGm ? "Monte a primeira ficha desta mesa." : "O mestre ainda não atribuiu uma ficha a você.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Não foi possível carregar as fichas."));
  }, [client, currentIdentity.isGm]);

  const openSheet = (sheet: CharacterSheetOut, initialMode: "info" | "editor" = "info") => openModal({ title: sheet.title, variant: "workspace", body: <SheetWorkspaceModal sheet={sheet} client={client} initialMode={initialMode} onChange={replace} /> });
  const openCreate = () => {
    let modal: { close: () => void };
    modal = openModal({ title: "Montar ficha com o modelo da mesa", body: <NewSheetForm client={client} owners={owners} onCreated={(sheet) => { add(sheet); modal.close(); openSheet(sheet); }} /> });
  };
  const openImport = () => {
    let modal: { close: () => void };
    modal = openModal({ title: "Importar ficha em PDF", body: <ImportSheetForm client={client} owners={owners} onCreated={(sheet) => { add(sheet); modal.close(); openSheet(sheet, "editor"); }} /> });
  };

  return <section class="tab-pane sheet-pane active">
    <header class="sheet-collection-header">
      <div><span>Personagens</span><strong>Fichas da campanha</strong><small>{sheets.length} {sheets.length === 1 ? "ficha" : "fichas"}</small></div>
      {currentIdentity.isGm && <div class="sheet-collection-actions"><button type="button" class="btn-primary" onClick={openCreate}><Plus size={17} /> Montar com modelo</button><button type="button" class="btn-ghost" onClick={openImport}><FilePdf size={17} /> Importar PDF</button></div>}
    </header>
    {cards.length ? <div class="sheet-card-grid">{cards.map(({ sheet, token }) => {
      const imageUrl = token?.image_url ?? sheet.token_stages[0]?.image_url ?? "";
      return <article class="sheet-card" key={sheet.id}>
        <button type="button" class="sheet-card-main" draggable={Boolean(token)} onDragStart={(event) => { if (token && event.dataTransfer) writeTokenDrag(event.dataTransfer, { source: "catalog", id: token.id }); }} onClick={() => openSheet(sheet)}>
          <span class="sheet-card-portrait" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}>{!imageUrl && <UserCircle size={34} />}</span>
          <span class="sheet-card-copy"><strong>{sheet.title}</strong><small>{sheet.owner_name}</small><em>{token ? token.scene_name ? `Em ${token.scene_name}` : "Token pronto para arrastar" : "Configure o token"}</em></span>
        </button>
        <div class="sheet-card-foot"><span>{sheet.page_count} pág. · {sheet.fields.length} campos</span>{currentIdentity.isGm && <button type="button" aria-label={`Configurar ${sheet.title}`} title="Configurar campos" onClick={() => openSheet(sheet, "editor")}><GearSix size={17} /></button>}</div>
      </article>;
    })}</div> : <div class="sheet-empty"><UserCircle size={34} /><strong>Nenhuma ficha disponível</strong><p>{status}</p></div>}
    {cards.length > 0 && status && <p class="sheet-status" role="status">{status}</p>}
  </section>;
}
