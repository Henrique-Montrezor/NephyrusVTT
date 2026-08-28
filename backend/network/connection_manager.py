"""Gerenciador de conexões WebSocket.

Mantém o registro de todos os clientes conectados, agrupados por sala
(campaign_id). Isola completamente a mecânica de sockets da lógica de
negócio — handlers apenas pedem "envie isto para a sala X".
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger("neferus.network")


@dataclass(eq=False)
class Client:
    """Representa um socket conectado e seus metadados de sessão.

    `eq=False` mantém o hashing por identidade, permitindo uso em `set`.
    """

    websocket: WebSocket
    campaign_id: str
    user_id: str | None = None
    display_name: str | None = None
    is_gm: bool = False
    # Cena que este cliente está visualizando (para broadcasts por cena).
    scene_id: int | None = None


@dataclass
class ConnectionManager:
    """Registra conexões e envia mensagens (unicast / broadcast por sala)."""

    # campaign_id -> conjunto de clientes daquela mesa
    rooms: dict[str, set[Client]] = field(default_factory=lambda: defaultdict(set))
    # websocket -> Client, para lookup rápido na desconexão
    _by_socket: dict[WebSocket, Client] = field(default_factory=dict)

    async def connect(
        self,
        websocket: WebSocket,
        campaign_id: str,
        user_id: str | None = None,
        display_name: str | None = None,
        is_gm: bool = False,
    ) -> Client:
        """Aceita o handshake e registra o cliente na sala informada."""
        await websocket.accept()
        client = Client(
            websocket=websocket,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name=display_name,
            is_gm=is_gm,
        )
        self.rooms[campaign_id].add(client)
        self._by_socket[websocket] = client
        logger.info(
            "Cliente conectado (campaign=%s, user=%s, gm=%s). Total na sala: %d",
            campaign_id,
            user_id,
            is_gm,
            len(self.rooms[campaign_id]),
        )
        return client

    def disconnect(self, websocket: WebSocket) -> Client | None:
        """Remove o cliente dos registros. Retorna o Client removido, se houver."""
        client = self._by_socket.pop(websocket, None)
        if client is None:
            return None
        room = self.rooms.get(client.campaign_id)
        if room is not None:
            room.discard(client)
            if not room:
                self.rooms.pop(client.campaign_id, None)
        logger.info(
            "Cliente desconectado (campaign=%s, user=%s).",
            client.campaign_id,
            client.user_id,
        )
        return client

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        """Envia uma mensagem a um único socket."""
        await websocket.send_json(message)

    async def send_to_user(
        self, campaign_id: str, user_id: str, message: dict
    ) -> int:
        """Envia a mensagem a todas as sessões de um usuário na sala.

        Retorna quantos sockets receberam. Sockets mortos são removidos.
        """
        sent = 0
        stale: list[WebSocket] = []
        for client in list(self.rooms.get(campaign_id, set())):
            if client.user_id != user_id:
                continue
            try:
                await client.websocket.send_json(message)
                sent += 1
            except Exception:
                stale.append(client.websocket)
        for ws in stale:
            self.disconnect(ws)
        return sent

    def roster(self, campaign_id: str) -> list[dict]:
        """Lista os usuários conectados na sala (deduplicados por user_id)."""
        seen: dict[str, bool] = {}
        for client in self.rooms.get(campaign_id, set()):
            uid = client.user_id or "?"
            # Mantém o registro; se qualquer sessão for GM, marca como GM.
            seen[uid] = seen.get(uid, False) or client.is_gm
        names: dict[str, str] = {}
        for client in self.rooms.get(campaign_id, set()):
            uid = client.user_id or "?"
            names[uid] = client.display_name or uid
        return [
            {"user_id": uid, "display_name": names.get(uid, uid), "is_gm": is_gm}
            for uid, is_gm in seen.items()
        ]

    async def broadcast(
        self,
        campaign_id: str,
        message: dict,
        exclude: WebSocket | None = None,
        gm_only: bool = False,
    ) -> None:
        """Envia uma mensagem a todos os clientes de uma sala.

        `exclude` permite não reenviar ao autor da mensagem.
        `gm_only=True` restringe o envio apenas aos sockets do GM (usado para
        dados de tokens ocultos, que não devem vazar para jogadores).
        Sockets que falharem no envio são removidos automaticamente.
        """
        stale: list[WebSocket] = []
        for client in list(self.rooms.get(campaign_id, set())):
            if client.websocket is exclude:
                continue
            if gm_only and not client.is_gm:
                continue
            try:
                await client.websocket.send_json(message)
            except Exception:  # socket morto/fechado
                logger.warning("Falha ao enviar; removendo socket morto.")
                stale.append(client.websocket)
        for ws in stale:
            self.disconnect(ws)

    async def broadcast_scene(
        self,
        campaign_id: str,
        scene_id: int | None,
        message: dict,
        exclude: WebSocket | None = None,
        gm_only: bool = False,
    ) -> None:
        """Envia apenas aos clientes que estão visualizando `scene_id`.

        Usado para tokens/névoa/grid: cada mensagem afeta só quem está na cena.
        """
        stale: list[WebSocket] = []
        for client in list(self.rooms.get(campaign_id, set())):
            if client.websocket is exclude:
                continue
            if gm_only and not client.is_gm:
                continue
            if client.scene_id != scene_id:
                continue
            try:
                await client.websocket.send_json(message)
            except Exception:
                stale.append(client.websocket)
        for ws in stale:
            self.disconnect(ws)


# Instância única compartilhada por toda a aplicação.
manager = ConnectionManager()
