import { useState } from "preact/hooks";
import { sharedItems } from "@/state/ui-store";

export function SheetPane() {
  const sheets = sharedItems.value.filter((item) => item.kind.toLowerCase() === "pdf");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const selected = sheets.find((item) => item.url === selectedUrl) ?? sheets[0] ?? null;

  return (
    <section class="tab-pane sheet-pane active">
      {selected ? (
        <>
          <div class="sheet-toolbar">
            <label class="field sheet-select">
              <span>Ficha compartilhada</span>
              <select value={selected.url} onChange={(event) => setSelectedUrl((event.target as HTMLSelectElement).value)}>
                {sheets.map((sheet) => <option key={sheet.id} value={sheet.url}>{sheet.name}</option>)}
              </select>
            </label>
            <a class="btn-ghost sheet-open" href={selected.url} target="_blank" rel="noopener noreferrer">Abrir</a>
          </div>
          <iframe class="sheet-frame" src={selected.url} title={`Ficha ${selected.name}`} />
        </>
      ) : (
        <div class="sheet-empty">
          <strong>Nenhuma ficha disponível</strong>
          <p>Quando o mestre compartilhar um PDF, ele aparecerá aqui durante a sessão.</p>
        </div>
      )}
    </section>
  );
}
