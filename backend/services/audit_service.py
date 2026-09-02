"""Persistência do histórico administrativo, isolado por campanha."""

from __future__ import annotations

from sqlalchemy import select

from backend.database import SessionLocal
from backend.models.audit_event import AuditEvent
from backend.schemas.audit import AuditEventOut


def record(
    campaign_id: str,
    actor_id: str | None,
    action: str,
    *,
    target_type: str = "",
    target_id: str | int = "",
) -> None:
    with SessionLocal() as db:
        db.add(
            AuditEvent(
                campaign_id=campaign_id,
                actor_id=actor_id or "unknown",
                action=action[:120],
                target_type=target_type[:80],
                target_id=str(target_id)[:120],
            )
        )
        db.commit()


def list_events(campaign_id: str, limit: int = 50) -> list[AuditEventOut]:
    with SessionLocal() as db:
        stmt = (
            select(AuditEvent)
            .where(AuditEvent.campaign_id == campaign_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(max(1, min(limit, 200)))
        )
        return [AuditEventOut.model_validate(event) for event in db.scalars(stmt).all()]
