import { useMemo, useState } from "preact/hooks";
import { DiceFive, FilePdf, FloppyDisk, MapTrifold } from "@phosphor-icons/react";
import { type CharacterSheetOut, GameSystemClient, type SheetClient, type SystemManifest, type SystemRoll } from "@/net/rest";
import { partitionPdfFields } from "@/features/tokens/token-flow";
import { SheetEditor } from "@/features/sheet/SheetEditor";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const dieFrom = (formula?: string): number => Number(formula?.match(/d(4|6|8|10|12|20|100)\b/i)?.[1] ?? 20);

export function SystemConfiguratorModal({ initialTemplate, initialManifest, sheetClient, systemClient, onChange }: {
  initialTemplate: CharacterSheetOut;
  initialManifest: SystemManifest;
  sheetClient: SheetClient;
  systemClient: GameSystemClient;
  onChange: (template: CharacterSheetOut, manifest: SystemManifest) => void;
}) {
  const [template, setTemplate] = useState(initialTemplate);
  const [manifest, setManifest] = useState(initialManifest);
  const [mode, setMode] = useState<"map" | "rolls">("map");
  const [status, setStatus] = useState("Clique em um campo do PDF para nomear e definir seu tipo.");
  const [busy, setBusy] = useState(false);
  const partition = partitionPdfFields(template.fields);
  const numeric = partition.mapped.filter((field) => field.field_type === "number");
  const configured = useMemo(() => new Map(manifest.rolls.map((roll) => [roll.key, roll])), [manifest.rolls]);

  const changeRoll = (key: string, enabled: boolean, sides = dieFrom(configured.get(key)?.formula)) => {
    const field = numeric.find((item) => item.key === key);
    if (!field) return;
    const others = manifest.rolls.filter((roll) => roll.key !== key);
    setManifest({ ...manifest, rolls: enabled ? [...others, { key, label: field.label, formula: `{${key}}d${sides}` }] : others });
  };
  const save = async () => {
    setBusy(true);
    try {
      const rolls = manifest.rolls.filter((roll) => numeric.some((field) => field.key === roll.key)).map<SystemRoll>((roll) => ({ ...roll, label: numeric.find((field) => field.key === roll.key)?.label ?? roll.label }));
      const saved = await systemClient.save({ ...manifest, base_sheet_id: template.id, rolls });
      setManifest(saved.manifest);
      onChange(template, saved.manifest);
      setStatus("Modelo e rolagens salvos para a campanha.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível salvar o modelo."); }
    finally { setBusy(false); }
  };

  return <div class="system-template-modal">
    <div class="system-template-modal-meta"><div><FilePdf size={21} /><span><strong>{template.source_name}</strong><small>{template.page_count} pág. · {partition.mapped.length} campos mapeados</small></span></div><p>{partition.unmapped.length ? `${partition.unmapped.length} campos automáticos ainda não foram nomeados e permanecem ocultos.` : "Todos os campos visíveis estão mapeados."}</p></div>
    <div class="system-view-tabs" role="tablist"><button type="button" class={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><MapTrifold size={17} /> Mapear no PDF <small>{partition.mapped.length}</small></button><button type="button" class={mode === "rolls" ? "active" : ""} onClick={() => setMode("rolls")}><DiceFive size={17} /> Rolagens <small>{manifest.rolls.length}</small></button></div>
    {mode === "map" ? <SheetEditor client={sheetClient} sheet={template} onChange={(next) => { setTemplate(next); onChange(next, manifest); }} onStatus={setStatus} /> : <div class="system-roll-workspace">
      <aside class="system-field-reference"><strong>Campos disponíveis</strong><p>Somente números posicionados no PDF podem virar uma rolagem.</p>{numeric.map((field) => <div key={field.key}><span>{field.label}</span><code>{field.key}</code></div>)}{!numeric.length && <div class="system-no-fields">No PDF, desenhe ou selecione um campo e escolha o tipo Número.</div>}</aside>
      <div class="system-rolls">{numeric.map((field) => {
        const roll = configured.get(field.key);
        const sides = dieFrom(roll?.formula);
        return <article class={`system-roll${roll ? " active" : ""}`} key={field.key}><div class="system-roll-toggle"><label><input type="checkbox" checked={Boolean(roll)} onChange={(event) => changeRoll(field.key, (event.target as HTMLInputElement).checked, sides)} /><span><strong>{field.label}</strong><code>{field.key}</code></span></label><label><span>Dado</span><select disabled={!roll} value={sides} onChange={(event) => changeRoll(field.key, true, Number((event.target as HTMLSelectElement).value))}>{DICE.map((die) => <option key={die} value={die}>d{die}</option>)}</select></label></div><p>Se {field.label} = 2, rola <strong>2d{sides}</strong></p></article>;
      })}{!numeric.length && <div class="system-rolls-empty"><DiceFive size={26} /><strong>Nenhum atributo numérico mapeado</strong><p>Volte ao PDF, selecione a área do atributo e defina seu tipo como Número.</p></div>}</div>
    </div>}
    <footer class="system-configurator-footer"><span>{status}</span><button type="button" class="btn-primary" disabled={busy} onClick={() => void save()}><FloppyDisk size={17} /> {busy ? "Salvando…" : "Salvar modelo"}</button></footer>
  </div>;
}
