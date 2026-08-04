"""DTOs de Asset."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: str
    kind: str
    original_name: str
    url: str
    mime: str
    size: int
    folder: str = ""
    created_at: datetime


class AssetUpdateIn(BaseModel):
    original_name: str | None = None
    folder: str | None = None
