"""Handlers da biblioteca: compartilhamento direcionado de itens.

O GM pode enviar um arquivo (asset) ou uma página para um jogador específico
(ou para todos). O item chega em tempo real e o cliente abre no visualizador.
"""

from __future__ import annotations

import logging

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register

logger = logging.getLogger("neferus.handlers.library")


@register("library:share")
async def handle_library_share(client: Client, payload: dict) -> None:
    """GM compartilha um item da biblioteca com um jogador (ou todos)."""
    if not client.is_gm:
        return
    target = str(payload.get("to", "")).strip()
    item = payload.get("item")
    if not target or not isinstance(item, dict):
        return

    message = {
        "type": "library:share",
        "payload": {"from": client.user_id, "item": item},
    }
    if target in ("*", "all"):
        await manager.broadcast(client.campaign_id, message, exclude=client.websocket)
    else:
        await manager.send_to_user(client.campaign_id, target, message)
