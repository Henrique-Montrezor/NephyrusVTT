"""DTOs das pastas virtuais da biblioteca."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LibraryFolderOut(BaseModel):
    id: int
    campaign_id: str
    path: str
    name: str
    parent: str
    created_at: datetime


class LibraryFolderCreateIn(BaseModel):
    name: str
    parent: str = ""


class LibraryFolderUpdateIn(BaseModel):
    name: str | None = None
    parent: str | None = None
