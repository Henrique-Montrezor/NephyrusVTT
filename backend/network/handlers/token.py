"""Handlers de tokens (movimento, adição, remoção).

Persistem via scene_service e sincronizam via broadcast. Tokens ocultos só
são transmitidos para sockets do GM.
"""

from __future__ import annotations

import logging

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.schemas.scene import TokenAddIn, TokenPlaceIn, TokenUpdateIn
from backend.services import scene_service

logger = logging.getLogger("neferus.handlers.token")


async def _broadcast_token(client: Client, msg_type: str, token: dict) -> None:
    """Envia atualização de token só para quem vê a cena, respeitando visibilidade."""
    await manager.broadcast_scene(
        client.campaign_id,
        token.get("scene_id"),
        {"type": msg_type, "payload": token},
        gm_only=scene_service.token_hidden_for_players(token),
    )


async def _send_catalog_update(client: Client, token_id: int) -> None:
    token = scene_service.get_campaign_token(client.campaign_id, token_id)
    if token is None:
        return
    message = {"type": "token:catalog_update", "payload": token.model_dump()}
    await manager.broadcast(client.campaign_id, message, gm_only=True)
    if token.owner_id:
        await manager.send_to_user(client.campaign_id, token.owner_id, message)


@register("token:update")
async def handle_token_update(client: Client, payload: dict) -> None:
    """Atualiza nome/tamanho/camada de um token (dono ou GM)."""
    token_id = int(payload.get("token_id", 0))
    if not scene_service.token_belongs_to_campaign(token_id, client.campaign_id):
        return
    token = scene_service.update_token(
        TokenUpdateIn.model_validate(payload),
        user_id=client.user_id,
        is_gm=client.is_gm,
    )
    if token is None:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "update_denied"}},
        )
        return
    td = token.model_dump()
    # Se a camada mudou, a audiência pode mudar (ex.: virou camada GM):
    # remove de todos e re-adiciona conforme a visibilidade atual.
    if payload.get("layer") is not None:
        gm_only = scene_service.token_hidden_for_players(td)
        await manager.broadcast_scene(
            client.campaign_id,
            td.get("scene_id"),
            {"type": "token:remove", "payload": {"token_id": td["id"]}},
        )
        await manager.broadcast_scene(
            client.campaign_id,
            td.get("scene_id"),
            {"type": "token:add", "payload": td},
            gm_only=gm_only,
        )
        await _send_catalog_update(client, token_id)
        return
    await _broadcast_token(client, "token:update", td)
    await _send_catalog_update(client, token_id)


@register("token:move")
async def handle_token_move(client: Client, payload: dict) -> None:
    token_id = int(payload.get("token_id", 0))
    if not scene_service.token_belongs_to_campaign(token_id, client.campaign_id):
        return
    token = scene_service.move_token(
        token_id=token_id,
        x=float(payload.get("x", 0)),
        y=float(payload.get("y", 0)),
        user_id=client.user_id,
        is_gm=client.is_gm,
    )
    if token is None:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "move_denied"}},
        )
        return
    await _broadcast_token(client, "token:move", token.model_dump())


@register("token:place")
async def handle_token_place(client: Client, payload: dict) -> None:
    data = TokenPlaceIn.model_validate(payload)
    placed = scene_service.place_token(
        client.campaign_id,
        data,
        member_id=client.user_id or "",
        is_gm=client.is_gm,
    )
    if placed is None:
        await manager.send_personal(
            client.websocket,
            {
                "type": "error",
                "payload": {
                    "reason": "place_denied",
                    "message": "Este token não pode ser colocado nesta cena.",
                },
            },
        )
        return
    previous_scene_id, token = placed
    td = token.model_dump()
    if previous_scene_id is not None and previous_scene_id != token.scene_id:
        await manager.broadcast_scene(
            client.campaign_id,
            previous_scene_id,
            {"type": "token:remove", "payload": {"token_id": token.id}},
        )
    await _broadcast_token(client, "token:add", td)
    await _send_catalog_update(client, token.id)


@register("token:add")
async def handle_token_add(client: Client, payload: dict) -> None:
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    scene_id = int(payload.get("scene_id", 0))
    if not scene_service.scene_belongs_to_campaign(scene_id, client.campaign_id):
        return
    data = TokenAddIn.model_validate(payload.get("token", {}))
    token = scene_service.add_token(scene_id, data)
    if token is None:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "scene_not_found"}},
        )
        return
    await _broadcast_token(client, "token:add", token.model_dump())


@register("token:remove")
async def handle_token_remove(client: Client, payload: dict) -> None:
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    token_id = int(payload.get("token_id", 0))
    if not scene_service.token_belongs_to_campaign(token_id, client.campaign_id):
        return
    scene_id = scene_service.remove_token(token_id)
    if scene_id is not None:
        await manager.broadcast_scene(
            client.campaign_id,
            scene_id,
            {"type": "token:remove", "payload": {"token_id": token_id}},
        )
        await _send_catalog_update(client, token_id)
