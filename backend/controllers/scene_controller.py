"""Controller REST de cenas.

Fornece o bootstrap inicial da cena (estado completo) para o cliente carregar
antes de entrar no fluxo em tempo real via WebSocket.
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.schemas.scene import SceneOut
from backend.services import scene_service

router = APIRouter(prefix="/api", tags=["scene"])


@router.get("/campaigns/{campaign_id}/scene", response_model=SceneOut)
async def get_campaign_scene(campaign_id: str) -> SceneOut:
    """Retorna (ou cria) a cena ativa de uma campanha."""
    return scene_service.get_or_create_default_scene(campaign_id)
