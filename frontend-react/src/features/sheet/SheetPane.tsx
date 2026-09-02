import { useEffect, useMemo, useState } from "preact/hooks";
import { SheetClient, type CharacterSheetOut, type SheetFieldOut, type SheetOwnerOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { publicSheetUpdates } from "@/state/ui-store";
import { SheetEditor } from "./SheetEditor";
import { SheetTokenPanel } from "./SheetTokenPanel";

type ViewMode = "info" | "sheet" | "token" | "editor";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FieldControl({ field, value, onChange }: {
  field: SheetFieldOut;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.field_type === "image") {
    const imageValue = typeof value === "string" ? value : "";
    return (
      <div class="sheet-image-control">
        {imageValue && <img src={imageValue} alt={`Imagem de ${field.label}`} />}
        <label class="sheet-image-pick">
          <span>{imageValue ? "Trocar imagem" : "Escolher imagem"}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.addEventListener("load", () => onChange(String(reader.result ?? "")), { once: true });
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {imageValue && <button type="button" class="btn-ghost" onClick={() => onChange("")}>Remover</button>}
      </div>
    );
  }
  if (field.field_type === "checkbox") {
    return (
      <label class="sheet-check">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange((event.target as HTMLInputElement).checked)} />
        <span>{Boolean(value) ? "Marcado" : "Desmarcado"}</span>
      </label>
    );
  }
  if (field.field_type === "textarea") {
    return <textarea rows={4} value={String(value ?? "")} onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)} />;
  }
  return (
    <input
      type={field.field_type === "number" ? "number" : "text"}
      inputMode={field.field_type === "number" ? "decimal" : "text"}
      value={String(value ?? "")}
      onInput={(event) => onChange((event.target as HTMLInputElement).value)}
    />
  );
}

export function SheetPane() {
  const session = identity.value;
  const client = useMemo(() => new SheetClient(session), [session.accessToken, session.campaignId]);
  const [sheets, setSheets] = useState<CharacterSheetOut[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [pdfUrl, setPdfUrl] = useState("");
  const [mode, setMode] = useState<ViewMode>("info");
  const [status, setStatus] = useState("Carregando fichas…");
  const [busy, setBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<SheetOwnerOut[]>([]);
  const selected = sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0] ?? null;
  const liveUpdate = selected ? publicSheetUpdates.value.get(selected.id) : undefined;

  const replaceSheet = (next: CharacterSheetOut) => {
    setSheets((current) => current.map((sheet) => sheet.id === next.id ? next : sheet));
    setDraft(next.values);
  };

  const refresh = async () => {
    try {
      const loaded = await client.list();
      if (session.isGm) setOwners(await client.owners());
      setSheets(loaded);
      setSelectedId((current) => loaded.some((sheet) => sheet.id === current) ? current : loaded[0]?.id ?? "");
      setStatus(loaded.length ? "" : session.isGm ? "Importe uma ficha e atribua a um jogador." : "O mestre ainda não atribuiu uma ficha a você.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar as fichas.");
    }
  };

  useEffect(() => { void refresh(); }, [client]);
  useEffect(() => { setDraft(selected?.values ?? {}); }, [selected?.id, selected?.updated_at]);
  useEffect(() => {
    if (liveUpdate) setDraft((current) => ({ ...current, ...liveUpdate.values }));
  }, [liveUpdate?.received_at]);
  useEffect(() => {
    let alive = true;
    let nextUrl = "";
    if (!selected || mode !== "sheet") {
      setPdfUrl("");
      return;
    }
    void client.pdfBlob(selected.id).then((blob) => {
      if (!alive) return;
      nextUrl = URL.createObjectURL(blob);
      setPdfUrl(nextUrl);
    }).catch((error) => setStatus(error instanceof Error ? error.message : "Falha ao abrir PDF."));
    return () => {
      alive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [client, selected?.id, mode]);

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      replaceSheet(await client.saveValues(selected.id, draft));
      setStatus("Ficha salva.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar ficha.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event: Event) => {
    event.preventDefault();
    if (!uploadFile || !ownerId) return;
    setBusy(true);
    try {
      const created = await client.upload(uploadFile, ownerId, uploadFile.name.replace(/\.pdf$/i, ""));
      setSheets((current) => [created, ...current]);
      setSelectedId(created.id);
      setUploadFile(null);
      setStatus(created.fields.length ? `${created.fields.length} campos detectados.` : "PDF importado sem campos. Abra o Editor para posicioná-los.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao importar ficha.");
    } finally {
      setBusy(false);
    }
  };

  const togglePublic = async (field: SheetFieldOut) => {
    if (!selected) return;
    try {
      replaceSheet(await client.setPublic(selected.id, field.key, !field.public));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao alterar visibilidade.");
    }
  };

  const exportSheet = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      triggerDownload(await client.pdfBlob(selected.id, true), `${selected.title}-preenchida.pdf`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao exportar ficha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="tab-pane sheet-pane active">
      {session.isGm && (
        <form class="sheet-import" onSubmit={upload}>
          <div><strong>Entregar nova ficha</strong><small>PDF original preservado</small></div>
          <label class="sheet-file">
            <span>{uploadFile?.name ?? "Escolher PDF"}</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile((event.target as HTMLInputElement).files?.[0] ?? null)} />
          </label>
          <select aria-label="Jogador da ficha" value={ownerId} onChange={(event) => setOwnerId((event.target as HTMLSelectElement).value)}>
            <option value="">Atribuir a…</option>
            {owners.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}
          </select>
          <button class="btn-primary" type="submit" disabled={busy || !uploadFile || !ownerId}>Importar</button>
        </form>
      )}

      {selected && (
        <>
          <div class="sheet-toolbar">
            <label class="field sheet-select">
              <span>Ficha de personagem</span>
              <select value={selected.id} onChange={(event) => setSelectedId((event.target as HTMLSelectElement).value)}>
                {sheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.title} · {sheet.owner_name}</option>)}
              </select>
            </label>
            <button type="button" class="btn-ghost sheet-export" disabled={busy} onClick={exportSheet}>Exportar</button>
            {session.isGm && (
              <button type="button" class="btn-ghost sheet-export" onClick={() => setMode(mode === "editor" ? "sheet" : "editor")}>
                {mode === "editor" ? "Voltar à ficha" : "Configurar campos"}
              </button>
            )}
          </div>
          <div class="sheet-mode gm" role="tablist" aria-label="Seções da ficha">
            <button type="button" class={mode === "info" ? "active" : ""} aria-selected={mode === "info"} onClick={() => setMode("info")}>Info</button>
            <button type="button" class={mode === "sheet" || mode === "editor" ? "active" : ""} aria-selected={mode === "sheet" || mode === "editor"} onClick={() => setMode("sheet")}>Ficha · {selected.page_count} pág.</button>
            <button type="button" class={mode === "token" ? "active" : ""} aria-selected={mode === "token"} onClick={() => setMode("token")}>Token do personagem</button>
          </div>
          {mode === "info" ? (
            <div class="sheet-fields">
              {selected.fields.length ? selected.fields.map((field) => (
                <div class="sheet-field" key={field.key}>
                  <label>
                    <span>{field.label}<small>Página {field.page}</small></span>
                    <FieldControl field={field} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />
                  </label>
                  {session.isGm && (
                    <button type="button" class={`sheet-public${field.public ? " active" : ""}`} aria-pressed={field.public} onClick={() => void togglePublic(field)}>{field.public ? "Público" : "Privado"}</button>
                  )}
                </div>
              )) : <div class="sheet-fields-empty">Este PDF ainda não possui campos. O mestre pode criá-los no Editor.</div>}
              {!!selected.fields.length && <button type="button" class="btn-primary sheet-save" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar alterações"}</button>}
            </div>
          ) : mode === "token" ? (
            <SheetTokenPanel sheet={selected} />
          ) : mode === "editor" && session.isGm ? (
            <SheetEditor client={client} sheet={selected} onChange={replaceSheet} onStatus={setStatus} />
          ) : pdfUrl ? (
            <object class="sheet-frame" data={pdfUrl} type="application/pdf" aria-label={`PDF ${selected.title}`}>
              <button type="button" class="btn-primary" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}>Abrir PDF</button>
            </object>
          ) : <div class="sheet-loading">Preparando visualização…</div>}
        </>
      )}
      {!selected && <div class="sheet-empty"><strong>Nenhuma ficha disponível</strong><p>{status}</p></div>}
      {selected && status && <p class="sheet-status" role="status">{status}</p>}
    </section>
  );
}
