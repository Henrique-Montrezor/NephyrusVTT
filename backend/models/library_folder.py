"""Pastas virtuais da biblioteca de uma campanha."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class LibraryFolder(Base):
    __tablename__ = "library_folders"
    __table_args__ = (
        UniqueConstraint("campaign_id", "path", name="uq_library_folder_campaign_path"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    path: Mapped[str] = mapped_column(String(520), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
