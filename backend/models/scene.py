"""Model da Cena (Scene).

Uma cena representa um mapa ativo da campanha, com sua configuração de grid
métrico. Os tokens pertencem a uma cena.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String, default="Nova Cena")

    # Cena ativa: a que os jogadores estão vendo (uma por campanha).
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # Fundo (mapa). Na Fase 2 usamos uma URL fixa/exemplo; upload virá na Fase 3.
    background_url: Mapped[str | None] = mapped_column(String, nullable=True)
    width: Mapped[int] = mapped_column(Integer, default=1600)
    height: Mapped[int] = mapped_column(Integer, default=1200)

    # Grid métrico (configurável pelo GM).
    grid_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    grid_size_px: Mapped[int] = mapped_column(Integer, default=64)
    meters_per_square: Mapped[float] = mapped_column(Float, default=1.5)

    # Névoa de guerra (Fog of War): quando ativa, jogadores só veem células reveladas.
    fog_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    tokens: Mapped[list["Token"]] = relationship(
        "Token",
        back_populates="scene",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    fog_cells: Mapped[list["FogCell"]] = relationship(
        "FogCell",
        back_populates="scene",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# Import tardio para o relacionamento (evita ciclo em tempo de import).
from backend.models.token import Token  # noqa: E402
from backend.models.fog import FogCell  # noqa: E402
