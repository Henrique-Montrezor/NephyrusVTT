"""Contratos HTTP da ficha PDF preenchível."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


SheetFieldType = Literal["text", "number", "checkbox", "textarea", "image"]


class SheetFieldOut(BaseModel):
    key: str
    label: str
    field_type: SheetFieldType
    page: int = Field(ge=1)
    rect: list[float] = Field(min_length=4, max_length=4)
    public: bool = False
    source: Literal["acroform", "custom"] = "acroform"


class CharacterSheetOut(BaseModel):
    id: str
    campaign_id: str
    owner_id: str
    owner_name: str
    title: str
    source_name: str
    page_count: int
    fields: list[SheetFieldOut]
    values: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SheetValuesIn(BaseModel):
    values: dict[str, Any]


class SheetFieldCreateIn(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=160)
    field_type: SheetFieldType
    page: int = Field(ge=1)
    rect: list[float] = Field(min_length=4, max_length=4)
    public: bool = False


class SheetFieldVisibilityIn(BaseModel):
    public: bool


class PublicSheetValuesOut(BaseModel):
    sheet_id: str
    title: str
    owner_name: str
    values: dict[str, Any]


class SheetOwnerOut(BaseModel):
    id: str
    display_name: str
