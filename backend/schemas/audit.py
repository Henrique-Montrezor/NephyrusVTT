"""DTO público do histórico administrativo."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: str
    actor_id: str
    action: str
    target_type: str
    target_id: str
    created_at: datetime
