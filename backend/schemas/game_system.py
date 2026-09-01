"""Contratos do sistema customizado mínimo."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


SYSTEM_SCHEMA = "nephyrus.system/v1"
Key = str


def _valid_key(value: str) -> str:
    value = value.strip()
    if not value or not value.replace("_", "a").isalnum() or not value[0].isalpha():
        raise ValueError("use uma chave iniciada por letra, contendo apenas letras, números e _")
    return value


class SystemAttribute(BaseModel):
    key: Key = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=80)
    kind: Literal["number", "text", "boolean"] = "number"
    default: float | str | bool = 0
    sheet_field: str | None = Field(default=None, max_length=120)

    _key = field_validator("key")(_valid_key)


class SystemResource(BaseModel):
    key: Key = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=80)
    current: float = 0
    maximum_formula: str = Field(default="1", min_length=1, max_length=180)
    sheet_field: str | None = Field(default=None, max_length=120)

    _key = field_validator("key")(_valid_key)


class SystemRoll(BaseModel):
    key: Key = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=80)
    formula: str = Field(min_length=1, max_length=180)

    _key = field_validator("key")(_valid_key)


class SystemManifest(BaseModel):
    schema_version: Literal["nephyrus.system/v1"] = SYSTEM_SCHEMA
    name: str = Field(default="Sistema da campanha", min_length=1, max_length=100)
    version: str = Field(default="1.0.0", pattern=r"^\d+\.\d+\.\d+$")
    license: str = Field(default="Uso privado", min_length=1, max_length=100)
    attributes: list[SystemAttribute] = Field(default_factory=list, max_length=80)
    resources: list[SystemResource] = Field(default_factory=list, max_length=40)
    rolls: list[SystemRoll] = Field(default_factory=list, max_length=80)


class FormulaCheckIn(BaseModel):
    formula: str = Field(min_length=1, max_length=180)
    attributes: list[SystemAttribute] = Field(default_factory=list, max_length=80)


class FormulaCheckOut(BaseModel):
    valid: bool
    normalized: str
    references: list[str]
    preview: float


class GameSystemOut(BaseModel):
    id: str
    campaign_id: str
    manifest: SystemManifest
    created_at: datetime
    updated_at: datetime
