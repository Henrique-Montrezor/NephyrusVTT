"""Serviço de rolagem de dados (autoritativo no servidor).

Interpreta notação de dados no estilo RPG ("2d20+3", "1d100", "d6-1",
"3d6+1d4") ou uma rolagem estruturada, sorteia os valores e devolve o
resultado detalhado. Usa `secrets` para aleatoriedade de boa qualidade.
"""

from __future__ import annotations

import re
import secrets

from backend.schemas.dice import DiceResultOut, DiceRollIn, DieRoll

# Limites de segurança (evita abuso: expressões enormes).
MAX_DICE = 100
MAX_SIDES = 1000

# Termos: [+-] N d M  (N opcional) OU um modificador plano [+-] K.
_DIE_TERM = re.compile(r"([+-]?)\s*(\d*)\s*d\s*(\d+)", re.IGNORECASE)
_FLAT_TERM = re.compile(r"([+-]?)\s*(\d+)")


class DiceError(ValueError):
    """Erro de notação/limite inválido."""


def _roll_die(sides: int) -> int:
    return secrets.randbelow(sides) + 1


def parse_and_roll(data: DiceRollIn) -> DiceResultOut:
    """Interpreta a intenção e devolve o resultado sorteado."""
    if data.notation and data.notation.strip():
        dice, modifier, notation = _from_notation(data.notation)
    else:
        dice, modifier, notation = _from_structured(
            data.count, data.sides, data.modifier
        )

    if not dice:
        raise DiceError("Nenhum dado para rolar.")
    if len(dice) > MAX_DICE:
        raise DiceError(f"Máximo de {MAX_DICE} dados por rolagem.")

    total = sum(d.value for d in dice) + modifier
    return DiceResultOut(
        notation=notation,
        label=data.label,
        dice=dice,
        modifier=modifier,
        total=total,
    )


def _from_structured(
    count: int, sides: int, modifier: int
) -> tuple[list[DieRoll], int, str]:
    if sides < 2 or sides > MAX_SIDES:
        raise DiceError("Número de faces inválido.")
    if count < 1 or count > MAX_DICE:
        raise DiceError("Quantidade de dados inválida.")
    dice = [DieRoll(sides=sides, value=_roll_die(sides)) for _ in range(count)]
    sign = "+" if modifier >= 0 else "-"
    notation = f"{count}d{sides}"
    if modifier:
        notation += f"{sign}{abs(modifier)}"
    return dice, modifier, notation


def _from_notation(text: str) -> tuple[list[DieRoll], int, str]:
    cleaned = text.strip().lower().replace(" ", "")
    if not cleaned:
        raise DiceError("Notação vazia.")

    dice: list[DieRoll] = []
    modifier = 0
    consumed = [False] * len(cleaned)

    # 1) Termos de dados (NdM).
    for m in _DIE_TERM.finditer(cleaned):
        sign = -1 if m.group(1) == "-" else 1
        count = int(m.group(2)) if m.group(2) else 1
        sides = int(m.group(3))
        if sides < 2 or sides > MAX_SIDES:
            raise DiceError("Número de faces inválido.")
        if count < 1 or count > MAX_DICE:
            raise DiceError("Quantidade de dados inválida.")
        if len(dice) + count > MAX_DICE:
            raise DiceError(f"Máximo de {MAX_DICE} dados por rolagem.")
        for _ in range(count):
            value = _roll_die(sides)
            dice.append(DieRoll(sides=sides, value=sign * value if sign < 0 else value))
        for i in range(m.start(), m.end()):
            consumed[i] = True

    # 2) Modificadores planos (partes não consumidas pelos termos de dados).
    leftover = "".join(
        c if not consumed[i] else " " for i, c in enumerate(cleaned)
    )
    for m in _FLAT_TERM.finditer(leftover):
        sign = -1 if m.group(1) == "-" else 1
        modifier += sign * int(m.group(2))

    if not dice:
        raise DiceError("Notação sem dados (ex.: 2d20+3).")

    return dice, modifier, _canonical_notation(dice, modifier)


def _canonical_notation(dice: list[DieRoll], modifier: int) -> str:
    """Reconstrói uma notação legível agrupando dados por número de faces."""
    groups: dict[int, int] = {}
    for d in dice:
        groups[d.sides] = groups.get(d.sides, 0) + 1
    parts = [f"{count}d{sides}" for sides, count in sorted(groups.items())]
    notation = "+".join(parts)
    if modifier:
        notation += f"{'+' if modifier >= 0 else '-'}{abs(modifier)}"
    return notation
