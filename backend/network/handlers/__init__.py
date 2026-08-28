"""Registro e despacho de handlers de mensagens WebSocket.

Cada tipo de mensagem (`type` do envelope) é associado a uma função
assíncrona. Novos domínios (token, fog, dados 3D...) só precisam registrar
seus handlers aqui, sem tocar no roteador de sockets.

Assinatura de um handler:
    async def handler(client: Client, payload: dict) -> None
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from backend.network.connection_manager import Client, manager

logger = logging.getLogger("neferus.handlers")

Handler = Callable[[Client, dict], Awaitable[None]]

# type -> handler
_REGISTRY: dict[str, Handler] = {}


def register(message_type: str) -> Callable[[Handler], Handler]:
    """Decorator para registrar um handler para um tipo de mensagem."""

    def decorator(fn: Handler) -> Handler:
        _REGISTRY[message_type] = fn
        return fn

    return decorator


def get_handler(message_type: str) -> Handler | None:
    """Retorna o handler registrado para o tipo, ou None."""
    return _REGISTRY.get(message_type)


# --------------------------------------------------------------------------
# Handlers base da Fase 1 (comunicação em tempo real garantida)
# --------------------------------------------------------------------------


@register("ping")
async def handle_ping(client: Client, payload: dict) -> None:
    """Heartbeat: responde ao próprio remetente com um pong."""
    await manager.send_personal(
        client.websocket,
        {"type": "pong", "payload": {"ts": payload.get("ts")}},
    )


@register("chat")
async def handle_chat(client: Client, payload: dict) -> None:
    """Retransmite uma mensagem de chat para todos os clientes da sala."""
    text = str(payload.get("text", "")).strip()
    if not text:
        return
    await manager.broadcast(
        client.campaign_id,
        {
            "type": "chat",
            "payload": {
                "user_id": client.display_name or client.user_id,
                "is_gm": client.is_gm,
                "text": text,
            },
        },
    )


# --------------------------------------------------------------------------
# Registro dos handlers de domínio (import tardio para rodar os decorators).
# Mantido ao final para evitar dependência circular durante o import.
# --------------------------------------------------------------------------
from backend.network.handlers import board, dice, fog, library, scene, token  # noqa: E402,F401
