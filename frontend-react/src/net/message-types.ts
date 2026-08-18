/**
 * Tipos de mensagem do protocolo WebSocket (envelope { type, payload }).
 *
 * Contrato compartilhado entre cliente e servidor. Mantenha em sincronia com
 * os handlers do backend (backend/network/handlers).
 */
export const MESSAGE_TYPES = {
  // Sistema / conexão
  PING: "ping",
  PONG: "pong",
  ERROR: "error",

  // Chat
  CHAT: "chat",

  // Presença
  PRESENCE_LIST: "presence:list",

  // Mesa 2D / cena
  SCENE_REQUEST: "scene:request",
  SCENE_STATE: "scene:state",
  GRID_UPDATE: "grid:update",
  SCENE_BACKGROUND: "scene:background",
  SCENE_RESIZE: "scene:resize",
  SCENE_LIST: "scene:list",
  SCENE_CREATE: "scene:create",
  SCENE_RENAME: "scene:rename",
  SCENE_ACTIVATE: "scene:activate",
  SCENE_DELETE: "scene:delete",

  // Tokens
  TOKEN_MOVE: "token:move",
  TOKEN_ADD: "token:add",
  TOKEN_REMOVE: "token:remove",
  TOKEN_VISIBILITY: "token:visibility",
  TOKEN_UPDATE: "token:update",

  // Assets (áudio/pdf)
  AUDIO_PLAY: "audio:play",
  AUDIO_STOP: "audio:stop",
  PDF_SHARE: "pdf:share",

  // Biblioteca (compartilhamento direcionado)
  LIBRARY_SHARE: "library:share",

  // Névoa de Guerra
  FOG_TOGGLE: "fog:toggle",
  FOG_REVEAL: "fog:reveal",
  FOG_RESET: "fog:reset",
  FOG_STATE: "fog:state",
  FOG_UPDATE: "fog:update",

  // Quadro colaborativo (desenho, texto, magia, turnos)
  BOARD_REQUEST: "board:request",
  BOARD_STATE: "board:state",
  DRAW_STROKE: "draw:stroke",
  DRAW_CLEAR: "draw:clear",
  TEXT_ADD: "text:add",
  TEXT_REMOVE: "text:remove",
  TEMPLATE_ADD: "template:add",
  TEMPLATE_MOVE: "template:move",
  TEMPLATE_REMOVE: "template:remove",
  TEMPLATE_CLEAR: "template:clear",
  TURN_STATE: "turn:state",
  TURN_SET: "turn:set",

  // Camadas / próximas fases
  LAYER_UPDATE: "layer:update",
  DICE_ROLL: "dice:roll",
  DICE_RESULT: "dice:result",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

/** Envelope trafegado no WebSocket. */
export interface WsEnvelope<T = unknown> {
  type: string;
  payload: T;
}
