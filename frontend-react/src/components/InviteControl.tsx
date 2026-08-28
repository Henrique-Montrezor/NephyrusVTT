import { useState } from "preact/hooks";
import { identity } from "@/state/identity";

export function InviteControl() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const id = identity.value;

  const requestCode = async (rotate = false) => {
    setError("");
    const response = await fetch(`/api/campaigns/${encodeURIComponent(id.campaignId)}/invite${rotate ? "/rotate" : ""}`, {
      method: rotate ? "POST" : "GET",
      headers: { Authorization: `Bearer ${id.accessToken}` },
    });
    const payload = await response.json().catch(() => ({})) as { invite_code?: string; detail?: string };
    if (!response.ok || !payload.invite_code) {
      setError(payload.detail || "Não foi possível carregar o convite.");
      return;
    }
    setCode(payload.invite_code);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !code) void requestCode();
  };

  const copy = async () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("invite", code);
    const text = url.toString();
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(`Copie este link: ${text}`);
    }
  };

  return (
    <div class="invite-control">
      <button type="button" class="topbar-action" aria-expanded={open} onClick={toggle}>Convidar</button>
      {open && (
        <div class="invite-popover">
          <strong>Convite da mesa</strong>
          <p>Compartilhe o link. Renovar invalida o código anterior.</p>
          {error ? <div class="session-error" role="alert">{error}</div> : (
            <div class="invite-code">{code || "Carregando..."}</div>
          )}
          <div class="invite-actions">
            <button type="button" class="btn-primary" disabled={!code} onClick={() => void copy()}>{copied ? "Copiado" : "Copiar link"}</button>
            <button type="button" class="btn-ghost" onClick={() => void requestCode(true)}>Renovar</button>
          </div>
        </div>
      )}
    </div>
  );
}
