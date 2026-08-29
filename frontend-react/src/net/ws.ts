/**
 * Instância única do cliente WebSocket, compartilhada pela aplicação.
 * A conexão é iniciada no bootstrap (App) com a identidade da URL.
 */
import { WsClient } from "./ws-client";
import { clearIdentity, identity } from "@/state/identity";
import { connected, connectionState } from "@/state/ui-store";

export const ws = new WsClient();

let started = false;

/** Conecta uma única vez usando a identidade atual e reflete o status na UI. */
export function startWs(): void {
  if (started) return;
  started = true;
  const id = identity.value;
  ws.on("open", () => {
    connected.value = true;
    connectionState.value = "online";
  });
  ws.on("close", () => {
    connected.value = false;
    connectionState.value = "offline";
  });
  ws.on("reconnecting", () => {
    connectionState.value = "reconnecting";
  });
  ws.on("unauthorized", () => {
    clearIdentity();
    window.location.reload();
  });
  ws.connect({
    token: id.accessToken,
  });

  window.addEventListener("online", () => ws.reconnectNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ws.reconnectNow();
  });
}
