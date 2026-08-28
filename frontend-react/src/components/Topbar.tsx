import { connected, connectionState, theme, toggleTheme } from "@/state/ui-store";
import { clearIdentity, identity } from "@/state/identity";
import { sceneMeta } from "@/state/game-store";
import { InviteControl } from "./InviteControl";

export function Topbar() {
  const id = identity.value;
  return (
    <header class="topbar">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L20 9 L12 22 L4 9 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M4 9 H20 M12 2 V22" stroke="currentColor" stroke-width="1" opacity=".5" />
          </svg>
        </span>
        <div class="brand-text">
          <h1>Nephyrus</h1>
          <span class="brand-sub">Virtual Tabletop</span>
        </div>
      </div>

      <div class="topbar-center">
        <span class="scene-chip">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 4 L3 6 V20 L9 18 L15 20 L21 18 V4 L15 6 L9 4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
          <span id="scene-name">{sceneMeta.value.name || id.campaignName}</span>
        </span>
      </div>

      <div class="topbar-right">
        {id.isGm && <InviteControl />}
        <button class="icon-pill" title="Alternar tema" aria-label="Alternar tema" onClick={() => toggleTheme()}>
          {theme.value === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          )}
        </button>
        <span class="role-badge" data-gm={String(id.isGm)} title={id.isGm ? "Perfil do mestre" : `Jogador ${id.userId}`}>
          {id.isGm ? "Mestre" : id.displayName}
        </span>
        <span class="status" data-connected={String(connected.value)} data-state={connectionState.value} role="status">
          <span class="dot" aria-hidden="true" /> <span class="status-label">{
            connectionState.value === "online"
              ? "Online"
              : connectionState.value === "reconnecting"
                ? "Reconectando"
                : connectionState.value === "connecting"
                  ? "Conectando"
                  : "Offline"
          }</span>
        </span>
        <button
          type="button"
          class="topbar-action topbar-exit"
          onClick={() => {
            clearIdentity();
            window.location.reload();
          }}
        >
          Sair
        </button>
      </div>
    </header>
  );
}
