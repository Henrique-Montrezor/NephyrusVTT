import { useEffect, useMemo, useState } from "preact/hooks";
import { CheckCircle, DiceFive, FilePdf, SlidersHorizontal, UploadSimple } from "@phosphor-icons/react";
import { GameSystemClient, SheetClient, type CharacterSheetOut, type SystemManifest } from "@/net/rest";
import { identity } from "@/state/identity";
import { openModal } from "@/ui/modal";
import { partitionPdfFields } from "@/features/tokens/token-flow";
import { SystemConfiguratorModal } from "./SystemConfiguratorModal";

const EMPTY: SystemManifest = { schema_version: "nephyrus.system/v2", name: "Regras da campanha", version: "1.0.0", license: "Uso privado", base_sheet_id: null, rolls: [] };
const clone = (manifest: SystemManifest): SystemManifest => JSON.parse(JSON.stringify(manifest));

export function SystemPane() {
  const currentIdentity = identity.value;
  const systemClient = useMemo(() => new GameSystemClient(currentIdentity), [currentIdentity.accessToken, currentIdentity.campaignId]);
  const sheetClient = useMemo(() => new SheetClient(currentIdentity), [currentIdentity.accessToken, currentIdentity.campaignId]);
  const [manifest, setManifest] = useState<SystemManifest>(clone(EMPTY));
  const [template, setTemplate] = useState<CharacterSheetOut | null>(null);
  const [status, setStatus] = useState("Carregando modelo de ficha…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([systemClient.get(), systemClient.template()]).then(([system, base]) => {
      if (!alive) return;
      setManifest(clone(system?.manifest ?? EMPTY));
      setTemplate(base);
      setStatus("");
      setBusy(false);
    }).catch((error) => { if (alive) { setStatus(error instanceof Error ? error.message : "Não foi possível carregar o modelo."); setBusy(false); } });
    return () => { alive = false; };
  }, [systemClient]);

  const uploadTemplate = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const created = await systemClient.uploadTemplate(file);
      const saved = await systemClient.save({ ...manifest, base_sheet_id: created.id, rolls: [] });
      setTemplate(created);
      setManifest(saved.manifest);
      setStatus("PDF adicionado. Abra o configurador para mapear os atributos.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível importar o PDF."); }
    finally { setBusy(false); }
  };

  const useExample = async () => {
    setBusy(true);
    try {
      const created = await systemClient.exampleTemplate();
      const system = await systemClient.get();
      setTemplate(created);
      setManifest(clone(system?.manifest ?? { ...EMPTY, base_sheet_id: created.id }));
      setStatus("Modelo de exemplo pronto.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível criar o exemplo."); }
    finally { setBusy(false); }
  };

  const configure = () => {
    if (!template) return;
    openModal({ title: "Configurar modelo de ficha", variant: "workspace", body: <SystemConfiguratorModal initialTemplate={template} initialManifest={manifest} sheetClient={sheetClient} systemClient={systemClient} onChange={(nextTemplate, nextManifest) => { setTemplate(nextTemplate); setManifest(clone(nextManifest)); }} /> });
  };
  const partition = template ? partitionPdfFields(template.fields) : { mapped: [], unmapped: [] };

  return <section class="tab-pane system-pane active" aria-busy={busy}>
    <header class="system-header"><div><h2>Modelo de ficha</h2><p>Uma base visual para criar personagens e definir atributos de rolagem.</p></div></header>
    {!template && !busy ? <div class="system-template-empty"><div class="system-template-icon"><FilePdf size={32} weight="duotone" /></div><strong>Adicione a ficha padrão</strong><p>O PDF será exibido visualmente. Você decide no próprio documento quais áreas são atributos.</p><label class="btn-primary system-template-upload"><UploadSimple size={18} /> Escolher PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} /></label><button type="button" class="btn-ghost system-example-button" onClick={() => void useExample()}>Usar ficha de exemplo</button></div> : template ? <>
      <div class="system-template-summary"><FilePdf size={23} /><div><strong>{template.source_name}</strong><span>{template.page_count} pág. · modelo ativo</span></div><CheckCircle size={18} weight="fill" /></div>
      <div class="system-template-configure"><div class="system-template-configure-visual"><FilePdf size={30} /><span>{template.page_count}p</span></div><div><strong>Configure diretamente sobre o PDF</strong><p>Nomeie somente os campos úteis, marque os atributos numéricos e escolha quais entram nas rolagens. Os {partition.unmapped.length} campos automáticos ainda não mapeados ficam ocultos.</p><button type="button" class="btn-primary" onClick={configure}><SlidersHorizontal size={18} /> Configurar modelo</button></div></div>
      <div class="system-overview-stats"><div><strong>{partition.mapped.length}</strong><span>campos mapeados</span></div><div><strong>{manifest.rolls.length}</strong><span>rolagens ativas</span></div><div><DiceFive size={20} /><span>Valor 2 → 2 dados</span></div></div>
      <footer class="system-footer"><span>O modelo será usado ao montar novas fichas.</span><label class="btn-ghost system-import"><UploadSimple size={16} /> Trocar PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadTemplate((event.target as HTMLInputElement).files?.[0])} /></label></footer>
    </> : <div class="system-loading"><span /><span /><span /></div>}
    {status && <p class="system-status neutral" role="status">{status}</p>}
  </section>;
}
