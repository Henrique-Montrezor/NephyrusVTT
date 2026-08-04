"""Controller REST de assets (upload/listagem/remoção).

Restrito ao GM via query `?is_gm=true` (provisório — será substituído por auth
JWT em fase futura). Valida tipo e tamanho antes de gravar em disco.
"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from backend.config import settings
from backend.schemas.asset import AssetOut, AssetUpdateIn
from backend.services import asset_service
from backend.services.asset_service import UploadError

router = APIRouter(prefix="/api", tags=["asset"])


def _require_gm(is_gm: bool) -> None:
    if not is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode enviar arquivos")


@router.get("/campaigns/{campaign_id}/assets", response_model=list[AssetOut])
async def list_campaign_assets(
    campaign_id: str,
    kind: str | None = Query(default=None),
) -> list[AssetOut]:
    return asset_service.list_assets(campaign_id, kind)


@router.post("/campaigns/{campaign_id}/assets", response_model=AssetOut)
async def upload_asset(
    campaign_id: str,
    kind: str = Form(...),
    file: UploadFile = File(...),
    folder: str = Form(default=""),
    is_gm: bool = Query(default=False),
) -> AssetOut:
    _require_gm(is_gm)

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"arquivo excede {settings.MAX_UPLOAD_MB} MB",
        )
    try:
        return asset_service.save_upload(
            campaign_id=campaign_id,
            kind=kind,
            original_name=file.filename or "arquivo",
            mime=file.content_type or "",
            content=content,
            folder=folder,
        )
    except UploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: int, is_gm: bool = Query(default=False)) -> dict:
    _require_gm(is_gm)
    ok = asset_service.delete_asset(asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="asset não encontrado")
    return {"deleted": asset_id}


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    body: AssetUpdateIn,
    is_gm: bool = Query(default=False),
) -> AssetOut:
    _require_gm(is_gm)
    result = asset_service.update_asset(
        asset_id,
        original_name=body.original_name,
        folder=body.folder,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="asset não encontrado")
    return result
