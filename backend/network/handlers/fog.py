"""Handlers da Névoa de Guerra (Fog of War) — todos exclusivos do Mestre.

- fog:toggle → ativa/desativa a névoa; reenvia o estado completo.
- fog:reveal → pincel (revela/oculta células); broadcast incremental.
- fog:reset  → revela tudo ou oculta tudo; reenvia o estado completo.

A névoa não é secreta em si (jogadores precisam saber o que está revelado para
esconder o resto), então os broadcasts vão para toda a sala.
"""

from __future__ import annotations

import logging

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.schemas.scene import FogResetIn, FogRevealIn, FogToggleIn
from backend.services import fog_service, scene_service

logger = logging.getLogger("neferus.handlers.fog")


async def _deny(client: Client) -> None:
    await manager.send_personal(
        client.websocket,
        {"type": "error", "payload": {"reason": "gm_only"}},
    )


@register("fog:toggle")
async def handle_fog_toggle(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    data = FogToggleIn.model_validate(payload)
    if not scene_service.scene_belongs_to_campaign(data.scene_id, client.campaign_id):
        return
    fog = fog_service.set_enabled(data.scene_id, data.enabled)
    if fog is None:
        return
    await manager.broadcast_scene(
        client.campaign_id,
        data.scene_id,
        {"type": "fog:state", "payload": {"scene_id": data.scene_id, **fog.model_dump()}},
    )


@register("fog:reveal")
async def handle_fog_reveal(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    data = FogRevealIn.model_validate(payload)
    if not scene_service.scene_belongs_to_campaign(data.scene_id, client.campaign_id):
        return
    changed = fog_service.reveal_cells(data.scene_id, data.cells, data.revealed)
    if not changed:
        return
    await manager.broadcast_scene(
        client.campaign_id,
        data.scene_id,
        {
            "type": "fog:update",
            "payload": {
                "scene_id": data.scene_id,
                "cells": changed,
                "revealed": data.revealed,
            },
        },
    )


@register("fog:reset")
async def handle_fog_reset(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    data = FogResetIn.model_validate(payload)
    if not scene_service.scene_belongs_to_campaign(data.scene_id, client.campaign_id):
        return
    fog = fog_service.reset(data.scene_id, data.revealed)
    if fog is None:
        return
    await manager.broadcast_scene(
        client.campaign_id,
        data.scene_id,
        {"type": "fog:state", "payload": {"scene_id": data.scene_id, **fog.model_dump()}},
    )
