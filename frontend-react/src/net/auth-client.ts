import type { Identity } from "./types";

interface AuthResponse {
  access_token: string;
  invite_code?: string | null;
  identity: {
    campaign_id: string;
    campaign_name: string;
    member_id: string;
    display_name: string;
    is_gm: boolean;
  };
}

export interface AuthResult {
  identity: Identity;
  inviteCode: string | null;
}

async function request(path: string, body: Record<string, string>): Promise<AuthResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Partial<AuthResponse> & { detail?: string };
  if (!response.ok || !payload.identity || !payload.access_token) {
    throw new Error(payload.detail || "Não foi possível iniciar a sessão.");
  }
  return {
    identity: {
      campaignId: payload.identity.campaign_id,
      campaignName: payload.identity.campaign_name,
      userId: payload.identity.member_id,
      displayName: payload.identity.display_name,
      isGm: payload.identity.is_gm,
      accessToken: payload.access_token,
    },
    inviteCode: payload.invite_code ?? null,
  };
}

export function createCampaign(campaignName: string, displayName: string): Promise<AuthResult> {
  return request("/api/auth/campaigns", {
    campaign_name: campaignName,
    display_name: displayName,
  });
}

export function joinCampaign(inviteCode: string, displayName: string): Promise<AuthResult> {
  return request("/api/auth/join", {
    invite_code: inviteCode,
    display_name: displayName,
  });
}
