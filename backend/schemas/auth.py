"""Contratos de entrada e saída para campanhas e autenticação."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CampaignCreateIn(BaseModel):
    campaign_name: str = Field(min_length=2, max_length=120)
    display_name: str = Field(min_length=2, max_length=60)


class CampaignJoinIn(BaseModel):
    invite_code: str = Field(min_length=4, max_length=20)
    display_name: str = Field(min_length=2, max_length=60)


class IdentityOut(BaseModel):
    campaign_id: str
    campaign_name: str
    member_id: str
    display_name: str
    role: str
    is_gm: bool


class AuthSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    identity: IdentityOut
    invite_code: str | None = None


class InviteOut(BaseModel):
    invite_code: str
