"""Catálogo persistente de tokens da campanha."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.schemas.scene import TokenCatalogOut, TokenCatalogUpdateIn, TokenCreateIn
from backend.services import audit_service, scene_service
from backend.services.auth_service import AuthIdentity
from backend.services.scene_service import TokenCatalogError
from backend.network.connection_manager import manager

router = APIRouter(prefix="/api", tags=["token"])


async def _publish_catalog(campaign_id: str, token: TokenCatalogOut) -> None:
    message = {"type": "token:catalog_update", "payload": token.model_dump()}
    await manager.broadcast(campaign_id, message, gm_only=True)
    if token.owner_id:
        await manager.send_to_user(campaign_id, token.owner_id, message)


@router.get("/campaigns/{campaign_id}/tokens", response_model=list[TokenCatalogOut])
async def list_tokens(
    campaign_id: str,
    identity: AuthIdentity = Depends(campaign_identity),
) -> list[TokenCatalogOut]:
    return scene_service.list_campaign_tokens(
        campaign_id, identity.member_id, identity.is_gm
    )


@router.post(
    "/campaigns/{campaign_id}/tokens",
    response_model=TokenCatalogOut,
    status_code=201,
)
async def create_token(
    campaign_id: str,
    body: TokenCreateIn,
    identity: AuthIdentity = Depends(gm_identity),
) -> TokenCatalogOut:
    try:
        token = scene_service.create_campaign_token(campaign_id, body)
    except TokenCatalogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit_service.record(
        campaign_id,
        identity.member_id,
        "token:create",
        target_type="token",
        target_id=token.id,
    )
    await _publish_catalog(campaign_id, token)
    return token


@router.patch("/tokens/{token_id}", response_model=TokenCatalogOut)
async def update_token(
    token_id: int,
    body: TokenCatalogUpdateIn,
    identity: AuthIdentity = Depends(current_identity),
) -> TokenCatalogOut:
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode editar tokens")
    previous = scene_service.get_campaign_token(identity.campaign_id, token_id)
    try:
        token = scene_service.update_campaign_token(
            identity.campaign_id, token_id, body
        )
    except TokenCatalogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if token is None:
        raise HTTPException(status_code=404, detail="token não encontrado")
    audit_service.record(
        identity.campaign_id,
        identity.member_id,
        "token:update",
        target_type="token",
        target_id=token_id,
    )
    await _publish_catalog(identity.campaign_id, token)
    if previous and previous.owner_id and previous.owner_id != token.owner_id:
        await manager.send_to_user(
            identity.campaign_id,
            previous.owner_id,
            {"type": "token:catalog_remove", "payload": {"token_id": token_id}},
        )
    if token.scene_id is not None:
        await manager.broadcast_scene(
            identity.campaign_id,
            token.scene_id,
            {"type": "token:update", "payload": token.model_dump()},
            gm_only=scene_service.token_hidden_for_players(token.model_dump()),
        )
    return token


@router.delete("/tokens/{token_id}")
async def delete_token(
    token_id: int,
    identity: AuthIdentity = Depends(current_identity),
) -> dict[str, int]:
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode excluir tokens")
    token = scene_service.get_campaign_token(identity.campaign_id, token_id)
    if token is None or not scene_service.delete_campaign_token(identity.campaign_id, token_id):
        raise HTTPException(status_code=404, detail="token não encontrado")
    audit_service.record(
        identity.campaign_id,
        identity.member_id,
        "token:delete",
        target_type="token",
        target_id=token_id,
    )
    message = {"type": "token:catalog_remove", "payload": {"token_id": token_id}}
    await manager.broadcast(identity.campaign_id, message, gm_only=True)
    if token.owner_id:
        await manager.send_to_user(identity.campaign_id, token.owner_id, message)
    if token.scene_id is not None:
        await manager.broadcast_scene(
            identity.campaign_id,
            token.scene_id,
            {"type": "token:remove", "payload": {"token_id": token_id}},
        )
    return {"deleted": token_id}
