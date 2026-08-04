"""Model da Névoa de Guerra (Fog of War).

A névoa é uma máscara de revelação por célula do grid. Cada `FogCell` marca
uma célula (coordenadas de grid, não pixels) como REVELADA para os jogadores.
Quando a névoa está ativa, os jogadores só enxergam as células reveladas; o
Mestre vê o mapa inteiro (com as células ocultas destacadas).
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class FogCell(Base):
    __tablename__ = "fog_cells"
    __table_args__ = (
        UniqueConstraint("scene_id", "cx", "cy", name="uq_fog_scene_cell"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )

    # Coordenadas da célula no grid (coluna, linha).
    cx: Mapped[int] = mapped_column(Integer)
    cy: Mapped[int] = mapped_column(Integer)

    scene: Mapped["Scene"] = relationship("Scene", back_populates="fog_cells")


from backend.models.scene import Scene  # noqa: E402
