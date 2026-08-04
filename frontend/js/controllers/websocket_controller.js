/**
 * WebSocketController — camada de rede do cliente (Controller no MVC).
 *
 * Responsabilidades:
 *   - Abrir/fechar a conexão WebSocket com o Host;
 *   - Reconectar automaticamente com backoff exponencial;
 *   - Enviar mensagens no envelope { type, payload };
 *   - Rotear mensagens recebidas para callbacks registrados por tipo;
 *   - Manter o heartbeat (ping/pong) para detectar quedas.
 *
 * As Views e demais Controllers interagem apenas por meio de
 * `send(type, payload)` e `on(type, callback)` — sem conhecer detalhes
 * do transporte.
 */
import { MESSAGE_TYPES } from "../network/message_types.js";

export class WebSocketController {
  /**
   * @param {object} [options]
   * @param {string} [options.url] URL do WebSocket. Se omitida, é derivada da página.
   * @param {number} [options.heartbeatInterval] Intervalo do ping em ms.
   * @param {number} [options.maxReconnectDelay] Teto do backoff em ms.
   */
  constructor(options = {}) {
    this.url = options.url || this._defaultUrl();
    this.heartbeatInterval = options.heartbeatInterval ?? 25000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 15000;

    /** @type {WebSocket|null} */
    this.socket = null;
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    this._reconnectAttempts = 0;
    this._heartbeatTimer = null;
    this._shouldReconnect = true;
    this._isConnected = false;
  }

  /** Deriva ws://host/ws (ou wss:// em HTTPS) a partir da página atual. */
  _defaultUrl(params = {}) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams(params).toString();
    const suffix = query ? `?${query}` : "";
    return `${proto}://${window.location.host}/ws${suffix}`;
  }

  /** Inicia a conexão. `params` vira query string (campaign_id, user_id, is_gm). */
  connect(params = {}) {
    this._shouldReconnect = true;
    if (Object.keys(params).length > 0) {
      this.url = this._defaultUrl(params);
    }
    this._open();
  }

  _open() {
    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[WS] Falha ao criar socket:", err);
      this._scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => this._onOpen());
    this.socket.addEventListener("message", (ev) => this._onMessage(ev));
    this.socket.addEventListener("close", () => this._onClose());
    this.socket.addEventListener("error", (ev) => this._onError(ev));
  }

  _onOpen() {
    this._isConnected = true;
    this._reconnectAttempts = 0;
    console.info("[WS] Conectado ao Host.");
    this._startHeartbeat();
    this._emit("open", {});
  }

  _onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn("[WS] Mensagem não-JSON ignorada.");
      return;
    }
    if (!data || typeof data.type !== "string") {
      console.warn("[WS] Envelope inválido ignorado.", data);
      return;
    }
    this._emit(data.type, data.payload ?? {});
  }

  _onClose() {
    this._isConnected = false;
    this._stopHeartbeat();
    this._emit("close", {});
    if (this._shouldReconnect) {
      this._scheduleReconnect();
    }
  }

  _onError(event) {
    console.error("[WS] Erro de socket.", event);
    // O evento 'close' costuma seguir; a reconexão é tratada lá.
  }

  _scheduleReconnect() {
    this._reconnectAttempts += 1;
    const delay = Math.min(
      this.maxReconnectDelay,
      1000 * 2 ** (this._reconnectAttempts - 1),
    );
    console.info(`[WS] Reconectando em ${delay}ms (tentativa ${this._reconnectAttempts}).`);
    setTimeout(() => {
      if (this._shouldReconnect) this._open();
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this.send(MESSAGE_TYPES.PING, { ts: Date.now() });
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Envia uma mensagem no envelope { type, payload }.
   * @returns {boolean} true se enviado; false se o socket não estava aberto.
   */
  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Socket fechado; mensagem '${type}' descartada.`);
      return false;
    }
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  /** Registra um callback para um tipo de mensagem. Retorna função de unsubscribe. */
  on(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
    return () => this.off(type, callback);
  }

  /** Remove um callback previamente registrado. */
  off(type, callback) {
    this._listeners.get(type)?.delete(callback);
  }

  _emit(type, payload) {
    const callbacks = this._listeners.get(type);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[WS] Erro no listener de '${type}':`, err);
      }
    }
  }

  /** Encerra a conexão e desativa a reconexão automática. */
  disconnect() {
    this._shouldReconnect = false;
    this._stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this._isConnected = false;
  }

  get isConnected() {
    return this._isConnected;
  }
}
