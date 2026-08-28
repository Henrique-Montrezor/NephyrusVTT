/** Sessão local validada pelo host. A URL nunca define permissões. */
import { signal } from "@preact/signals";
import type { Identity } from "@/net/types";

const SESSION_KEY = "nephyrus:session";

export type AuthState = "checking" | "guest" | "ready";

const EMPTY_IDENTITY: Identity = {
  campaignId: "",
  campaignName: "",
  userId: "",
  displayName: "",
  isGm: false,
  accessToken: "",
};

function savedIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Identity>;
    if (!value.accessToken || !value.campaignId || !value.userId) return null;
    return { ...EMPTY_IDENTITY, ...value };
  } catch {
    return null;
  }
}

const saved = savedIdentity();
export const identity = signal<Identity>(saved ?? EMPTY_IDENTITY);
export const authState = signal<AuthState>(saved ? "checking" : "guest");

export function setIdentity(next: Identity): void {
  identity.value = next;
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  authState.value = "ready";
}

export function clearIdentity(): void {
  localStorage.removeItem(SESSION_KEY);
  identity.value = EMPTY_IDENTITY;
  authState.value = "guest";
}

export async function validateSavedIdentity(): Promise<void> {
  const current = identity.value;
  if (!current.accessToken) {
    authState.value = "guest";
    return;
  }
  try {
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${current.accessToken}` },
    });
    if (!response.ok) throw new Error("invalid session");
    const remote = await response.json() as {
      campaign_id: string;
      campaign_name: string;
      member_id: string;
      display_name: string;
      is_gm: boolean;
    };
    setIdentity({
      campaignId: remote.campaign_id,
      campaignName: remote.campaign_name,
      userId: remote.member_id,
      displayName: remote.display_name,
      isGm: remote.is_gm,
      accessToken: current.accessToken,
    });
  } catch {
    clearIdentity();
  }
}

export function inviteFromUrl(): string {
  return new URLSearchParams(window.location.search).get("invite")?.trim().toUpperCase() ?? "";
}
