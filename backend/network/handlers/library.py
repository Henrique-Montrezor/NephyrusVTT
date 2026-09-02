"""Handlers da biblioteca: compartilhamento direcionado de itens.

O GM pode enviar um arquivo (asset) ou uma página para um jogador específico
(ou para todos). O item chega em tempo real e o cliente abre no visualizador.
"""

from __future__ import annotations

import logging

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.services import asset_service

logger = logging.getLogger("neferus.handlers.library")


@register("library:share")
async def handle_library_share(client: Client, payload: dict) -> None:
    """GM compartilha um item da biblioteca com um jogador (ou todos)."""
    if not client.is_gm:
        return
    target = str(payload.get("to", "")).strip()
    requested = payload.get("item")
    if not target or not isinstance(requested, dict):
        return

    try:
        asset_id = int(requested.get("id", 0))
    except (TypeError, ValueError):
        asset_id = 0
    asset = asset_service.get_campaign_asset(client.campaign_id, asset_id=asset_id)
    if asset is None:
        await manager.send_personal(
            client.websocket,
            {
                "type": "error",
                "payload": {
                    "reason": "asset_not_found",
                    "message": "O arquivo não pertence a esta campanha.",
                    "type": "library:share",
                },
            },
        )
        return

    # O cliente informa apenas o id. Nome, tipo e URL vêm do registro isolado.
    item = {
        "id": str(asset.id),
        "kind": asset.kind,
        "name": asset.original_name,
        "url": asset.url,
    }

    message = {
        "type": "library:share",
        "payload": {"from": client.display_name or client.user_id, "item": item},
    }
    if target in ("*", "all"):
        await manager.broadcast(client.campaign_id, message, exclude=client.websocket)
    else:
        await manager.send_to_user(client.campaign_id, target, message)
