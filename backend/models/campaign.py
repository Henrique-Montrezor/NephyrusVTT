"""Campanhas e participantes autenticados."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    invite_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["CampaignMember"]] = relationship(
        "CampaignMember", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignMember(Base):
    __tablename__ = "campaign_members"
    __table_args__ = (UniqueConstraint("campaign_id", "display_name", name="uq_campaign_member_name"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(60))
    role: Mapped[str] = mapped_column(String(12), default="player", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    campaign: Mapped[Campaign] = relationship("Campaign", back_populates="members")
