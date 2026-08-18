/**
 * Clientes REST (/api). Portados de asset_controller.js e page_controller.js.
 * O `is_gm` vai como query (provisório até o auth JWT).
 */
import type { Identity } from "./types";

export type AssetKind = "map" | "token" | "pdf" | "audio" | "doc";

export interface AssetOut {
  id: number;
  campaign_id: string;
  kind: AssetKind;
  filename: string;
  original_name: string;
  url: string;
  mime: string;
  size: number;
  folder: string;
  created_at: string;
}

export interface PageOut {
  id: number;
  campaign_id: string;
  title: string;
  content: string;
  folder: string;
  created_at: string;
  updated_at: string;
}

async function readError(res: Response, fallback: string): Promise<never> {
  const detail = (await res.json().catch(() => ({}))) as { detail?: string };
  throw new Error(detail.detail || `${fallback} (${res.status})`);
}

export class AssetClient {
  private readonly base: string;
  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/assets`;
  }

  async list(kind: AssetKind | null = null): Promise<AssetOut[]> {
    const url = kind ? `${this.base}?kind=${encodeURIComponent(kind)}` : this.base;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao listar assets (${res.status})`);
    return res.json();
  }

  async upload(kind: AssetKind, file: File, folder = ""): Promise<AssetOut> {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    if (folder) fd.append("folder", folder);
    const res = await fetch(`${this.base}?is_gm=${this.identity.isGm}`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return readError(res, "Falha no upload");
    return res.json();
  }

  async remove(assetId: number): Promise<unknown> {
    const res = await fetch(`/api/assets/${assetId}?is_gm=${this.identity.isGm}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Falha ao remover (${res.status})`);
    return res.json();
  }

  async update(
    assetId: number,
    patch: { original_name?: string; folder?: string },
  ): Promise<AssetOut> {
    const res = await fetch(`/api/assets/${assetId}?is_gm=${this.identity.isGm}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch || {}),
    });
    if (!res.ok) return readError(res, "Falha ao atualizar");
    return res.json();
  }
}

export class PageClient {
  private readonly base: string;
  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/pages`;
  }

  async list(): Promise<PageOut[]> {
    const res = await fetch(this.base);
    if (!res.ok) throw new Error(`Falha ao listar páginas (${res.status})`);
    return res.json();
  }

  async get(pageId: number): Promise<PageOut> {
    const res = await fetch(`/api/pages/${pageId}`);
    if (!res.ok) throw new Error(`Falha ao obter página (${res.status})`);
    return res.json();
  }

  async create(data: { title?: string; content?: string; folder?: string } = {}): Promise<PageOut> {
    const res = await fetch(`${this.base}?is_gm=${this.identity.isGm}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return readError(res, "Falha ao criar página");
    return res.json();
  }

  async update(
    pageId: number,
    patch: { title?: string; content?: string; folder?: string } = {},
  ): Promise<PageOut> {
    const res = await fetch(`/api/pages/${pageId}?is_gm=${this.identity.isGm}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return readError(res, "Falha ao salvar página");
    return res.json();
  }

  async remove(pageId: number): Promise<unknown> {
    const res = await fetch(`/api/pages/${pageId}?is_gm=${this.identity.isGm}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Falha ao remover página (${res.status})`);
    return res.json();
  }
}
