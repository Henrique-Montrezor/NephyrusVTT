/**
 * AssetController — cliente REST da biblioteca de assets (Controller no MVC).
 *
 * Faz upload/listagem/remoção via /api. O `is_gm` é enviado como query
 * (provisório até o auth JWT).
 */
export class AssetController {
  /**
   * @param {object} identity { campaignId, isGm }
   */
  constructor(identity) {
    this.identity = identity;
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/assets`;
  }

  /** Lista os assets da campanha (opcionalmente filtrando por tipo). */
  async list(kind = null) {
    const url = kind ? `${this.base}?kind=${encodeURIComponent(kind)}` : this.base;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao listar assets (${res.status})`);
    return res.json();
  }

  /** Envia um arquivo. `kind`: map | token | pdf | audio. `folder`: pasta virtual. */
  async upload(kind, file, folder = "") {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    if (folder) fd.append("folder", folder);
    const res = await fetch(`${this.base}?is_gm=${this.identity.isGm}`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Falha no upload (${res.status})`);
    }
    return res.json();
  }

  /** Remove um asset por id (GM). */
  async remove(assetId) {
    const res = await fetch(`/api/assets/${assetId}?is_gm=${this.identity.isGm}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Falha ao remover (${res.status})`);
    return res.json();
  }

  /** Renomeia e/ou move um asset (GM). `patch`: { original_name?, folder? }. */
  async update(assetId, patch) {
    const res = await fetch(`/api/assets/${assetId}?is_gm=${this.identity.isGm}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch || {}),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Falha ao atualizar (${res.status})`);
    }
    return res.json();
  }
}
