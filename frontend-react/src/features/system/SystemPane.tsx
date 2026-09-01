import { useEffect, useMemo, useState } from "preact/hooks";
import {
  GameSystemClient,
  type FormulaCheckOut,
  type SystemAttribute,
  type SystemManifest,
  type SystemResource,
  type SystemRoll,
} from "@/net/rest";
import { identity } from "@/state/identity";

type Section = "attributes" | "resources" | "rolls";

const EMPTY: SystemManifest = {
  schema_version: "nephyrus.system/v1",
  name: "Sistema da campanha",
  version: "1.0.0",
  license: "Uso privado",
  attributes: [],
  resources: [],
  rolls: [],
};

const EXAMPLE: SystemManifest = {
  schema_version: "nephyrus.system/v1",
  name: "Jornadas de Nephyrus",
  version: "1.0.0",
  license: "CC0-1.0",
  attributes: [
    { key: "forca", label: "Força", kind: "number", default: 2, sheet_field: null },
    { key: "agilidade", label: "Agilidade", kind: "number", default: 1, sheet_field: null },
    { key: "espirito", label: "Espírito", kind: "number", default: 0, sheet_field: null },
  ],
  resources: [
    { key: "vigor", label: "Vigor", current: 8, maximum_formula: "6 + forca", sheet_field: null },
  ],
  rolls: [
    { key: "ataque", label: "Ataque", formula: "1d20 + forca" },
    { key: "iniciativa", label: "Iniciativa", formula: "1d20 + agilidade" },
  ],
};

const clone = (manifest: SystemManifest): SystemManifest => JSON.parse(JSON.stringify(manifest));
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SystemPane() {
  const session = identity.value;
  const client = useMemo(() => new GameSystemClient(session), [session.accessToken, session.campaignId]);
  const [manifest, setManifest] = useState<SystemManifest>(clone(EMPTY));
  const [section, setSection] = useState<Section>("attributes");
  const [status, setStatus] = useState("Carregando configuração...");
  const [tone, setTone] = useState<"neutral" | "success" | "error">("neutral");
  const [busy, setBusy] = useState(true);
  const [checks, setChecks] = useState<Record<string, FormulaCheckOut>>({});

  useEffect(() => {
    let alive = true;
    void client.get().then((result) => {
      if (!alive) return;
      setManifest(clone(result?.manifest ?? EMPTY));
      setStatus(result ? "Sistema pronto para edição." : "Comece do zero ou carregue o exemplo CC0.");
      setBusy(false);
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar o sistema.");
      setTone("error");
      setBusy(false);
    });
    return () => { alive = false; };
  }, [client]);

  const update = <K extends keyof SystemManifest,>(key: K, value: SystemManifest[K]) => setManifest((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      const result = await client.save(manifest);
      setManifest(clone(result.manifest));
      setStatus("Sistema salvo. As fórmulas foram validadas com segurança.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar o sistema.");
      setTone("error");
    } finally { setBusy(false); }
  };

  const checkFormula = async (key: string, formula: string) => {
    try {
      const result = await client.check(formula, manifest.attributes);
      setChecks((current) => ({ ...current, [key]: result }));
      setStatus(`Fórmula válida. Prévia média: ${result.preview}.`);
      setTone("success");
    } catch (error) {
      setChecks((current) => { const next = { ...current }; delete next[key]; return next; });
      setStatus(error instanceof Error ? error.message : "Fórmula inválida.");
      setTone("error");
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await client.import(file);
      setManifest(clone(result.manifest));
      setStatus("Pacote importado e validado.");
      setTone("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pacote inválido.");
      setTone("error");
    } finally { setBusy(false); }
  };

  const addAttribute = () => update("attributes", [...manifest.attributes, { key: `atributo_${manifest.attributes.length + 1}`, label: "Novo atributo", kind: "number", default: 0, sheet_field: null }]);
  const addResource = () => update("resources", [...manifest.resources, { key: `recurso_${manifest.resources.length + 1}`, label: "Novo recurso", current: 0, maximum_formula: "1", sheet_field: null }]);
  const addRoll = () => update("rolls", [...manifest.rolls, { key: `rolagem_${manifest.rolls.length + 1}`, label: "Nova rolagem", formula: "1d20" }]);

  return (
    <section class="tab-pane system-pane active" aria-busy={busy}>
      <header class="system-header">
        <div><h2>Regras da campanha</h2><p>Defina dados da ficha e rolagens sem escrever código.</p></div>
        <div class="system-header-actions">
          <label class="btn-ghost system-import">Importar<input type="file" accept="application/json,.json" onChange={(event) => void importFile((event.target as HTMLInputElement).files?.[0])} /></label>
          <button type="button" class="btn-ghost" disabled={busy} onClick={() => void client.export().then((blob) => download(blob, `${slug(manifest.name) || "sistema"}.nephyrus.json`)).catch((error) => { setStatus(error.message); setTone("error"); })}>Exportar</button>
        </div>
      </header>

      <div class="system-identity">
        <label><span>Nome do sistema</span><input value={manifest.name} onInput={(event) => update("name", (event.target as HTMLInputElement).value)} /></label>
        <label><span>Versão</span><input value={manifest.version} inputMode="numeric" onInput={(event) => update("version", (event.target as HTMLInputElement).value)} /></label>
        <label><span>Licença</span><input value={manifest.license} onInput={(event) => update("license", (event.target as HTMLInputElement).value)} /></label>
      </div>

      {!busy && !manifest.attributes.length && !manifest.resources.length && !manifest.rolls.length && (
        <div class="system-empty">
          <strong>Seu sistema começa com três decisões</strong>
          <p>Cadastre atributos, recursos que possuem limite e as rolagens usadas durante a sessão.</p>
          <button type="button" class="btn-ghost" onClick={() => { setManifest(clone(EXAMPLE)); setStatus("Exemplo CC0 carregado. Revise e salve para usar."); }}>Carregar exemplo CC0</button>
        </div>
      )}

      <nav class="system-sections" aria-label="Partes do sistema">
        {(["attributes", "resources", "rolls"] as Section[]).map((item) => {
          const labels = { attributes: "Atributos", resources: "Recursos", rolls: "Rolagens" };
          return <button key={item} type="button" class={section === item ? "active" : ""} onClick={() => setSection(item)}>{labels[item]}<small>{manifest[item].length}</small></button>;
        })}
      </nav>

      <div class="system-list">
        {busy && status.startsWith("Carregando") && <div class="system-loading" aria-hidden="true"><span /><span /><span /></div>}
        {section === "attributes" && manifest.attributes.map((item, index) => (
          <AttributeRow key={`${index}-${item.key}`} item={item} onChange={(next) => update("attributes", manifest.attributes.map((value, i) => i === index ? next : value))} onRemove={() => update("attributes", manifest.attributes.filter((_, i) => i !== index))} />
        ))}
        {section === "resources" && manifest.resources.map((item, index) => (
          <ResourceRow key={`${index}-${item.key}`} item={item} check={checks[`resource:${item.key}`]} onCheck={() => void checkFormula(`resource:${item.key}`, item.maximum_formula)} onChange={(next) => update("resources", manifest.resources.map((value, i) => i === index ? next : value))} onRemove={() => update("resources", manifest.resources.filter((_, i) => i !== index))} />
        ))}
        {section === "rolls" && manifest.rolls.map((item, index) => (
          <RollRow key={`${index}-${item.key}`} item={item} check={checks[`roll:${item.key}`]} onCheck={() => void checkFormula(`roll:${item.key}`, item.formula)} onChange={(next) => update("rolls", manifest.rolls.map((value, i) => i === index ? next : value))} onRemove={() => update("rolls", manifest.rolls.filter((_, i) => i !== index))} />
        ))}
        {!busy && manifest[section].length === 0 && <p class="system-list-empty">Nada aqui ainda. Adicione o primeiro item para continuar.</p>}
      </div>

      <div class="system-footer">
        <button type="button" class="btn-ghost" onClick={section === "attributes" ? addAttribute : section === "resources" ? addResource : addRoll}>Adicionar {section === "attributes" ? "atributo" : section === "resources" ? "recurso" : "rolagem"}</button>
        <button type="button" class="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Validando..." : "Salvar sistema"}</button>
      </div>
      {status && <p class={`system-status ${tone}`} role="status">{status}</p>}
    </section>
  );
}

function AttributeRow({ item, onChange, onRemove }: { item: SystemAttribute; onChange: (item: SystemAttribute) => void; onRemove: () => void }) {
  return <article class="system-row"><div class="system-row-grid"><label><span>Nome</span><input value={item.label} onInput={(e) => { const label = (e.target as HTMLInputElement).value; onChange({ ...item, label, key: slug(label) || item.key }); }} /></label><label><span>Chave</span><input value={item.key} onInput={(e) => onChange({ ...item, key: (e.target as HTMLInputElement).value })} /></label><label><span>Tipo</span><select value={item.kind} onChange={(e) => onChange({ ...item, kind: (e.target as HTMLSelectElement).value as SystemAttribute["kind"] })}><option value="number">Número</option><option value="text">Texto</option><option value="boolean">Marcador</option></select></label><label><span>Valor inicial</span><input value={String(item.default)} disabled={item.kind === "boolean"} onInput={(e) => onChange({ ...item, default: item.kind === "number" ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value })} /></label><label class="sheet-reference"><span>Campo da ficha</span><input value={item.sheet_field ?? ""} placeholder="Opcional" onInput={(e) => onChange({ ...item, sheet_field: (e.target as HTMLInputElement).value || null })} /></label></div><button type="button" class="system-remove" onClick={onRemove}>Remover</button></article>;
}

function ResourceRow({ item, check, onChange, onCheck, onRemove }: { item: SystemResource; check?: FormulaCheckOut; onChange: (item: SystemResource) => void; onCheck: () => void; onRemove: () => void }) {
  return <article class="system-row"><div class="system-row-grid"><label><span>Nome</span><input value={item.label} onInput={(e) => onChange({ ...item, label: (e.target as HTMLInputElement).value })} /></label><label><span>Chave</span><input value={item.key} onInput={(e) => onChange({ ...item, key: (e.target as HTMLInputElement).value })} /></label><label><span>Valor atual</span><input type="number" value={item.current} onInput={(e) => onChange({ ...item, current: Number((e.target as HTMLInputElement).value) })} /></label><label class="formula-field"><span>Máximo</span><div><input value={item.maximum_formula} onInput={(e) => onChange({ ...item, maximum_formula: (e.target as HTMLInputElement).value })} /><button type="button" onClick={onCheck}>Testar</button></div>{check && <small>Prévia {check.preview}</small>}</label><label class="sheet-reference"><span>Campo da ficha</span><input value={item.sheet_field ?? ""} placeholder="Opcional" onInput={(e) => onChange({ ...item, sheet_field: (e.target as HTMLInputElement).value || null })} /></label></div><button type="button" class="system-remove" onClick={onRemove}>Remover</button></article>;
}

function RollRow({ item, check, onChange, onCheck, onRemove }: { item: SystemRoll; check?: FormulaCheckOut; onChange: (item: SystemRoll) => void; onCheck: () => void; onRemove: () => void }) {
  return <article class="system-row"><div class="system-row-grid roll"><label><span>Nome</span><input value={item.label} onInput={(e) => onChange({ ...item, label: (e.target as HTMLInputElement).value })} /></label><label><span>Chave</span><input value={item.key} onInput={(e) => onChange({ ...item, key: (e.target as HTMLInputElement).value })} /></label><label class="formula-field"><span>Fórmula</span><div><input value={item.formula} placeholder="1d20 + forca" onInput={(e) => onChange({ ...item, formula: (e.target as HTMLInputElement).value })} /><button type="button" onClick={onCheck}>Testar</button></div>{check && <small>{check.references.length ? `Usa ${check.references.join(", ")}` : "Sem atributos"}. Prévia {check.preview}</small>}</label></div><button type="button" class="system-remove" onClick={onRemove}>Remover</button></article>;
}
