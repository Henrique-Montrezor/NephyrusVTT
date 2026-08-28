"""Controller REST de páginas protegido por sessão e campanha."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.schemas.page import PageCreateIn, PageOut, PageUpdateIn
from backend.services import page_service
from backend.services.auth_service import AuthIdentity

router = APIRouter(prefix="/api", tags=["page"])


@router.get("/campaigns/{campaign_id}/pages", response_model=list[PageOut])
async def list_campaign_pages(
    campaign_id: str,
    identity: AuthIdentity = Depends(campaign_identity),
) -> list[PageOut]:
    return page_service.list_pages(campaign_id)


@router.get("/pages/{page_id}", response_model=PageOut)
async def get_page(
    page_id: int,
    identity: AuthIdentity = Depends(current_identity),
) -> PageOut:
    page = page_service.get_page(page_id)
    if page is None:
        raise HTTPException(status_code=404, detail="página não encontrada")
    if page.campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="página não encontrada")
    return page


@router.post("/campaigns/{campaign_id}/pages", response_model=PageOut)
async def create_page(
    campaign_id: str,
    body: PageCreateIn,
    identity: AuthIdentity = Depends(gm_identity),
) -> PageOut:
    return page_service.create_page(
        campaign_id,
        title=body.title,
        content=body.content,
        folder=body.folder,
    )


@router.patch("/pages/{page_id}", response_model=PageOut)
async def update_page(
    page_id: int,
    body: PageUpdateIn,
    identity: AuthIdentity = Depends(current_identity),
) -> PageOut:
    current = page_service.get_page(page_id)
    if current is None or current.campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="página não encontrada")
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode editar páginas")
    result = page_service.update_page(
        page_id,
        title=body.title,
        content=body.content,
        folder=body.folder,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="página não encontrada")
    return result


@router.delete("/pages/{page_id}")
async def delete_page(
    page_id: int,
    identity: AuthIdentity = Depends(current_identity),
) -> dict:
    current = page_service.get_page(page_id)
    if current is None or current.campaign_id != identity.campaign_id:
        raise HTTPException(status_code=404, detail="página não encontrada")
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode excluir páginas")
    ok = page_service.delete_page(page_id)
    if not ok:
        raise HTTPException(status_code=404, detail="página não encontrada")
    return {"deleted": page_id}
