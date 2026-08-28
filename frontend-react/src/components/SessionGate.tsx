import { useState } from "preact/hooks";
import { createCampaign, joinCampaign } from "@/net/auth-client";
import { inviteFromUrl, setIdentity } from "@/state/identity";

type Mode = "join" | "create";

export function SessionGate() {
  const invitation = inviteFromUrl();
  const [mode, setMode] = useState<Mode>(invitation ? "join" : "create");
  const [campaignName, setCampaignName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState(invitation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = mode === "create"
        ? await createCampaign(campaignName, displayName)
        : await joinCampaign(inviteCode, displayName);
      setIdentity(result.identity);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar na mesa.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="session-gate">
      <section class="session-intro">
        <div class="session-brand" aria-label="Nephyrus VTT">
          <span class="session-mark" aria-hidden="true">N</span>
          <strong>Nephyrus</strong>
        </div>
        <h1>Sua mesa começa aqui.</h1>
        <p>Crie uma campanha como mestre ou use o convite recebido para entrar como jogador.</p>
      </section>

      <section class="session-form-panel" aria-labelledby="session-title">
        <div class="session-switch" role="tablist" aria-label="Modo de entrada">
          <button type="button" role="tab" aria-selected={mode === "create"} class={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Criar mesa</button>
          <button type="button" role="tab" aria-selected={mode === "join"} class={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Entrar</button>
        </div>

        <form class="session-form" onSubmit={submit}>
          <div>
            <h2 id="session-title">{mode === "create" ? "Nova campanha" : "Entrar na campanha"}</h2>
            <p>{mode === "create" ? "Você será o mestre desta mesa." : "O convite define a mesa e suas permissões."}</p>
          </div>

          {mode === "create" ? (
            <label class="field">
              <span>Nome da campanha</span>
              <input autoFocus type="text" required minLength={2} maxLength={120} value={campaignName} onInput={(event) => setCampaignName((event.target as HTMLInputElement).value)} placeholder="Ex.: Arquivos da Ordem" />
            </label>
          ) : (
            <label class="field">
              <span>Código do convite</span>
              <input autoFocus type="text" required minLength={4} maxLength={20} value={inviteCode} onInput={(event) => setInviteCode((event.target as HTMLInputElement).value.toUpperCase())} placeholder="Código da mesa" autocapitalize="characters" />
            </label>
          )}

          <label class="field">
            <span>Seu nome na mesa</span>
            <input type="text" required minLength={2} maxLength={60} value={displayName} onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)} placeholder={mode === "create" ? "Nome do mestre" : "Nome do personagem ou jogador"} />
          </label>

          {error && <div class="session-error" role="alert">{error}</div>}

          <button type="submit" class="btn-primary session-submit" disabled={busy}>
            {busy ? "Conectando..." : mode === "create" ? "Criar campanha" : "Entrar na mesa"}
          </button>
        </form>
      </section>
    </main>
  );
}
