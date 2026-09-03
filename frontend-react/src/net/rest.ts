/**
 * Clientes REST (/api). Portados de asset_controller.js e page_controller.js.
 * Todas as chamadas enviam o token de acesso da sessão atual.
 */
import type { Identity, MapStagePayload, ScenePayload, TokenCatalogItem } from "./types";

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

export interface LibraryFolderOut {
  id: number;
  campaign_id: string;
  path: string;
  name: string;
  parent: string;
  created_at: string;
}

export type SheetFieldType = "text" | "number" | "checkbox" | "textarea" | "image";

export interface SheetFieldOut {
  key: string;
  label: string;
  field_type: SheetFieldType;
  page: number;
  rect: [number, number, number, number];
  public: boolean;
  source: "acroform" | "custom";
}

export interface CharacterSheetOut {
  id: string;
  campaign_id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  source_name: string;
  page_count: number;
  fields: SheetFieldOut[];
  values: Record<string, unknown>;
  token_stages: TokenStageOut[];
  created_at: string;
  updated_at: string;
}

export interface TokenStageOut {
  id: string;
  name: string;
  image_url: string;
  order: number;
}

export interface SheetOwnerOut {
  id: string;
  display_name: string;
}

export interface SheetFieldDraft {
  key: string;
  label: string;
  field_type: SheetFieldType;
  page: number;
  rect: [number, number, number, number];
  public: boolean;
}

export interface SystemRoll {
  key: string;
  label: string;
  formula: string;
}

export interface SystemManifest {
  schema_version: "nephyrus.system/v2";
  name: string;
  version: string;
  license: string;
  base_sheet_id: string | null;
  rolls: SystemRoll[];
}

export interface GameSystemOut {
  id: string;
  campaign_id: string;
  manifest: SystemManifest;
  created_at: string;
  updated_at: string;
}

export interface FormulaCheckOut {
  valid: boolean;
  normalized: string;
  references: string[];
  preview: number;
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

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.identity.accessToken}` };
  }

  async list(kind: AssetKind | null = null): Promise<AssetOut[]> {
    const url = kind ? `${this.base}?kind=${encodeURIComponent(kind)}` : this.base;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Falha ao listar assets (${res.status})`);
    return res.json();
  }

  async upload(kind: AssetKind, file: File, folder = ""): Promise<AssetOut> {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    if (folder) fd.append("folder", folder);
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers(),
      body: fd,
    });
    if (!res.ok) return readError(res, "Falha no upload");
    return res.json();
  }

  async remove(assetId: number): Promise<unknown> {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Falha ao remover (${res.status})`);
    return res.json();
  }

  async update(
    assetId: number,
    patch: { original_name?: string; folder?: string },
  ): Promise<AssetOut> {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...this.headers() },
      body: JSON.stringify(patch || {}),
    });
    if (!res.ok) return readError(res, "Falha ao atualizar");
    return res.json();
  }
}

export interface TokenCatalogDraft {
  name: string;
  image_url?: string | null;
  sheet_id?: string | null;
  owner_id?: string | null;
  width?: number | null;
  height?: number | null;
}

export class SceneClient {
  constructor(private readonly identity: Identity) {}

  async saveMapStages(sceneId: number, stages: MapStagePayload[], activeStage: number): Promise<ScenePayload> {
    const res = await fetch(`/api/scenes/${sceneId}/map-stages`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.identity.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stages, active_stage: activeStage }),
    });
    if (!res.ok) return readError(res, "Falha ao salvar estágios do mapa");
    return res.json();
  }
}

export class TokenClient {
  private readonly base: string;

  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/tokens`;
  }

  private headers(json = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.identity.accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async list(): Promise<TokenCatalogItem[]> {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao listar tokens");
    return res.json();
  }

  async create(data: TokenCatalogDraft): Promise<TokenCatalogItem> {
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) return readError(res, "Falha ao criar token");
    return res.json();
  }

  async update(id: number, patch: Partial<TokenCatalogDraft>): Promise<TokenCatalogItem> {
    const res = await fetch(`/api/tokens/${id}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return readError(res, "Falha ao salvar token");
    return res.json();
  }

  async remove(id: number): Promise<void> {
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE", headers: this.headers() });
    if (!res.ok) await readError(res, "Falha ao excluir token");
  }
}

export class PageClient {
  private readonly base: string;
  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/pages`;
  }

  private headers(json = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.identity.accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async list(): Promise<PageOut[]> {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) throw new Error(`Falha ao listar páginas (${res.status})`);
    return res.json();
  }

  async get(pageId: number): Promise<PageOut> {
    const res = await fetch(`/api/pages/${pageId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Falha ao obter página (${res.status})`);
    return res.json();
  }

  async create(data: { title?: string; content?: string; folder?: string } = {}): Promise<PageOut> {
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) return readError(res, "Falha ao criar página");
    return res.json();
  }

  async update(
    pageId: number,
    patch: { title?: string; content?: string; folder?: string } = {},
  ): Promise<PageOut> {
    const res = await fetch(`/api/pages/${pageId}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return readError(res, "Falha ao salvar página");
    return res.json();
  }

  async remove(pageId: number): Promise<unknown> {
    const res = await fetch(`/api/pages/${pageId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Falha ao remover página (${res.status})`);
    return res.json();
  }
}

export class FolderClient {
  private readonly base: string;

  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/folders`;
  }

  private headers(json = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.identity.accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async list(): Promise<LibraryFolderOut[]> {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao listar pastas");
    return res.json();
  }

  async create(name: string, parent = ""): Promise<LibraryFolderOut> {
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ name, parent }),
    });
    if (!res.ok) return readError(res, "Falha ao criar pasta");
    return res.json();
  }

  async update(
    folderId: number,
    patch: { name?: string; parent?: string },
  ): Promise<LibraryFolderOut> {
    const res = await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return readError(res, "Falha ao atualizar pasta");
    return res.json();
  }

  async remove(folderId: number): Promise<void> {
    const res = await fetch(`/api/folders/${folderId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) await readError(res, "Falha ao excluir pasta");
  }
}

export class SheetClient {
  private readonly base: string;
  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/sheets`;
  }

  private headers(json = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.identity.accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async list(): Promise<CharacterSheetOut[]> {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao listar fichas");
    return res.json();
  }

  async owners(): Promise<SheetOwnerOut[]> {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(this.identity.campaignId)}/sheet-owners`, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao listar jogadores");
    return res.json();
  }

  async upload(file: File, ownerId: string, title: string): Promise<CharacterSheetOut> {
    const body = new FormData();
    body.append("file", file);
    body.append("owner_id", ownerId);
    body.append("title", title);
    const res = await fetch(this.base, { method: "POST", headers: this.headers(), body });
    if (!res.ok) return readError(res, "Falha ao importar ficha");
    return res.json();
  }

  async createFromTemplate(ownerId: string, title: string): Promise<CharacterSheetOut> {
    const res = await fetch(`${this.base}/from-template`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ owner_id: ownerId, title }),
    });
    if (!res.ok) return readError(res, "Falha ao montar ficha pelo modelo");
    return res.json();
  }

  async saveTokenStages(sheetId: string, stages: TokenStageOut[]): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/token-stages`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({ stages }),
    });
    if (!res.ok) return readError(res, "Falha ao salvar estágios do token");
    return res.json();
  }

  async saveValues(sheetId: string, values: Record<string, unknown>): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/values`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify({ values }),
    });
    if (!res.ok) return readError(res, "Falha ao salvar ficha");
    return res.json();
  }

  async setPublic(sheetId: string, fieldKey: string, isPublic: boolean): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/fields/${encodeURIComponent(fieldKey)}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify({ public: isPublic }),
    });
    if (!res.ok) return readError(res, "Falha ao alterar visibilidade");
    return res.json();
  }

  async addField(sheetId: string, field: SheetFieldDraft): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/fields`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(field),
    });
    if (!res.ok) return readError(res, "Falha ao criar campo");
    return res.json();
  }

  async updateField(sheetId: string, fieldKey: string, patch: Partial<SheetFieldDraft>): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/fields/${encodeURIComponent(fieldKey)}`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return readError(res, "Falha ao reposicionar campo");
    return res.json();
  }

  async removeField(sheetId: string, fieldKey: string): Promise<CharacterSheetOut> {
    const res = await fetch(`/api/sheets/${sheetId}/fields/${encodeURIComponent(fieldKey)}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) return readError(res, "Falha ao remover campo");
    return res.json();
  }

  async pdfBlob(sheetId: string, exported = false): Promise<Blob> {
    const suffix = exported ? "export" : "pdf";
    const res = await fetch(`/api/sheets/${sheetId}/${suffix}`, { headers: this.headers() });
    if (!res.ok) return readError(res, exported ? "Falha ao exportar ficha" : "Falha ao abrir PDF");
    return res.blob();
  }
}

export class GameSystemClient {
  private readonly base: string;

  constructor(private readonly identity: Identity) {
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/system`;
  }

  private headers(json = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.identity.accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async get(): Promise<GameSystemOut | null> {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao carregar sistema");
    return res.json();
  }

  async save(manifest: SystemManifest): Promise<GameSystemOut> {
    const res = await fetch(this.base, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify(manifest),
    });
    if (!res.ok) return readError(res, "Falha ao salvar sistema");
    return res.json();
  }

  async check(formula: string, sheetId: string): Promise<FormulaCheckOut> {
    const res = await fetch(`${this.base}/formula-check`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ formula, sheet_id: sheetId }),
    });
    if (!res.ok) return readError(res, "Fórmula inválida");
    return res.json();
  }

  async template(): Promise<CharacterSheetOut | null> {
    const res = await fetch(`${this.base}/template`, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao carregar modelo de ficha");
    return res.json();
  }

  async uploadTemplate(file: File): Promise<CharacterSheetOut> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${this.base}/template`, { method: "POST", headers: this.headers(), body });
    if (!res.ok) return readError(res, "Falha ao importar modelo de ficha");
    return res.json();
  }

  async exampleTemplate(): Promise<CharacterSheetOut> {
    const res = await fetch(`${this.base}/template/example`, { method: "POST", headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao criar modelo de exemplo");
    return res.json();
  }

  async import(file: File): Promise<GameSystemOut> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${this.base}/import`, { method: "POST", headers: this.headers(), body });
    if (!res.ok) return readError(res, "Falha ao importar sistema");
    return res.json();
  }

  async export(): Promise<Blob> {
    const res = await fetch(`${this.base}/export`, { headers: this.headers() });
    if (!res.ok) return readError(res, "Falha ao exportar sistema");
    return res.blob();
  }
}
