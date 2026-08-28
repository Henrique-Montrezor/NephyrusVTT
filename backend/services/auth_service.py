"""Criação de campanhas, entrada por convite e tokens de acesso."""

from __future__ import annotations

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError
from sqlalchemy import select

from backend.config import settings
from backend.database import SessionLocal
from backend.models.campaign import Campaign, CampaignMember


class AuthError(ValueError):
    pass


@dataclass(frozen=True)
class AuthIdentity:
    campaign_id: str
    campaign_name: str
    member_id: str
    display_name: str
    role: str
    token_version: int

    @property
    def is_gm(self) -> bool:
        return self.role == "gm"


def _clean_name(value: str, label: str, maximum: int) -> str:
    clean = re.sub(r"\s+", " ", value).strip()
    if len(clean) < 2 or len(clean) > maximum:
        raise AuthError(f"{label} deve ter entre 2 e {maximum} caracteres")
    return clean


def _new_id() -> str:
    return uuid.uuid4().hex


def _new_invite_code() -> str:
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10].upper()


def _identity(member: CampaignMember, campaign: Campaign) -> AuthIdentity:
    return AuthIdentity(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        member_id=member.id,
        display_name=member.display_name,
        role=member.role,
        token_version=member.token_version,
    )


def issue_access_token(identity: AuthIdentity) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": identity.member_id,
        "campaign_id": identity.campaign_id,
        "role": identity.role,
        "ver": identity.token_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_campaign(campaign_name: str, display_name: str) -> tuple[AuthIdentity, str]:
    campaign_name = _clean_name(campaign_name, "nome da campanha", 120)
    display_name = _clean_name(display_name, "nome do mestre", 60)
    with SessionLocal() as db:
        campaign = Campaign(id=_new_id(), name=campaign_name, invite_code=_new_invite_code())
        member = CampaignMember(
            id=_new_id(), campaign_id=campaign.id, display_name=display_name, role="gm"
        )
        db.add_all([campaign, member])
        db.commit()
        db.refresh(campaign)
        db.refresh(member)
        return _identity(member, campaign), campaign.invite_code


def join_campaign(invite_code: str, display_name: str) -> AuthIdentity:
    code = invite_code.strip().upper()
    display_name = _clean_name(display_name, "nome do jogador", 60)
    with SessionLocal() as db:
        campaign = db.scalar(select(Campaign).where(Campaign.invite_code == code))
        if campaign is None or not campaign.invite_enabled:
            raise AuthError("convite inválido ou revogado")
        existing = db.scalar(
            select(CampaignMember).where(
                CampaignMember.campaign_id == campaign.id,
                CampaignMember.display_name == display_name,
            )
        )
        if existing is not None:
            raise AuthError("este nome já está em uso na mesa")
        member = CampaignMember(
            id=_new_id(), campaign_id=campaign.id, display_name=display_name, role="player"
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        return _identity(member, campaign)


def identity_from_token(token: str) -> AuthIdentity:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        member_id = str(payload["sub"])
        campaign_id = str(payload["campaign_id"])
        token_version = int(payload.get("ver", 0))
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise AuthError("sessão inválida ou expirada") from exc

    with SessionLocal() as db:
        member = db.get(CampaignMember, member_id)
        campaign = db.get(Campaign, campaign_id)
        if (
            member is None
            or campaign is None
            or member.campaign_id != campaign_id
            or not member.is_active
            or member.token_version != token_version
        ):
            raise AuthError("sessão revogada")
        return _identity(member, campaign)


def rotate_invite(identity: AuthIdentity) -> str:
    if not identity.is_gm:
        raise AuthError("apenas o Mestre pode renovar o convite")
    with SessionLocal() as db:
        campaign = db.get(Campaign, identity.campaign_id)
        if campaign is None:
            raise AuthError("campanha não encontrada")
        campaign.invite_code = _new_invite_code()
        campaign.invite_enabled = True
        db.commit()
        return campaign.invite_code


def current_invite(identity: AuthIdentity) -> str:
    if not identity.is_gm:
        raise AuthError("apenas o Mestre pode consultar o convite")
    with SessionLocal() as db:
        campaign = db.get(Campaign, identity.campaign_id)
        if campaign is None or not campaign.invite_enabled:
            raise AuthError("convite indisponível")
        return campaign.invite_code
