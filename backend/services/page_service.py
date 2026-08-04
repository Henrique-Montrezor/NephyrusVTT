"""Regras de negócio para páginas (CRUD) da biblioteca da campanha."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.page import Page
from backend.schemas.page import PageOut
from backend.services.asset_service import _safe_folder

MAX_TITLE = 200
MAX_CONTENT = 200_000


@contextmanager
def _session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def list_pages(campaign_id: str) -> list[PageOut]:
    with _session() as db:
        stmt = (
            select(Page)
            .where(Page.campaign_id == campaign_id)
            .order_by(Page.updated_at.desc())
        )
        return [PageOut.model_validate(p) for p in db.scalars(stmt).all()]


def get_page(page_id: int) -> PageOut | None:
    with _session() as db:
        page = db.get(Page, page_id)
        return PageOut.model_validate(page) if page else None


def create_page(
    campaign_id: str,
    title: str | None = None,
    content: str | None = None,
    folder: str | None = None,
) -> PageOut:
    with _session() as db:
        page = Page(
            campaign_id=campaign_id,
            title=(title or "Nova página").strip()[:MAX_TITLE] or "Nova página",
            content=(content or "")[:MAX_CONTENT],
            folder=_safe_folder(folder or ""),
        )
        db.add(page)
        db.flush()
        return PageOut.model_validate(page)


def update_page(
    page_id: int,
    title: str | None = None,
    content: str | None = None,
    folder: str | None = None,
) -> PageOut | None:
    with _session() as db:
        page = db.get(Page, page_id)
        if page is None:
            return None
        if title is not None:
            clean = title.strip()[:MAX_TITLE]
            if clean:
                page.title = clean
        if content is not None:
            page.content = content[:MAX_CONTENT]
        if folder is not None:
            page.folder = _safe_folder(folder)
        db.flush()
        return PageOut.model_validate(page)


def delete_page(page_id: int) -> bool:
    with _session() as db:
        page = db.get(Page, page_id)
        if page is None:
            return False
        db.delete(page)
        return True
