"""Handlers do "quadro" colaborativo: desenho, texto, magia e turnos.

Anotações (desenho/texto/templates) são colaborativas — qualquer cliente pode
criar. Limpezas globais e a ordem de turnos são exclusivas do Mestre.
"""

from __future__ import annotations

import logging
import uuid

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.services import board_service

logger = logging.getLogger("neferus.handlers.board")


def _id(payload: dict) -> str:
    return str(payload.get("id") or uuid.uuid4().hex)


async def _deny(client: Client) -> None:
    await manager.send_personal(
        client.websocket, {"type": "error", "payload": {"reason": "gm_only"}}
    )


@register("board:request")
async def handle_board_request(client: Client, payload: dict) -> None:
    board = board_service.get_board(client.campaign_id)
    await manager.send_personal(
        client.websocket, {"type": "board:state", "payload": board}
    )


# --- Desenho (caneta) ---


@register("draw:stroke")
async def handle_draw_stroke(client: Client, payload: dict) -> None:
    points = payload.get("points")
    if not isinstance(points, list) or len(points) < 2:
        return
    stroke = {
        "id": _id(payload),
        "points": points[:2000],
        "color": str(payload.get("color", "#e5484d")),
        "width": float(payload.get("width", 3)),
        "owner": client.user_id,
    }
    board_service.add_stroke(client.campaign_id, stroke)
    await manager.broadcast(client.campaign_id, {"type": "draw:stroke", "payload": stroke})


@register("draw:clear")
async def handle_draw_clear(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    board_service.clear_strokes(client.campaign_id)
    await manager.broadcast(client.campaign_id, {"type": "draw:clear", "payload": {}})


# --- Texto ---


@register("text:add")
async def handle_text_add(client: Client, payload: dict) -> None:
    content = str(payload.get("text", "")).strip()[:200]
    if not content:
        return
    text = {
        "id": _id(payload),
        "x": float(payload.get("x", 0)),
        "y": float(payload.get("y", 0)),
        "text": content,
        "color": str(payload.get("color", "#f8fafc")),
        "size": float(payload.get("size", 20)),
        "owner": client.user_id,
    }
    board_service.add_text(client.campaign_id, text)
    await manager.broadcast(client.campaign_id, {"type": "text:add", "payload": text})


@register("text:remove")
async def handle_text_remove(client: Client, payload: dict) -> None:
    text_id = str(payload.get("id", ""))
    if not text_id:
        return
    removed = board_service.remove_text(
        client.campaign_id, text_id, user_id=client.user_id, is_gm=client.is_gm
    )
    if not removed:
        await manager.send_personal(
            client.websocket,
            {
                "type": "error",
                "payload": {
                    "reason": "edit_denied",
                    "message": "Você só pode remover suas próprias anotações.",
                    "type": "text:remove",
                },
            },
        )
        return
    await manager.broadcast(
        client.campaign_id, {"type": "text:remove", "payload": {"id": text_id}}
    )


# --- Templates de magia / área de efeito ---


@register("template:add")
async def handle_template_add(client: Client, payload: dict) -> None:
    template = {
        "id": _id(payload),
        "shape": str(payload.get("shape", "circle")),
        "x": float(payload.get("x", 0)),
        "y": float(payload.get("y", 0)),
        "x2": float(payload.get("x2", 0)),
        "y2": float(payload.get("y2", 0)),
        "radius": float(payload.get("radius", 0)),
        "angle": float(payload.get("angle", 0)),
        "color": str(payload.get("color", "#8b5cf6")),
        "label": str(payload.get("label", "")),
        "owner": client.user_id,
    }
    board_service.add_template(client.campaign_id, template)
    await manager.broadcast(
        client.campaign_id, {"type": "template:add", "payload": template}
    )


@register("template:move")
async def handle_template_move(client: Client, payload: dict) -> None:
    tid = str(payload.get("id", ""))
    if not tid:
        return
    t = board_service.move_template(
        client.campaign_id,
        tid,
        float(payload.get("x", 0)),
        float(payload.get("y", 0)),
        float(payload.get("x2", 0)),
        float(payload.get("y2", 0)),
        user_id=client.user_id,
        is_gm=client.is_gm,
    )
    if t is None:
        return
    await manager.broadcast(
        client.campaign_id,
        {
            "type": "template:move",
            "payload": {
                "id": tid,
                "x": t["x"],
                "y": t["y"],
                "x2": t["x2"],
                "y2": t["y2"],
            },
        },
    )


@register("template:remove")
async def handle_template_remove(client: Client, payload: dict) -> None:
    tid = str(payload.get("id", ""))
    if not tid:
        return
    removed = board_service.remove_template(
        client.campaign_id, tid, user_id=client.user_id, is_gm=client.is_gm
    )
    if not removed:
        await manager.send_personal(
            client.websocket,
            {
                "type": "error",
                "payload": {
                    "reason": "edit_denied",
                    "message": "Você só pode remover seus próprios efeitos.",
                    "type": "template:remove",
                },
            },
        )
        return
    await manager.broadcast(
        client.campaign_id, {"type": "template:remove", "payload": {"id": tid}}
    )


@register("template:clear")
async def handle_template_clear(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    board_service.clear_templates(client.campaign_id)
    await manager.broadcast(
        client.campaign_id, {"type": "template:clear", "payload": {}}
    )


# --- Ordem de turnos ---


@register("turn:set")
async def handle_turn_set(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return await _deny(client)
    entries = payload.get("entries")
    if not isinstance(entries, list):
        entries = []
    turn = board_service.set_turn(
        client.campaign_id,
        entries[:100],
        int(payload.get("current", 0)),
        int(payload.get("round", 1)),
    )
    await manager.broadcast(client.campaign_id, {"type": "turn:state", "payload": turn})
