/**
 * WsClient — camada de rede do cliente.
 *
 * Abre/fecha a conexão, reconecta com backoff exponencial, envia mensagens no
 * envelope { type, payload } e roteia as recebidas para callbacks por tipo.
 * Mantém heartbeat (ping) para detectar quedas. Portado do
 * WebSocketController vanilla.
 */
import { MESSAGE_TYPES } from "./message-types";

type Listener = (payload: any) => void;

export interface WsOptions {
  url?: string;
  heartbeatInterval?: number;
  maxReconnectDelay?: number;
}

export interface WsParams {
  token?: string;
  [key: string]: string | boolean | undefined;
}

export class WsClient {
  private url: string;
  private readonly heartbeatInterval: number;
  private readonly maxReconnectDelay: number;

  private socket: WebSocket | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  private connected = false;

  constructor(options: WsOptions = {}) {
    this.url = options.url ?? this.defaultUrl();
    this.heartbeatInterval = options.heartbeatInterval ?? 25000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 15000;
  }

  /** Deriva ws://host/ws (ou wss:// em HTTPS) a partir da página atual. */
  private defaultUrl(params: WsParams = {}): string {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)] as [string, string]);
    const query = new URLSearchParams(entries).toString();
    const suffix = query ? `?${query}` : "";
    return `${proto}://${window.location.host}/ws${suffix}`;
  }

  /** Inicia a conexão. O token assinado define a identidade no servidor. */
  connect(params: WsParams = {}): void {
    this.shouldReconnect = true;
    if (Object.keys(params).length > 0) {
      this.url = this.defaultUrl(params);
    }
    this.open();
  }

  private open(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[WS] Falha ao criar socket:", err);
      this.scheduleReconnect();
      return;
    }
    this.socket.addEventListener("open", () => this.onOpen());
    this.socket.addEventListener("message", (ev) => this.onMessage(ev));
    this.socket.addEventListener("close", (event) => this.onClose(event));
    this.socket.addEventListener("error", (ev) => this.onError(ev));
  }

  private onOpen(): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    console.info("[WS] Conectado ao Host.");
    this.startHeartbeat();
    this.emit("open", {});
  }

  private onMessage(event: MessageEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(event.data as string);
    } catch {
      console.warn("[WS] Mensagem não-JSON ignorada.");
      return;
    }
    if (!data || typeof (data as any).type !== "string") {
      console.warn("[WS] Envelope inválido ignorado.", data);
      return;
    }
    const env = data as { type: string; payload?: unknown };
    this.emit(env.type, env.payload ?? {});
  }

  private onClose(event: CloseEvent): void {
    this.connected = false;
    this.stopHeartbeat();
    this.emit("close", { code: event.code, reason: event.reason });
    if (event.code === 1008) {
      this.shouldReconnect = false;
      this.emit("unauthorized", {});
      return;
    }
    if (this.shouldReconnect) this.scheduleReconnect();
  }

  private onError(event: Event): void {
    console.error("[WS] Erro de socket.", event);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.maxReconnectDelay,
      1000 * 2 ** (this.reconnectAttempts - 1),
    );
    console.info(`[WS] Reconectando em ${delay}ms (tentativa ${this.reconnectAttempts}).`);
    this.emit("reconnecting", { delay, attempt: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this.open();
    }, delay);
  }

  /** Retoma imediatamente após o navegador voltar do background ou recuperar a rede. */
  reconnectNow(): void {
    if (!this.shouldReconnect || this.connected) return;
    if (this.socket?.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket = null;
    this.emit("reconnecting", { delay: 0, attempt: this.reconnectAttempts + 1 });
    this.open();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(MESSAGE_TYPES.PING, { ts: Date.now() });
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Envia uma mensagem no envelope { type, payload }. Retorna false se fechado. */
  send(type: string, payload: unknown = {}): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Socket fechado; mensagem '${type}' descartada.`);
      return false;
    }
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  /** Registra callback para um tipo. Retorna função de unsubscribe. */
  on(type: string, callback: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(callback);
    return () => this.off(type, callback);
  }

  off(type: string, callback: Listener): void {
    this.listeners.get(type)?.delete(callback);
  }

  private emit(type: string, payload: unknown): void {
    const callbacks = this.listeners.get(type);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[WS] Erro no listener de '${type}':`, err);
      }
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
