import { useEffect, useMemo, useState } from "preact/hooks";
import { SheetClient, type CharacterSheetOut, type SheetFieldOut, type SheetOwnerOut } from "@/net/rest";
import { identity } from "@/state/identity";

type ViewMode = "fields" | "pdf";

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
  const [mode, setMode] = useState<ViewMode>("fields");
  const [status, setStatus] = useState("Carregando fichas…");
  const [busy, setBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<SheetOwnerOut[]>([]);
  const selected = sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0] ?? null;

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
    let alive = true;
    let nextUrl = "";
    if (!selected || mode !== "pdf") {
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
      setStatus(created.fields.length ? `${created.fields.length} campos detectados.` : "PDF importado sem campos. O editor de posicionamento será o próximo passo.");
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
          </div>
          <div class="sheet-mode" role="tablist" aria-label="Visualização da ficha">
            <button type="button" class={mode === "fields" ? "active" : ""} aria-selected={mode === "fields"} onClick={() => setMode("fields")}>Campos</button>
            <button type="button" class={mode === "pdf" ? "active" : ""} aria-selected={mode === "pdf"} onClick={() => setMode("pdf")}>PDF · {selected.page_count} pág.</button>
          </div>
          {mode === "fields" ? (
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
              )) : <div class="sheet-fields-empty">Este PDF não contém campos AcroForm. O posicionador visual será implementado no próximo corte P0.</div>}
              {!!selected.fields.length && <button type="button" class="btn-primary sheet-save" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar alterações"}</button>}
            </div>
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
