import { useEffect, useState } from "preact/hooks";
import { DownloadSimple, SlidersHorizontal } from "@phosphor-icons/react";
import { SheetClient, type CharacterSheetOut, type SheetFieldOut } from "@/net/rest";
import { identity } from "@/state/identity";
import { SheetEditor } from "./SheetEditor";
import { SheetTokenPanel } from "./SheetTokenPanel";

type ViewMode = "info" | "sheet" | "token" | "editor";

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
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.addEventListener("load", () => onChange(String(reader.result ?? "")), { once: true });
            reader.readAsDataURL(file);
          }} />
        </label>
        {imageValue && <button type="button" class="btn-ghost" onClick={() => onChange("")}>Remover</button>}
      </div>
    );
  }
  if (field.field_type === "checkbox") {
    return <label class="sheet-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange((event.target as HTMLInputElement).checked)} /><span>{Boolean(value) ? "Marcado" : "Desmarcado"}</span></label>;
  }
  if (field.field_type === "textarea") {
    return <textarea rows={4} value={String(value ?? "")} onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)} />;
  }
  return <input type={field.field_type === "number" ? "number" : "text"} inputMode={field.field_type === "number" ? "decimal" : "text"} value={String(value ?? "")} onInput={(event) => onChange((event.target as HTMLInputElement).value)} />;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SheetWorkspaceModal({ sheet: initialSheet, client, initialMode = "info", onChange }: {
  sheet: CharacterSheetOut;
  client: SheetClient;
  initialMode?: ViewMode;
  onChange: (sheet: CharacterSheetOut) => void;
}) {
  const isGm = identity.value.isGm;
  const [sheet, setSheet] = useState(initialSheet);
  const [draft, setDraft] = useState<Record<string, unknown>>(sheet.values);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [pdfUrl, setPdfUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const replace = (next: CharacterSheetOut) => {
    setSheet(next);
    setDraft(next.values);
    onChange(next);
  };

  useEffect(() => {
    let alive = true;
    let url = "";
    if (mode !== "sheet") return;
    void client.pdfBlob(sheet.id).then((blob) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setPdfUrl(url);
    }).catch((error) => setStatus(error instanceof Error ? error.message : "Falha ao abrir PDF."));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [client, sheet.id, mode]);

  const save = async () => {
    setBusy(true);
    try { replace(await client.saveValues(sheet.id, draft)); setStatus("Ficha salva."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Falha ao salvar ficha."); }
    finally { setBusy(false); }
  };

  const togglePublic = async (field: SheetFieldOut) => {
    try { replace(await client.setPublic(sheet.id, field.key, !field.public)); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Falha ao alterar visibilidade."); }
  };

  const exportSheet = async () => {
    setBusy(true);
    try { download(await client.pdfBlob(sheet.id, true), `${sheet.title}-preenchida.pdf`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Falha ao exportar ficha."); }
    finally { setBusy(false); }
  };

  return (
    <div class="sheet-workspace">
      <div class="sheet-workspace-bar">
        <div><span>Ficha de {sheet.owner_name}</span><strong>{sheet.source_name}</strong></div>
        <button type="button" class="btn-ghost" disabled={busy} onClick={() => void exportSheet()}><DownloadSimple size={17} /> Exportar</button>
        {isGm && <button type="button" class="btn-ghost" onClick={() => setMode(mode === "editor" ? "sheet" : "editor")}><SlidersHorizontal size={17} /> {mode === "editor" ? "Voltar à ficha" : "Configurar campos"}</button>}
      </div>
      <div class="sheet-mode gm" role="tablist" aria-label="Seções da ficha">
        <button type="button" class={mode === "info" ? "active" : ""} onClick={() => setMode("info")}>Info</button>
        <button type="button" class={mode === "sheet" || mode === "editor" ? "active" : ""} onClick={() => setMode("sheet")}>Ficha · {sheet.page_count} pág.</button>
        <button type="button" class={mode === "token" ? "active" : ""} onClick={() => setMode("token")}>Token do personagem</button>
      </div>
      {mode === "info" ? (
        <div class="sheet-fields">
          {sheet.fields.length ? sheet.fields.map((field) => (
            <div class="sheet-field" key={field.key}>
              <label><span>{field.label}<small>Página {field.page}</small></span><FieldControl field={field} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} /></label>
              {isGm && <button type="button" class={`sheet-public${field.public ? " active" : ""}`} aria-pressed={field.public} onClick={() => void togglePublic(field)}>{field.public ? "Público" : "Privado"}</button>}
            </div>
          )) : <div class="sheet-fields-empty">Nenhum campo mapeado nesta ficha.</div>}
          {!!sheet.fields.length && <button type="button" class="btn-primary sheet-save" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar alterações"}</button>}
        </div>
      ) : mode === "token" ? <SheetTokenPanel sheet={sheet} onChange={replace} />
        : mode === "editor" && isGm ? <SheetEditor client={client} sheet={sheet} onChange={replace} onStatus={setStatus} />
          : pdfUrl ? <object class="sheet-frame" data={pdfUrl} type="application/pdf" aria-label={`PDF ${sheet.title}`}><button type="button" class="btn-primary" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}>Abrir PDF</button></object>
            : <div class="sheet-loading">Preparando visualização…</div>}
      {status && <p class="sheet-status" role="status">{status}</p>}
    </div>
  );
}
