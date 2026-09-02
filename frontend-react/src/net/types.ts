/**
 * Tipos de domínio (payloads do backend). Os campos seguem o snake_case
 * enviado pelo servidor (Pydantic). Os stores locais normalizam para camelCase.
 */

export type TokenLayer = "map" | "object" | "gm";

/** Payload de token vindo do servidor (TokenOut). */
export interface TokenPayload {
  id: number;
  scene_id?: number | null;
  name?: string;
  image_url?: string | null;
  x?: number;
  y?: number;
  size_squares?: number;
  width?: number | null;
  height?: number | null;
  layer?: TokenLayer;
  owner_id?: string | null;
  is_hidden?: boolean;
  is_locked?: boolean;
  light_radius?: number;
  conditions?: string[];
}

export interface TokenCatalogItem extends TokenPayload {
  campaign_id: string;
  name: string;
  scene_id: number | null;
  scene_name: string | null;
  sheet_id: string | null;
  sheet_title: string | null;
  owner_id: string | null;
  owner_name: string | null;
  image_url: string | null;
  width: number | null;
  height: number | null;
}

/** Token normalizado no cliente. */
export interface Token {
  id: number;
  name: string;
  imageUrl: string | null;
  x: number;
  y: number;
  sizeSquares: number;
  width: number | null;
  height: number | null;
  layer: TokenLayer;
  ownerId: string | null;
  isHidden: boolean;
  isLocked: boolean;
  lightRadius: number;
  conditions: string[];
}

export interface GridState {
  enabled: boolean;
  size_px: number;
  meters_per_square: number;
}

export interface FogPayload {
  enabled?: boolean;
  cells?: [number, number][];
}

export interface FogUpdatePayload {
  cells?: [number, number][];
  revealed?: boolean;
}

/** Payload de `scene:state`. */
export interface ScenePayload {
  id: number;
  campaign_id: string;
  name: string;
  background_url: string | null;
  width: number;
  height: number;
  grid: GridState;
  fog?: FogPayload;
  tokens?: TokenPayload[];
}

/** Item de `scene:list`. */
export interface SceneListItem {
  id: number;
  name: string;
  is_active: boolean;
  background_url: string | null;
  token_count: number;
  participants: SceneParticipant[];
}

export interface SceneParticipant {
  member_id: string;
  display_name: string;
  online: boolean;
}

/** Identidade autenticada, derivada do token assinado pelo servidor. */
export interface Identity {
  campaignId: string;
  campaignName: string;
  userId: string;
  displayName: string;
  isGm: boolean;
  accessToken: string;
}
