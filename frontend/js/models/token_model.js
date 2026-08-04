/**
 * TokenModel — estado local de um token (espelha o TokenOut do backend).
 */
export class TokenModel {
  constructor(data) {
    this.id = data.id;
    this.name = data.name ?? "Token";
    this.imageUrl = data.image_url ?? null;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
    this.sizeSquares = data.size_squares ?? 1;
    this.width = data.width ?? null;
    this.height = data.height ?? null;
    this.layer = data.layer ?? "object";
    this.ownerId = data.owner_id ?? null;
    this.isHidden = Boolean(data.is_hidden);
    this.isLocked = Boolean(data.is_locked);
    this.lightRadius = data.light_radius ?? 0;
    this.conditions = Array.isArray(data.conditions) ? data.conditions : [];
  }

  /** Atualiza os campos a partir de um payload do servidor. */
  update(data) {
    if (data.x !== undefined) this.x = data.x;
    if (data.y !== undefined) this.y = data.y;
    if (data.name !== undefined) this.name = data.name;
    if (data.image_url !== undefined) this.imageUrl = data.image_url;
    if (data.size_squares !== undefined) this.sizeSquares = data.size_squares;
    if (data.width !== undefined) this.width = data.width;
    if (data.height !== undefined) this.height = data.height;
    if (data.layer !== undefined) this.layer = data.layer;
    if (data.owner_id !== undefined) this.ownerId = data.owner_id;
    if (data.is_hidden !== undefined) this.isHidden = Boolean(data.is_hidden);
    if (data.is_locked !== undefined) this.isLocked = Boolean(data.is_locked);
    if (data.light_radius !== undefined) this.lightRadius = data.light_radius;
    if (data.conditions !== undefined) {
      this.conditions = Array.isArray(data.conditions) ? data.conditions : [];
    }
    return this;
  }
}
