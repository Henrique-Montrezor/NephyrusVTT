import { useEffect, useRef, useState } from "preact/hooks";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { CharacterSheetOut, SheetClient, SheetFieldDraft, SheetFieldOut, SheetFieldType } from "@/net/rest";

interface SheetEditorProps {
  client: SheetClient;
  sheet: CharacterSheetOut;
  onChange: (sheet: CharacterSheetOut) => void;
  onStatus: (message: string) => void;
}

const FIELD_TYPES: { value: SheetFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "checkbox", label: "Checkbox" },
  { value: "textarea", label: "Área longa" },
  { value: "image", label: "Imagem" },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function defaultKey(label: string, fallback: number): string {
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || `campo_${fallback}`;
}

export function SheetEditor({ client, sheet, onChange, onStatus }: SheetEditorProps) {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(320);
  const [fieldType, setFieldType] = useState<SheetFieldType>("text");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldPublic, setFieldPublic] = useState(false);
  const [pendingRect, setPendingRect] = useState<[number, number, number, number] | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const draftBoxRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const [pdfjs, workerModule] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
        const blob = await client.pdfBlob(sheet.id);
        loaded = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (alive) setDocumentProxy(loaded);
      } catch (error) {
        onStatus(error instanceof Error ? error.message : "Falha ao preparar o editor.");
      }
    })();
    return () => {
      alive = false;
      void loaded?.destroy();
    };
  }, [client, sheet.id]);

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(Math.max(240, entry.contentRect.width - 24)));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    let renderTask: RenderTask | null = null;
    let cancelled = false;
    void documentProxy.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = (containerWidth / natural.width) * zoom;
      const viewport = page.getViewport({ scale });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      if (pageRef.current) {
        pageRef.current.style.width = `${viewport.width}px`;
        pageRef.current.style.height = `${viewport.height}px`;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
      return renderTask.promise;
    }).catch((error) => {
      if (error?.name !== "RenderingCancelledException") onStatus("Não foi possível renderizar esta página.");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom, containerWidth]);

  const pointFromEvent = (event: PointerEvent): { x: number; y: number } | null => {
    const page = pageRef.current;
    if (!page) return null;
    const bounds = page.getBoundingClientRect();
    return {
      x: clamp(100 * (event.clientX - bounds.left) / bounds.width),
      y: clamp(100 * (event.clientY - bounds.top) / bounds.height),
    };
  };

  const drawStart = (event: PointerEvent) => {
    if (!drawing) return;
    if ((event.target as HTMLElement).closest(".sheet-editor-field")) return;
    const point = pointFromEvent(event);
    if (!point) return;
    dragStart.current = point;
    setPendingRect(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const box = draftBoxRef.current;
    if (box) {
      box.hidden = false;
      Object.assign(box.style, { left: `${point.x}%`, top: `${point.y}%`, width: "0%", height: "0%" });
    }
  };

  const drawMove = (event: PointerEvent) => {
    if (!drawing) return;
    const start = dragStart.current;
    const point = pointFromEvent(event);
    const box = draftBoxRef.current;
    if (!start || !point || !box) return;
    Object.assign(box.style, {
      left: `${Math.min(start.x, point.x)}%`,
      top: `${Math.min(start.y, point.y)}%`,
      width: `${Math.abs(point.x - start.x)}%`,
      height: `${Math.abs(point.y - start.y)}%`,
    });
  };

  const drawEnd = (event: PointerEvent) => {
    if (!drawing) return;
    const start = dragStart.current;
    const point = pointFromEvent(event);
    dragStart.current = null;
    if (!start || !point) return;
    const rect: [number, number, number, number] = [
      Math.min(start.x, point.x),
      Math.min(start.y, point.y),
      Math.abs(point.x - start.x),
      Math.abs(point.y - start.y),
    ].map((value) => Math.round(value * 100) / 100) as [number, number, number, number];
    if (rect[2] < 1 || rect[3] < 0.7) {
      if (draftBoxRef.current) draftBoxRef.current.hidden = true;
      onStatus("Arraste uma área maior para criar o campo.");
      return;
    }
    setPendingRect(rect);
    if (!fieldLabel) setFieldLabel(FIELD_TYPES.find((item) => item.value === fieldType)?.label ?? "Campo");
  };

  const selectField = (field: SheetFieldOut) => {
    setEditingKey(field.key);
    setFieldType(field.field_type);
    setFieldLabel(field.label);
    setFieldKey(field.key);
    setFieldPublic(field.public);
    setPendingRect(field.rect);
    onStatus(field.source === "custom"
      ? "Campo selecionado. Arraste outra área para reposicionar."
      : "Campo detectado no PDF. Você pode alterar o nome e o tipo.");
  };

  const resetForm = () => {
    setEditingKey(null);
    setPendingRect(null);
    setFieldLabel("");
    setFieldKey("");
    setFieldPublic(false);
    if (draftBoxRef.current) draftBoxRef.current.hidden = true;
  };

  const saveField = async (event: Event) => {
    event.preventDefault();
    if (!pendingRect || !fieldLabel.trim()) return;
    setBusy(true);
    try {
      const draft: SheetFieldDraft = {
        key: fieldKey || defaultKey(fieldLabel, sheet.fields.length + 1),
        label: fieldLabel.trim(),
        field_type: fieldType,
        page: pageNumber,
        rect: pendingRect,
        public: fieldPublic,
      };
      const editingField = sheet.fields.find((field) => field.key === editingKey);
      const updated = editingKey
        ? await client.updateField(sheet.id, editingKey, editingField?.source === "acroform"
          ? { label: draft.label, field_type: draft.field_type, public: draft.public }
          : draft)
        : await client.addField(sheet.id, draft);
      onChange(updated);
      onStatus(editingKey ? "Campo atualizado." : "Campo criado.");
      resetForm();
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Falha ao salvar campo.");
    } finally {
      setBusy(false);
    }
  };

  const removeField = async () => {
    if (!editingKey) return;
    setBusy(true);
    try {
      onChange(await client.removeField(sheet.id, editingKey));
      onStatus("Campo removido.");
      resetForm();
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Falha ao remover campo.");
    } finally {
      setBusy(false);
    }
  };

  const visibleFields = sheet.fields.filter((field) => field.page === pageNumber);
  const editingField = sheet.fields.find((field) => field.key === editingKey);

  return (
    <div class="sheet-editor">
      <div class="sheet-editor-tools">
        <label><span>Tipo</span><select value={fieldType} onChange={(event) => setFieldType((event.target as HTMLSelectElement).value as SheetFieldType)}>{FIELD_TYPES.map((type) => <option value={type.value}>{type.label}</option>)}</select></label>
        <div class="sheet-editor-pages">
          <button type="button" aria-label="Página anterior" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>Ant.</button>
          <span>{pageNumber}/{sheet.page_count}</span>
          <button type="button" aria-label="Próxima página" disabled={pageNumber >= sheet.page_count} onClick={() => setPageNumber((value) => value + 1)}>Próx.</button>
        </div>
        <div class="sheet-editor-zoom" aria-label="Zoom do editor">
          <button type="button" disabled={zoom <= 0.65} onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.15))}>+</button>
        </div>
      </div>
      <div class="sheet-editor-hint">
        <p>{drawing ? "Arraste para criar um campo. Toque em qualquer campo para alterar o tipo." : "Use o gesto de arrastar para navegar pela página ampliada."}</p>
        <button type="button" aria-pressed={!drawing} onClick={() => setDrawing((value) => !value)}>{drawing ? "Navegar" : "Desenhar"}</button>
      </div>
      <div class="sheet-editor-viewport" ref={viewportRef}>
        <div class={`sheet-editor-page${drawing ? "" : " navigating"}`} ref={pageRef} onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawEnd}>
          <canvas ref={canvasRef} />
          {visibleFields.map((field) => (
            <button
              type="button"
              class={`sheet-editor-field ${field.source}${editingKey === field.key ? " selected" : ""}`}
              style={{ left: `${field.rect[0]}%`, top: `${field.rect[1]}%`, width: `${field.rect[2]}%`, height: `${field.rect[3]}%` }}
              title={`${field.label} (${field.field_type})`}
              onClick={(event) => { event.stopPropagation(); selectField(field); }}
            >
              <span>{field.label}</span>
            </button>
          ))}
          <div class="sheet-editor-draft" ref={draftBoxRef} hidden />
        </div>
      </div>
      {pendingRect && (
        <form class="sheet-editor-form" onSubmit={saveField}>
          <label><span>Nome do campo</span><input value={fieldLabel} onInput={(event) => setFieldLabel((event.target as HTMLInputElement).value)} /></label>
          {!editingKey && <label><span>Identificador</span><input value={fieldKey} placeholder={defaultKey(fieldLabel, sheet.fields.length + 1)} onInput={(event) => setFieldKey((event.target as HTMLInputElement).value)} /></label>}
          <label class="sheet-editor-public"><input type="checkbox" checked={fieldPublic} onChange={(event) => setFieldPublic((event.target as HTMLInputElement).checked)} /><span>Visível para a mesa</span></label>
          <div class="sheet-editor-actions">
            {editingKey && editingField?.source === "custom" && <button type="button" class="btn-ghost danger" disabled={busy} onClick={() => void removeField()}>Remover</button>}
            <button type="button" class="btn-ghost" disabled={busy} onClick={resetForm}>Cancelar</button>
            <button type="submit" class="btn-primary" disabled={busy || !fieldLabel.trim()}>{busy ? "Salvando…" : editingKey ? "Atualizar" : "Criar campo"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
