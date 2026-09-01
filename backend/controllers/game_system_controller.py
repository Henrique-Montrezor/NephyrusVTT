"""Rotas autenticadas para o sistema customizado da campanha."""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.auth import campaign_identity, gm_identity
from backend.schemas.game_system import FormulaCheckIn, FormulaCheckOut, GameSystemOut, SystemManifest
from backend.services import game_system_service as systems
from backend.services.auth_service import AuthIdentity
from backend.services.game_system_service import GameSystemError

router = APIRouter(prefix="/api", tags=["game-system"])


@router.get("/campaigns/{campaign_id}/system", response_model=GameSystemOut | None)
async def read_system(campaign_id: str, identity: AuthIdentity = Depends(campaign_identity)):
    return systems.get_system(campaign_id)


@router.put("/campaigns/{campaign_id}/system", response_model=GameSystemOut)
async def update_system(campaign_id: str, body: SystemManifest, identity: AuthIdentity = Depends(gm_identity)):
    try:
        return systems.save_system(campaign_id, body)
    except GameSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/campaigns/{campaign_id}/system/formula-check", response_model=FormulaCheckOut)
async def check_formula(campaign_id: str, body: FormulaCheckIn, identity: AuthIdentity = Depends(gm_identity)):
    try:
        return systems.validate_formula(body.formula, body.attributes)
    except GameSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/campaigns/{campaign_id}/system/import", response_model=GameSystemOut)
async def import_system(campaign_id: str, file: UploadFile = File(...), identity: AuthIdentity = Depends(gm_identity)):
    try:
        return systems.import_package(campaign_id, await file.read())
    except GameSystemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/campaigns/{campaign_id}/system/export")
async def export_system(campaign_id: str, identity: AuthIdentity = Depends(gm_identity)):
    exported = systems.export_package(campaign_id)
    if exported is None:
        raise HTTPException(status_code=404, detail="sistema ainda não configurado")
    content, filename = exported
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
