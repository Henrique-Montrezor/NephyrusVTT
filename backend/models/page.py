"""Model de Page (páginas/anotações criadas dentro do app).

Diferente de Asset (arquivo em disco), uma Page tem conteúdo editável
armazenado no próprio banco. Serve para o GM/jogador montar o diário,
fichas simples, notas de campanha, regras da mesa, etc.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)

    title: Mapped[str] = mapped_column(String, default="Nova página")
    content: Mapped[str] = mapped_column(Text, default="")

    # Pasta virtual (mesma organização dos assets). Vazio = raiz.
    folder: Mapped[str] = mapped_column(String, default="", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
