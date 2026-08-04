"""Controller REST de páginas (CRUD).

Restrito ao GM via query `?is_gm=true` (provisório — igual aos assets).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.page import PageCreateIn, PageOut, PageUpdateIn
from backend.services import page_service

router = APIRouter(prefix="/api", tags=["page"])


def _require_gm(is_gm: bool) -> None:
    if not is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode editar páginas")


@router.get("/campaigns/{campaign_id}/pages", response_model=list[PageOut])
async def list_campaign_pages(campaign_id: str) -> list[PageOut]:
    return page_service.list_pages(campaign_id)


@router.get("/pages/{page_id}", response_model=PageOut)
async def get_page(page_id: int) -> PageOut:
    page = page_service.get_page(page_id)
    if page is None:
        raise HTTPException(status_code=404, detail="página não encontrada")
    return page


@router.post("/campaigns/{campaign_id}/pages", response_model=PageOut)
async def create_page(
    campaign_id: str,
    body: PageCreateIn,
    is_gm: bool = Query(default=False),
) -> PageOut:
    _require_gm(is_gm)
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
    is_gm: bool = Query(default=False),
) -> PageOut:
    _require_gm(is_gm)
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
async def delete_page(page_id: int, is_gm: bool = Query(default=False)) -> dict:
    _require_gm(is_gm)
    ok = page_service.delete_page(page_id)
    if not ok:
        raise HTTPException(status_code=404, detail="página não encontrada")
    return {"deleted": page_id}
