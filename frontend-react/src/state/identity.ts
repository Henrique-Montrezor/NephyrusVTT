/**
 * Identidade do participante, derivada da query string da URL
 * (?campaign_id&user_id&is_gm). Espelha o wiring feito no main.js vanilla.
 */
import { signal } from "@preact/signals";
import type { Identity } from "@/net/types";

function parseIdentity(): Identity {
  const q = new URLSearchParams(window.location.search);
  const campaignId = q.get("campaign_id") || "lobby";
  const userId = q.get("user_id") || `anon-${Math.random().toString(36).slice(2, 8)}`;
  const isGm = q.get("is_gm") === "true" || q.get("is_gm") === "1";
  return { campaignId, userId, isGm };
}

export const identity = signal<Identity>(parseIdentity());
