"""Rotas autenticadas para fichas PDF de personagem."""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.schemas.character_sheet import (
    CharacterSheetOut,
    PublicSheetValuesOut,
    SheetFieldCreateIn,
    SheetFieldVisibilityIn,
    SheetFieldUpdateIn,
    SheetFromTemplateIn,
    SheetOwnerOut,
    SheetValuesIn,
    TokenStagesIn,
)
from backend.services import character_sheet_service as sheets
from backend.services.auth_service import AuthIdentity
from backend.services.character_sheet_service import SheetError
from backend.network.connection_manager import manager

router = APIRouter(prefix="/api", tags=["character-sheet"])


def _authorized(sheet: CharacterSheetOut | None, identity: AuthIdentity, gm_only: bool = False) -> CharacterSheetOut:
    if sheet is None or sheet.campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="ficha não encontrada")
    if gm_only and not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode configurar fichas")
    if not identity.is_gm and sheet.owner_id != identity.member_id:
        raise HTTPException(status_code=404, detail="ficha não encontrada")
    return sheet


@router.get("/campaigns/{campaign_id}/sheets", response_model=list[CharacterSheetOut])
async def list_character_sheets(campaign_id: str, identity: AuthIdentity = Depends(campaign_identity)) -> list[CharacterSheetOut]:
    return sheets.list_sheets(campaign_id, identity.member_id, identity.is_gm)


@router.get("/campaigns/{campaign_id}/sheet-owners", response_model=list[SheetOwnerOut])
async def list_sheet_owners(campaign_id: str, identity: AuthIdentity = Depends(gm_identity)) -> list[dict[str, str]]:
    return sheets.list_owners(campaign_id)


@router.post("/campaigns/{campaign_id}/sheets", response_model=CharacterSheetOut, status_code=201)
async def import_character_sheet(
    campaign_id: str,
    owner_id: str = Form(...),
    title: str = Form(default=""),
    file: UploadFile = File(...),
    identity: AuthIdentity = Depends(gm_identity),
) -> CharacterSheetOut:
    try:
        return sheets.create_sheet(campaign_id, owner_id, title, file.filename or "ficha.pdf", await file.read())
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/campaigns/{campaign_id}/sheets/from-template",
    response_model=CharacterSheetOut,
    status_code=201,
)
async def create_character_sheet_from_template(
    campaign_id: str,
    body: SheetFromTemplateIn,
    identity: AuthIdentity = Depends(gm_identity),
) -> CharacterSheetOut:
    from backend.services import game_system_service as systems

    current = systems.get_system(campaign_id)
    template_id = current.manifest.base_sheet_id if current else None
    if not template_id:
        raise HTTPException(status_code=400, detail="a campanha ainda não possui modelo de ficha")
    try:
        return sheets.create_sheet_from_template(
            campaign_id, template_id, body.owner_id, body.title
        )
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/sheets/{sheet_id}/token-stages", response_model=CharacterSheetOut)
async def update_character_sheet_token_stages(
    sheet_id: str,
    body: TokenStagesIn,
    identity: AuthIdentity = Depends(current_identity),
) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity, gm_only=True)
    try:
        result = sheets.save_token_stages(
            sheet_id, [stage.model_dump() for stage in body.stages]
        )
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result


@router.get("/sheets/{sheet_id}/pdf")
async def read_character_sheet_pdf(sheet_id: str, identity: AuthIdentity = Depends(current_identity)) -> FileResponse:
    found = sheets.get_sheet(sheet_id)
    sheet = _authorized(found[0] if found else None, identity)
    path = found[1] if found else None
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="arquivo original não encontrado")
    return FileResponse(path, media_type="application/pdf", filename=sheet.source_name)


@router.patch("/sheets/{sheet_id}/values", response_model=CharacterSheetOut)
async def update_sheet_values(sheet_id: str, body: SheetValuesIn, identity: AuthIdentity = Depends(current_identity)) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity)
    try:
        result = sheets.update_values(sheet_id, body.values)
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    changed_public = {
        key: value
        for key, value in (sheets.public_values(sheet_id) or {}).items()
        if key in body.values
    }
    if changed_public:
        await manager.broadcast(
            identity.campaign_id,
            {
                "type": "sheet:public_update",
                "payload": {
                    "sheet_id": result.id,
                    "title": result.title,
                    "owner_name": result.owner_name,
                    "values": changed_public,
                },
            },
        )
    return result


@router.post("/sheets/{sheet_id}/fields", response_model=CharacterSheetOut)
async def add_sheet_field(sheet_id: str, body: SheetFieldCreateIn, identity: AuthIdentity = Depends(current_identity)) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity, gm_only=True)
    try:
        result = sheets.add_custom_field(sheet_id, body.model_dump())
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result


@router.patch("/sheets/{sheet_id}/fields/{field_key}", response_model=CharacterSheetOut)
async def update_field_visibility(sheet_id: str, field_key: str, body: SheetFieldVisibilityIn, identity: AuthIdentity = Depends(current_identity)) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity, gm_only=True)
    try:
        result = sheets.set_field_public(sheet_id, field_key, body.public)
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result


@router.put("/sheets/{sheet_id}/fields/{field_key}", response_model=CharacterSheetOut)
async def update_sheet_field(sheet_id: str, field_key: str, body: SheetFieldUpdateIn, identity: AuthIdentity = Depends(current_identity)) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity, gm_only=True)
    try:
        result = sheets.update_custom_field(sheet_id, field_key, body.model_dump(exclude_none=True))
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result


@router.delete("/sheets/{sheet_id}/fields/{field_key}", response_model=CharacterSheetOut)
async def delete_sheet_field(sheet_id: str, field_key: str, identity: AuthIdentity = Depends(current_identity)) -> CharacterSheetOut:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity, gm_only=True)
    try:
        result = sheets.delete_custom_field(sheet_id, field_key)
    except SheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert result is not None
    return result


@router.get("/sheets/{sheet_id}/public", response_model=PublicSheetValuesOut)
async def read_public_sheet_values(sheet_id: str, identity: AuthIdentity = Depends(current_identity)) -> PublicSheetValuesOut:
    found = sheets.get_sheet(sheet_id)
    if found is None or found[0].campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="ficha não encontrada")
    return PublicSheetValuesOut(sheet_id=sheet_id, title=found[0].title, owner_name=found[0].owner_name, values=sheets.public_values(sheet_id) or {})


@router.get("/sheets/{sheet_id}/export")
async def export_character_sheet(sheet_id: str, identity: AuthIdentity = Depends(current_identity)) -> StreamingResponse:
    found = sheets.get_sheet(sheet_id)
    _authorized(found[0] if found else None, identity)
    try:
        exported = sheets.export_pdf(sheet_id)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="não foi possível preencher este PDF") from exc
    if exported is None:
        raise HTTPException(status_code=404, detail="ficha não encontrada")
    content, filename = exported
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
