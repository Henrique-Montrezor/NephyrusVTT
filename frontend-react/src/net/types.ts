/**
 * Tipos de domínio (payloads do backend). Os campos seguem o snake_case
 * enviado pelo servidor (Pydantic). Os stores locais normalizam para camelCase.
 */

export type TokenLayer = "map" | "object" | "gm";

/** Payload de token vindo do servidor (TokenOut). */
export interface TokenPayload {
  id: number;
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
}

/** Identidade do participante, derivada da URL. */
export interface Identity {
  campaignId: string;
  campaignName: string;
  userId: string;
  displayName: string;
  isGm: boolean;
  accessToken: string;
}
