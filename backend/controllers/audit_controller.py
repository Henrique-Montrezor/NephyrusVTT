"""Consulta do histórico administrativo da campanha."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.auth import gm_identity
from backend.schemas.audit import AuditEventOut
from backend.services import audit_service
from backend.services.auth_service import AuthIdentity

router = APIRouter(prefix="/api", tags=["audit"])


@router.get("/campaigns/{campaign_id}/audit", response_model=list[AuditEventOut])
async def campaign_audit(
    campaign_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    identity: AuthIdentity = Depends(gm_identity),
) -> list[AuditEventOut]:
    return audit_service.list_events(identity.campaign_id, limit)
