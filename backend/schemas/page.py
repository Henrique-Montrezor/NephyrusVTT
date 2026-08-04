"""DTOs de Page."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: str
    title: str
    content: str
    folder: str = ""
    created_at: datetime
    updated_at: datetime


class PageCreateIn(BaseModel):
    title: str | None = None
    content: str | None = None
    folder: str | None = None


class PageUpdateIn(BaseModel):
    title: str | None = None
    content: str | None = None
    folder: str | None = None
