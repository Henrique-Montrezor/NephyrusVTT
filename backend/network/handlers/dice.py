"""Handler de rolagem de dados 3D.

Qualquer cliente pode rolar. O servidor calcula o resultado (autoritativo) e
transmite `dice:result` para toda a sala, para que todos vejam a mesma rolagem.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.schemas.dice import DiceRollIn
from backend.services import dice_service
from backend.services.dice_service import DiceError

logger = logging.getLogger("neferus.handlers.dice")


@register("dice:roll")
async def handle_dice_roll(client: Client, payload: dict) -> None:
    try:
        data = DiceRollIn.model_validate(payload)
        result = dice_service.parse_and_roll(data)
    except (DiceError, ValidationError) as exc:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "dice_invalid", "detail": str(exc)}},
        )
        return

    out = result.model_dump()
    out["roller_id"] = client.user_id
    out["roller"] = client.display_name or client.user_id
    out["is_gm"] = client.is_gm
    await manager.broadcast(
        client.campaign_id,
        {"type": "dice:result", "payload": out},
    )
