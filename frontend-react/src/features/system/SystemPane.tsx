import { useEffect, useMemo, useState } from "preact/hooks";
import { CheckCircle, DiceFive, FilePdf, Plus, UploadSimple } from "@phosphor-icons/react";
import {
  GameSystemClient,
  SheetClient,
  type CharacterSheetOut,
  type FormulaCheckOut,
  type SystemManifest,
  type SystemRoll,
} from "@/net/rest";
import { identity } from "@/state/identity";
import { SheetEditor } from "@/features/sheet/SheetEditor";

type View = "template" | "rolls";

const EMPTY: SystemManifest = {
  schema_version: "nephyrus.system/v2",
  name: "Regras da campanha",
  version: "1.0.0",
  license: "Uso privado",
  base_sheet_id: null,
  rolls: [],
};

const clone = (manifest: SystemManifest): SystemManifest => JSON.parse(JSON.stringify(manifest));

function makeKey(label: string, fallback: number): string {
  return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || `rolagem_${fallback}`;
}

export function SystemPane() {
  const session = identity.value;
  const systemClient = useMemo(() => new GameSystemClient(session), [session.accessToken, session.campaignId]);
  const sheetClient = useMemo(() => new SheetClient(session), [session.accessToken, session.campaignId]);
  const [manifest, setManifest] = useState<SystemManifest>(clone(EMPTY));
  const [template, setTemplate] = useState<CharacterSheetOut | null>(null);
  const [view, setView] = useState<View>("template");
  const [checks, setChecks] = useState<Record<string, FormulaCheckOut>>({});
  const [status, setStatus] = useState("Preparando o sistema de regras...");
  const [tone, setTone] = useState<"neutral" | "success" | "error">("neutral");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([systemClient.get(), systemClient.template()]).then(([system, base]) => {
      if (!alive) return;
      setManifest(clone(system?.manifest ?? EMPTY));
      setTemplate(base);
      setStatus(base ? "Modelo carregado. Edite os campos ou configure as rolagens." : "Adicione o PDF que será a ficha padrão da campanha.");
      setBusy(false);
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar o sistema.");
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
      setManifest((current) => ({ ...current, base_sheet_id: created.id }));
      setView("template");
      setChecks({});
      setStatus(created.fields.length
        ? `${created.fields.length} campos detectados no PDF. Revise os tipos antes de criar rolagens.`
        : "PDF adicionado. Desenhe os campos que poderão ser usados nas rolagens.");
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
      setTemplate(created);
      setManifest(clone(system?.manifest ?? EMPTY));
      setView("template");
      setStatus("Modelo CC0 criado com campos numéricos e duas rolagens de exemplo.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar o exemplo.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await systemClient.save(manifest);
      setManifest(clone(saved.manifest));
      setStatus("Ficha base e rolagens salvas.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar as regras.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const updateRoll = (index: number, next: SystemRoll) => {
    setManifest((current) => ({ ...current, rolls: current.rolls.map((roll, i) => i === index ? next : roll) }));
    setChecks((current) => { const copy = { ...current }; delete copy[next.key]; return copy; });
  };

  const addRoll = () => {
    const count = manifest.rolls.length + 1;
    setManifest((current) => ({
      ...current,
      rolls: [...current.rolls, { key: `rolagem_${count}`, label: "Nova rolagem", formula: "1d20" }],
    }));
  };

  const checkRoll = async (roll: SystemRoll) => {
    if (!template) return;
    try {
      const result = await systemClient.check(roll.formula, template.id);
      setChecks((current) => ({ ...current, [roll.key]: result }));
      setStatus(`Fórmula válida. Resultado médio com a ficha base: ${result.preview}.`);
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Fórmula inválida.");
      setTone("error");
    }
  };

  const numericFields = template?.fields.filter((field) => field.field_type === "number") ?? [];

  return (
    <section class="tab-pane system-pane active" aria-busy={busy}>
      <header class="system-header">
        <div>
          <h2>Ficha padrão e rolagens</h2>
          <p>O PDF define os campos. As fórmulas usam os campos numéricos dessa ficha.</p>
        </div>
        {template && (
          <label class="btn-ghost system-import">
            <UploadSimple size={17} weight="bold" /> Trocar PDF
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} />
          </label>
        )}
      </header>

      {!template && !busy ? (
        <div class="system-template-empty">
          <div class="system-template-icon"><FilePdf size={32} weight="duotone" /></div>
          <strong>Adicione o modelo base de ficha</strong>
          <p>Use um PDF preenchível ou desenhe novos campos sobre qualquer ficha. Os campos numéricos ficarão disponíveis nas fórmulas.</p>
          <label class="btn-primary system-template-upload">
            <UploadSimple size={18} weight="bold" /> Escolher PDF
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} />
          </label>
          <button type="button" class="btn-ghost system-example-button" onClick={() => void useExample()}>Usar modelo de exemplo CC0</button>
        </div>
      ) : template ? (
        <>
          <div class="system-template-summary">
            <FilePdf size={24} weight="duotone" />
            <div><strong>{template.source_name}</strong><span>{template.page_count} pág. | {template.fields.length} campos | {numericFields.length} numéricos</span></div>
            <CheckCircle size={20} weight="fill" aria-label="Modelo ativo" />
          </div>

          <nav class="system-view-tabs" aria-label="Configuração do sistema">
            <button type="button" class={view === "template" ? "active" : ""} onClick={() => setView("template")}><FilePdf size={18} /> Editar ficha</button>
            <button type="button" class={view === "rolls" ? "active" : ""} onClick={() => setView("rolls")}><DiceFive size={18} /> Rolagens <small>{manifest.rolls.length}</small></button>
          </nav>

          {view === "template" ? (
            <div class="system-sheet-editor">
              <SheetEditor client={sheetClient} sheet={template} onChange={setTemplate} onStatus={(message) => { setStatus(message); setTone("neutral"); }} />
            </div>
          ) : (
            <div class="system-roll-workspace">
              <aside class="system-field-reference">
                <strong>Campos numéricos</strong>
                <p>Use a chave em qualquer fórmula.</p>
                {numericFields.length ? numericFields.map((field) => (
                  <div key={field.key}><span>{field.label}</span><code>{field.key}</code></div>
                )) : <div class="system-no-fields">Crie campos do tipo Número na ficha.</div>}
              </aside>

              <div class="system-rolls">
                {manifest.rolls.map((roll, index) => (
                  <article class="system-roll" key={`${index}-${roll.key}`}>
                    <div class="system-roll-head">
                      <label><span>Nome da rolagem</span><input value={roll.label} onInput={(event) => { const label = (event.target as HTMLInputElement).value; updateRoll(index, { ...roll, label, key: makeKey(label, index + 1) }); }} /></label>
                      <button type="button" onClick={() => setManifest((current) => ({ ...current, rolls: current.rolls.filter((_, i) => i !== index) }))}>Remover</button>
                    </div>
                    <label class="system-formula"><span>Fórmula</span><div><DiceFive size={19} /><input value={roll.formula} placeholder="1d20 + forca" onInput={(event) => updateRoll(index, { ...roll, formula: (event.target as HTMLInputElement).value })} /><button type="button" onClick={() => void checkRoll(roll)}>Testar</button></div></label>
                    {checks[roll.key] && <p class="system-formula-result"><CheckCircle size={16} weight="fill" /> Válida. Média {checks[roll.key].preview}{checks[roll.key].references.length ? ` usando ${checks[roll.key].references.join(", ")}` : ""}.</p>}
                  </article>
                ))}
                {!manifest.rolls.length && <div class="system-rolls-empty"><DiceFive size={28} weight="duotone" /><strong>Nenhuma rolagem configurada</strong><p>Crie ataques, testes e defesas usando os campos da ficha base.</p></div>}
                <button type="button" class="btn-ghost system-add-roll" onClick={addRoll} disabled={!numericFields.length}><Plus size={17} weight="bold" /> Adicionar rolagem</button>
              </div>
            </div>
          )}

          <footer class="system-footer">
            <span>{numericFields.length ? `${numericFields.length} campos disponíveis para fórmulas` : "Adicione campos numéricos antes de criar rolagens"}</span>
            <button type="button" class="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Validando..." : "Salvar regras"}</button>
          </footer>
        </>
      ) : <div class="system-loading" aria-hidden="true"><span /><span /><span /></div>}

      {status && <p class={`system-status ${tone}`} role="status">{status}</p>}
    </section>
  );
}
