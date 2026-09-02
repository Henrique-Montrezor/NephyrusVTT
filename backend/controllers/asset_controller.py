"""Controller REST de assets protegido por sessão e campanha."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.config import settings
from backend.schemas.asset import AssetOut, AssetUpdateIn
from backend.services import asset_service, audit_service
from backend.services.asset_service import UploadError
from backend.services.auth_service import AuthIdentity

router = APIRouter(prefix="/api", tags=["asset"])


@router.get("/campaigns/{campaign_id}/assets", response_model=list[AssetOut])
async def list_campaign_assets(
    campaign_id: str,
    kind: str | None = Query(default=None),
    identity: AuthIdentity = Depends(campaign_identity),
) -> list[AssetOut]:
    return asset_service.list_assets(campaign_id, kind)


@router.post("/campaigns/{campaign_id}/assets", response_model=AssetOut)
async def upload_asset(
    campaign_id: str,
    kind: str = Form(...),
    file: UploadFile = File(...),
    folder: str = Form(default=""),
    identity: AuthIdentity = Depends(gm_identity),
) -> AssetOut:
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"arquivo excede {settings.MAX_UPLOAD_MB} MB",
        )
    try:
        asset = asset_service.save_upload(
            campaign_id=campaign_id,
            kind=kind,
            original_name=file.filename or "arquivo",
            mime=file.content_type or "",
            content=content,
            folder=folder,
        )
        audit_service.record(campaign_id, identity.member_id, "asset:upload", target_type="asset", target_id=asset.id)
        return asset
    except UploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: int,
    identity: AuthIdentity = Depends(current_identity),
) -> dict:
    assets = asset_service.list_assets(identity.campaign_id)
    asset = next((item for item in assets if item.id == asset_id), None)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset não encontrado")
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode remover arquivos")
    ok = asset_service.delete_asset(asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="asset não encontrado")
    audit_service.record(identity.campaign_id, identity.member_id, "asset:delete", target_type="asset", target_id=asset_id)
    return {"deleted": asset_id}


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    body: AssetUpdateIn,
    identity: AuthIdentity = Depends(current_identity),
) -> AssetOut:
    assets = asset_service.list_assets(identity.campaign_id)
    if not any(item.id == asset_id for item in assets):
        raise HTTPException(status_code=404, detail="asset não encontrado")
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode editar arquivos")
    result = asset_service.update_asset(
        asset_id,
        original_name=body.original_name,
        folder=body.folder,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="asset não encontrado")
    audit_service.record(identity.campaign_id, identity.member_id, "asset:update", target_type="asset", target_id=asset_id)
    return result
