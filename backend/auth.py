"""Dependências de autorização compartilhadas pelas rotas HTTP."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException

from backend.services.auth_service import AuthError, AuthIdentity, identity_from_token


def current_identity(authorization: str | None = Header(default=None)) -> AuthIdentity:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="sessão necessária")
    try:
        return identity_from_token(authorization.split(" ", 1)[1].strip())
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def campaign_identity(
    campaign_id: str,
    identity: AuthIdentity = Depends(current_identity),
) -> AuthIdentity:
    if identity.campaign_id != campaign_id:
        raise HTTPException(status_code=403, detail="acesso negado a esta campanha")
    return identity


def gm_identity(identity: AuthIdentity = Depends(campaign_identity)) -> AuthIdentity:
    if not identity.is_gm:
        raise HTTPException(status_code=403, detail="apenas o Mestre pode realizar esta ação")
    return identity
