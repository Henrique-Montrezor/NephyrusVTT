"""Controller REST de cenas.

Fornece o bootstrap inicial da cena (estado completo) para o cliente carregar
antes de entrar no fluxo em tempo real via WebSocket.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import campaign_identity, current_identity
from backend.schemas.scene import MapStagesIn, SceneOut
from backend.services import scene_service
from backend.services.auth_service import AuthIdentity

router = APIRouter(prefix="/api", tags=["scene"])


@router.get("/campaigns/{campaign_id}/scene", response_model=SceneOut)
async def get_campaign_scene(
    campaign_id: str,
    identity: AuthIdentity = Depends(campaign_identity),
) -> SceneOut:
    """Retorna (ou cria) a cena ativa de uma campanha."""
    return scene_service.get_or_create_default_scene(campaign_id)


@router.put("/scenes/{scene_id}/map-stages", response_model=SceneOut)
async def update_map_stages(
    scene_id: int,
    body: MapStagesIn,
    identity: AuthIdentity = Depends(current_identity),
) -> SceneOut:
    scene = scene_service.get_scene(scene_id)
    if scene is None or scene.campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="cena não encontrada")
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode configurar cenas")
    try:
        result = scene_service.save_map_stages(
            scene_id,
            [stage.model_dump() for stage in body.stages],
            body.active_stage,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result
