import { useEffect, useMemo, useState } from "preact/hooks";
import { ArrowRight, CheckCircle, DiceFive, FilePdf, FloppyDisk, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import {
  GameSystemClient,
  SheetClient,
  type CharacterSheetOut,
  type SheetFieldOut,
  type SystemManifest,
  type SystemRoll,
} from "@/net/rest";
import { identity } from "@/state/identity";

const DIE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];

const EMPTY: SystemManifest = {
  schema_version: "nephyrus.system/v2",
  name: "Regras da campanha",
  version: "1.0.0",
  license: "Uso privado",
  base_sheet_id: null,
  rolls: [],
};

const clone = (manifest: SystemManifest): SystemManifest => JSON.parse(JSON.stringify(manifest));

function makeKey(label: string, fallback = 1): string {
  return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || `atributo_${fallback}`;
}

function rollSides(rolls: SystemRoll[], field: SheetFieldOut): number {
  const direct = rolls.find((roll) => roll.formula.startsWith(`{${field.key}}d`));
  const related = direct ?? rolls.find((roll) => new RegExp(`\\b${field.key}\\b`).test(roll.formula));
  const match = related?.formula.match(/d(4|6|8|10|12|20|100)\b/i);
  return match ? Number(match[1]) : 20;
}

function diceMap(fields: SheetFieldOut[], rolls: SystemRoll[]): Record<string, number> {
  return Object.fromEntries(
    fields.filter((field) => field.field_type === "number").map((field) => [field.key, rollSides(rolls, field)]),
  );
}

export function SystemPane() {
  const session = identity.value;
  const systemClient = useMemo(() => new GameSystemClient(session), [session.accessToken, session.campaignId]);
  const sheetClient = useMemo(() => new SheetClient(session), [session.accessToken, session.campaignId]);
  const [manifest, setManifest] = useState<SystemManifest>(clone(EMPTY));
  const [template, setTemplate] = useState<CharacterSheetOut | null>(null);
  const [attributeDice, setAttributeDice] = useState<Record<string, number>>({});
  const [newAttribute, setNewAttribute] = useState("");
  const [status, setStatus] = useState("Carregando modelo de ficha...");
  const [tone, setTone] = useState<"neutral" | "success" | "error">("neutral");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([systemClient.get(), systemClient.template()]).then(([system, base]) => {
      if (!alive) return;
      const loadedManifest = clone(system?.manifest ?? EMPTY);
      setManifest(loadedManifest);
      setTemplate(base);
      setAttributeDice(diceMap(base?.fields ?? [], loadedManifest.rolls));
      setStatus(base ? "Modelo pronto para configurar." : "Adicione o PDF que será usado como ficha padrão.");
      setBusy(false);
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar o modelo.");
      setTone("error");
      setBusy(false);
    });
    return () => { alive = false; };
  }, [systemClient]);

  const uploadTemplate = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const created = await systemClient.uploadTemplate(file);
      setTemplate(created);
      setManifest((current) => ({ ...current, base_sheet_id: created.id, rolls: [] }));
      setAttributeDice({});
      setStatus("Modelo adicionado. Agora crie os atributos usados nas rolagens.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível importar o PDF.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const useExample = async () => {
    setBusy(true);
    try {
      const created = await systemClient.exampleTemplate();
      const system = await systemClient.get();
      const loadedManifest = clone(system?.manifest ?? EMPTY);
      setTemplate(created);
      setManifest(loadedManifest);
      setAttributeDice(diceMap(created.fields, loadedManifest.rolls));
      setStatus("Modelo de exemplo criado com Força, Agilidade e Espírito.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar o exemplo.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const numericFields = template?.fields.filter((field) => field.field_type === "number") ?? [];

  const addAttribute = async (event: Event) => {
    event.preventDefault();
    if (!template || !newAttribute.trim()) return;
    const label = newAttribute.trim();
    const base = makeKey(label, numericFields.length + 1);
    let key = base;
    let suffix = 2;
    while (template.fields.some((field) => field.key === key)) key = `${base}_${suffix++}`;
    setBusy(true);
    try {
      const updated = await sheetClient.addField(template.id, {
        key,
        label,
        field_type: "number",
        page: 1,
        rect: [0, 0, 0, 0],
        public: true,
      });
      setTemplate(updated);
      setAttributeDice((current) => ({ ...current, [key]: 20 }));
      setNewAttribute("");
      setStatus(`${label} adicionado. Com valor 2, a rolagem será 2d20.`);
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível adicionar o atributo.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const removeAttribute = async (field: SheetFieldOut) => {
    if (!template || field.source !== "custom") return;
    setBusy(true);
    try {
      const updated = await sheetClient.removeField(template.id, field.key);
      setTemplate(updated);
      setAttributeDice((current) => {
        const next = { ...current };
        delete next[field.key];
        return next;
      });
      setStatus(`${field.label} removido do modelo.`);
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível remover o atributo.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const rolls = numericFields.map<SystemRoll>((field) => ({
        key: field.key,
        label: field.label,
        formula: `{${field.key}}d${attributeDice[field.key] ?? 20}`,
      }));
      const saved = await systemClient.save({ ...manifest, base_sheet_id: template.id, rolls });
      setManifest(clone(saved.manifest));
      setStatus("Modelo e rolagens salvos para a campanha.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar o modelo.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="tab-pane system-pane active" aria-busy={busy}>
      <header class="system-header">
        <div>
          <h2>Modelo de ficha</h2>
          <p>Defina os atributos e quantos dados cada valor representa.</p>
        </div>
      </header>

      {!template && !busy ? (
        <div class="system-template-empty">
          <div class="system-template-icon"><FilePdf size={32} weight="duotone" /></div>
          <strong>Adicione a ficha padrão</strong>
          <p>O PDF será a base visual. Depois você escolhe os atributos usados nas rolagens.</p>
          <label class="btn-primary system-template-upload">
            <UploadSimple size={18} weight="bold" /> Escolher PDF
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} />
          </label>
          <button type="button" class="btn-ghost system-example-button" onClick={() => void useExample()}>Usar ficha de exemplo</button>
        </div>
      ) : template ? (
        <>
          <div class="system-model-strip">
            <div class="system-model-document"><FilePdf size={26} weight="duotone" /></div>
            <div class="system-model-name">
              <strong>{template.source_name}</strong>
              <span>{template.page_count} {template.page_count === 1 ? "página" : "páginas"}</span>
            </div>
            <CheckCircle size={20} weight="fill" aria-label="Modelo ativo" />
            <label class="btn-ghost system-import">
              <UploadSimple size={16} weight="bold" /> Trocar PDF
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} />
            </label>
          </div>

          <div class="system-attribute-intro">
            <div><h3>Atributos e dados</h3><p>O valor preenchido na ficha vira a quantidade de dados.</p></div>
            <div class="system-roll-example" aria-label="Exemplo de rolagem"><span>FOR = 2</span><ArrowRight size={16} /><strong>2d20</strong></div>
          </div>

          <form class="system-add-attribute" onSubmit={addAttribute}>
            <label>
              <span>Novo atributo</span>
              <input value={newAttribute} placeholder="Ex.: Força" onInput={(event) => setNewAttribute((event.target as HTMLInputElement).value)} />
            </label>
            <div class="system-attribute-key"><span>Variável</span><code>{makeKey(newAttribute || "atributo")}</code></div>
            <button type="submit" class="btn-primary" disabled={busy || !newAttribute.trim()}><Plus size={17} weight="bold" /> Adicionar</button>
          </form>

          <div class="system-attributes" aria-label="Atributos da ficha">
            {numericFields.map((field) => {
              const sides = attributeDice[field.key] ?? 20;
              return (
                <article class="system-attribute" key={field.key}>
                  <div class="system-attribute-mark" aria-hidden="true">{field.label.slice(0, 3).toUpperCase()}</div>
                  <div class="system-attribute-name"><strong>{field.label}</strong><code>{field.key}</code></div>
                  <div class="system-attribute-rule">
                    <span>Valor do atributo</span><ArrowRight size={16} aria-hidden="true" />
                    <label>
                      <span class="sr-only">Dado de {field.label}</span><DiceFive size={18} />
                      <select value={sides} onChange={(event) => setAttributeDice((current) => ({ ...current, [field.key]: Number((event.target as HTMLSelectElement).value) }))}>
                        {DIE_OPTIONS.map((die) => <option value={die}>d{die}</option>)}
                      </select>
                    </label>
                  </div>
                  <div class="system-attribute-preview">Se {field.label} = 2, rola <strong>2d{sides}</strong></div>
                  {field.source === "custom" && (
                    <button type="button" class="system-attribute-remove" aria-label={`Remover ${field.label}`} disabled={busy} onClick={() => void removeAttribute(field)}><Trash size={17} /></button>
                  )}
                </article>
              );
            })}
            {!numericFields.length && (
              <div class="system-attributes-empty">
                <DiceFive size={28} weight="duotone" /><strong>Nenhum atributo ainda</strong>
                <p>Adicione Força, Agilidade ou qualquer valor numérico usado pelo seu sistema.</p>
              </div>
            )}
          </div>

          <footer class="system-footer">
            <span>{numericFields.length} {numericFields.length === 1 ? "atributo configurado" : "atributos configurados"}</span>
            <button type="button" class="btn-primary" disabled={busy} onClick={() => void save()}>
              <FloppyDisk size={18} weight="bold" /> {busy ? "Salvando..." : "Salvar modelo"}
            </button>
          </footer>
        </>
      ) : <div class="system-loading" aria-hidden="true"><span /><span /><span /></div>}

      {status && <p class={`system-status ${tone}`} role="status">{status}</p>}
    </section>
  );
}
