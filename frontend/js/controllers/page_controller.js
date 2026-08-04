/**
 * PageController — cliente REST das páginas (diário/notas) da campanha.
 *
 * Páginas são criadas e editadas dentro do app (conteúdo no banco), ao
 * contrário dos assets (arquivos em disco). O `is_gm` vai como query.
 */
export class PageController {
  /**
   * @param {object} identity { campaignId, isGm }
   */
  constructor(identity) {
    this.identity = identity;
    this.base = `/api/campaigns/${encodeURIComponent(identity.campaignId)}/pages`;
  }

  /** Lista todas as páginas da campanha. */
  async list() {
    const res = await fetch(this.base);
    if (!res.ok) throw new Error(`Falha ao listar páginas (${res.status})`);
    return res.json();
  }

  /** Obtém uma página por id. */
  async get(pageId) {
    const res = await fetch(`/api/pages/${pageId}`);
    if (!res.ok) throw new Error(`Falha ao obter página (${res.status})`);
    return res.json();
  }

  /** Cria uma página. `data`: { title?, content?, folder? }. */
  async create(data = {}) {
    const res = await fetch(`${this.base}?is_gm=${this.identity.isGm}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Falha ao criar página (${res.status})`);
    }
    return res.json();
  }

  /** Atualiza uma página. `patch`: { title?, content?, folder? }. */
  async update(pageId, patch = {}) {
    const res = await fetch(`/api/pages/${pageId}?is_gm=${this.identity.isGm}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Falha ao salvar página (${res.status})`);
    }
    return res.json();
  }

  /** Remove uma página por id. */
  async remove(pageId) {
    const res = await fetch(`/api/pages/${pageId}?is_gm=${this.identity.isGm}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Falha ao remover página (${res.status})`);
    return res.json();
  }
}
