"""Model do Token.

Representa uma peça na mesa (personagem, NPC, objeto). Posição em pixels
(coordenadas do mundo da cena). Camada e visibilidade controlam a renderização.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

# Camadas disponíveis (espelhadas no frontend).
# map = cenário (abaixo dos tokens); object = Tokens; gm = só o Mestre vê.
LAYER_MAP = "map"
LAYER_OBJECT = "object"
LAYER_GM = "gm"
LAYERS = (LAYER_MAP, LAYER_OBJECT, LAYER_GM)


class Token(Base):
    __tablename__ = "tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )

    name: Mapped[str] = mapped_column(String, default="Token")
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # Posição no mundo da cena (pixels).
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)

    # Tamanho em quadrados de grid (compat; fallback quando width/height nulos).
    size_squares: Mapped[float] = mapped_column(Float, default=1.0)

    # Tamanho livre em pixels (redimensionável). Nulo = usa size_squares * grid.
    width: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)

    layer: Mapped[str] = mapped_column(String, default=LAYER_OBJECT)

    # Dono do token (user_id). None = sem dono (controlado só pelo GM).
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Token oculto: enviado apenas para sockets do GM.
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    # Travado: não pode ser movido até destravar.
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    # Ponto de luz: raio (em metros) que revela a névoa ao redor. 0 = sem luz.
    light_radius: Mapped[float] = mapped_column(Float, default=0.0)

    # Condições ativas (chaves separadas por vírgula: "bleeding,dead").
    conditions: Mapped[str] = mapped_column(String, default="")

    scene: Mapped["Scene"] = relationship("Scene", back_populates="tokens")


from backend.models.scene import Scene  # noqa: E402
