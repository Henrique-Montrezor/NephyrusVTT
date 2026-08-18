/**
 * Instância única do cliente WebSocket, compartilhada pela aplicação.
 * A conexão é iniciada no bootstrap (App) com a identidade da URL.
 */
import { WsClient } from "./ws-client";
import { identity } from "@/state/identity";
import { connected } from "@/state/ui-store";

export const ws = new WsClient();

let started = false;

/** Conecta uma única vez usando a identidade atual e reflete o status na UI. */
export function startWs(): void {
  if (started) return;
  started = true;
  const id = identity.value;
  ws.on("open", () => {
    connected.value = true;
  });
  ws.on("close", () => {
    connected.value = false;
  });
  ws.connect({
    campaign_id: id.campaignId,
    user_id: id.userId,
    is_gm: id.isGm,
  });
}
