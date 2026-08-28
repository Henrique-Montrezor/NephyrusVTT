"""Endpoints de criação de campanha, convite e sessão."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import campaign_identity, current_identity, gm_identity
from backend.schemas.auth import AuthSessionOut, CampaignCreateIn, CampaignJoinIn, IdentityOut, InviteOut
from backend.services import auth_service
from backend.services.auth_service import AuthError, AuthIdentity

router = APIRouter(prefix="/api", tags=["auth"])


def _identity_out(identity: AuthIdentity) -> IdentityOut:
    return IdentityOut(
        campaign_id=identity.campaign_id,
        campaign_name=identity.campaign_name,
        member_id=identity.member_id,
        display_name=identity.display_name,
        role=identity.role,
        is_gm=identity.is_gm,
    )


@router.post("/auth/campaigns", response_model=AuthSessionOut, status_code=201)
async def create_campaign(body: CampaignCreateIn) -> AuthSessionOut:
    try:
        identity, invite_code = auth_service.create_campaign(body.campaign_name, body.display_name)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AuthSessionOut(
        access_token=auth_service.issue_access_token(identity),
        identity=_identity_out(identity),
        invite_code=invite_code,
    )


@router.post("/auth/join", response_model=AuthSessionOut)
async def join_campaign(body: CampaignJoinIn) -> AuthSessionOut:
    try:
        identity = auth_service.join_campaign(body.invite_code, body.display_name)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AuthSessionOut(
        access_token=auth_service.issue_access_token(identity), identity=_identity_out(identity)
    )


@router.get("/auth/me", response_model=IdentityOut)
async def me(identity: AuthIdentity = Depends(current_identity)) -> IdentityOut:
    return _identity_out(identity)


@router.post("/campaigns/{campaign_id}/invite/rotate", response_model=InviteOut)
async def rotate_invite(
    campaign_id: str,
    identity: AuthIdentity = Depends(gm_identity),
) -> InviteOut:
    try:
        return InviteOut(invite_code=auth_service.rotate_invite(identity))
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/campaigns/{campaign_id}/invite", response_model=InviteOut)
async def get_invite(
    campaign_id: str,
    identity: AuthIdentity = Depends(gm_identity),
) -> InviteOut:
    try:
        return InviteOut(invite_code=auth_service.current_invite(identity))
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/campaigns/{campaign_id}/membership", response_model=IdentityOut)
async def membership(identity: AuthIdentity = Depends(campaign_identity)) -> IdentityOut:
    return _identity_out(identity)
