"""Rotas REST do explorador de pastas da biblioteca."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.schemas.library_folder import (
    LibraryFolderCreateIn,
    LibraryFolderOut,
    LibraryFolderUpdateIn,
)
from backend.services import library_folder_service
from backend.services.auth_service import AuthIdentity
from backend.services.library_folder_service import LibraryFolderError

router = APIRouter(prefix="/api", tags=["library-folder"])


@router.get("/campaigns/{campaign_id}/folders", response_model=list[LibraryFolderOut])
async def list_campaign_folders(
    campaign_id: str,
    identity: AuthIdentity = Depends(campaign_identity),
) -> list[LibraryFolderOut]:
    return library_folder_service.list_folders(campaign_id)


@router.post(
    "/campaigns/{campaign_id}/folders",
    response_model=LibraryFolderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign_folder(
    campaign_id: str,
    body: LibraryFolderCreateIn,
    identity: AuthIdentity = Depends(gm_identity),
) -> LibraryFolderOut:
    try:
        return library_folder_service.create_folder(campaign_id, body.name, body.parent)
    except LibraryFolderError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/folders/{folder_id}", response_model=LibraryFolderOut)
async def update_campaign_folder(
    folder_id: int,
    body: LibraryFolderUpdateIn,
    identity: AuthIdentity = Depends(current_identity),
) -> LibraryFolderOut:
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode editar pastas")
    try:
        result = library_folder_service.update_folder(
            folder_id,
            identity.campaign_id,
            name=body.name,
            parent=body.parent,
        )
    except LibraryFolderError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="pasta não encontrada")
    return result


@router.delete("/folders/{folder_id}")
async def delete_campaign_folder(
    folder_id: int,
    identity: AuthIdentity = Depends(current_identity),
) -> dict:
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode excluir pastas")
    try:
        deleted = library_folder_service.delete_folder(folder_id, identity.campaign_id)
    except LibraryFolderError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="pasta não encontrada")
    return {"deleted": folder_id}
