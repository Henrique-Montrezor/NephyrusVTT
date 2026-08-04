"""Roteador WebSocket: endpoint /ws e loop de mensagens.

Responsável apenas por:
  1. Registrar a conexão (via ConnectionManager);
  2. Validar o envelope `{type, payload}`;
  3. Despachar para o handler correspondente;
  4. Tratar a desconexão.

Nenhuma regra de negócio vive aqui.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.network import handlers
from backend.network.connection_manager import manager

logger = logging.getLogger("neferus.ws")

router = APIRouter()


def _is_valid_envelope(data: object) -> bool:
    """Um envelope válido é um dict com um campo `type` string."""
    return isinstance(data, dict) and isinstance(data.get("type"), str)


async def _broadcast_presence(campaign_id: str) -> None:
    """Envia a lista atual de usuários conectados a toda a sala."""
    await manager.broadcast(
        campaign_id,
        {"type": "presence:list", "payload": {"users": manager.roster(campaign_id)}},
    )


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    campaign_id: str = Query(default="lobby"),
    user_id: str | None = Query(default=None),
    is_gm: bool = Query(default=False),
) -> None:
    """Ponto de entrada dos clientes em tempo real.

    A autenticação real (JWT/convite) será validada aqui em fase futura;
    por ora os parâmetros de query definem sala e identidade.
    """
    client = await manager.connect(
        websocket,
        campaign_id=campaign_id,
        user_id=user_id,
        is_gm=is_gm,
    )
    await _broadcast_presence(campaign_id)

    try:
        while True:
            data = await websocket.receive_json()

            if not _is_valid_envelope(data):
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "payload": {"reason": "invalid_envelope"},
                    },
                )
                continue

            message_type = data["type"]
            payload = data.get("payload") or {}

            handler = handlers.get_handler(message_type)
            if handler is None:
                await manager.send_personal(
                    websocket,
                    {
                        "type": "error",
                        "payload": {"reason": "unknown_type", "type": message_type},
                    },
                )
                continue

            await handler(client, payload)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await _broadcast_presence(campaign_id)
    except Exception:  # falha inesperada: encerra a conexão com segurança
        logger.exception("Erro no loop WebSocket; encerrando conexão.")
        manager.disconnect(websocket)
        await _broadcast_presence(campaign_id)
