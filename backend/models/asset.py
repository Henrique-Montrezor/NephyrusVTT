"""Model de Asset (arquivos enviados pelo Mestre).

Cada asset representa um arquivo salvo em disco (storage/) e servido em /storage.
kind: "map" | "token" | "pdf" | "audio".
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base

# Categorias suportadas.
KIND_MAP = "map"
KIND_TOKEN = "token"
KIND_PDF = "pdf"
KIND_AUDIO = "audio"
KIND_DOC = "doc"
KINDS = (KIND_MAP, KIND_TOKEN, KIND_PDF, KIND_AUDIO, KIND_DOC)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String, index=True)

    # Nome salvo em disco (uuid + ext) e nome original informado pelo usuário.
    filename: Mapped[str] = mapped_column(String)
    original_name: Mapped[str] = mapped_column(String)

    # URL pública (servida em /storage/...).
    url: Mapped[str] = mapped_column(String)
    mime: Mapped[str] = mapped_column(String)
    size: Mapped[int] = mapped_column(Integer, default=0)

    # Pasta virtual para organização (ex.: "masmorra/sala1"). Vazio = raiz.
    folder: Mapped[str] = mapped_column(String, default="", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
