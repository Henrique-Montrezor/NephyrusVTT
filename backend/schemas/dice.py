"""DTOs Pydantic para rolagem de dados 3D.

O servidor é a autoridade: recebe a intenção de rolar (notação ou termos) e
devolve o resultado calculado, evitando trapaça no cliente.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DiceRollIn(BaseModel):
    """Intenção de rolagem enviada pelo cliente.

    Aceita notação livre (ex.: "2d20+3") OU uma rolagem simples estruturada
    (count/sides/modifier). A notação tem prioridade quando presente.
    """

    notation: str | None = Field(default=None, max_length=100)
    count: int = Field(default=1, ge=1, le=100)
    sides: int = Field(default=20, ge=2, le=1000)
    modifier: int = Field(default=0, ge=-1000, le=1000)
    label: str | None = Field(default=None, max_length=60)


class DieRoll(BaseModel):
    """Resultado de um único dado."""

    sides: int
    value: int


class DiceResultOut(BaseModel):
    """Resultado completo de uma rolagem, transmitido para a sala."""

    notation: str
    label: str | None = None
    dice: list[DieRoll]
    modifier: int
    total: int
    roller_id: str | None = None
    is_gm: bool = False
