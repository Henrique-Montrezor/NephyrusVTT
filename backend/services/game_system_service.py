"""Persistência e validação segura de sistemas customizados."""

from __future__ import annotations

import ast
import json
import math
import operator
import re
import uuid
from typing import Callable

from sqlalchemy import select

from backend.database import SessionLocal
from backend.models.game_system import GameSystem
from backend.schemas.game_system import (
    FormulaCheckOut,
    GameSystemOut,
    SystemAttribute,
    SystemManifest,
)


class GameSystemError(ValueError):
    pass


_DICE = re.compile(r"(?<![\w.])(\d{1,3})d(\d{1,4})(?![\w.])", re.IGNORECASE)
_BIN_OPS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}
_UNARY_OPS: dict[type[ast.unaryop], Callable[[float], float]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _attribute_values(attributes: list[SystemAttribute]) -> dict[str, float]:
    values: dict[str, float] = {}
    for item in attributes:
        if item.key in values:
            raise GameSystemError(f"chave duplicada: {item.key}")
        if item.kind == "number":
            try:
                values[item.key] = float(item.default)
            except (TypeError, ValueError) as exc:
                raise GameSystemError(f"{item.label} precisa de um valor numérico") from exc
    return values


def validate_formula(formula: str, attributes: list[SystemAttribute]) -> FormulaCheckOut:
    """Valida uma expressão por AST. Nenhum código, função ou atributo é executado."""
    source = re.sub(r"\s+", " ", formula.strip())
    if not source:
        raise GameSystemError("a fórmula não pode ficar vazia")
    values = _attribute_values(attributes)
    dice: list[tuple[int, int]] = []

    def replace_die(match: re.Match[str]) -> str:
        count, sides = int(match.group(1)), int(match.group(2))
        if count < 1 or count > 100 or sides < 2 or sides > 1000:
            raise GameSystemError("dados devem usar de 1 a 100 unidades e de 2 a 1000 faces")
        dice.append((count, sides))
        return f"__die_{len(dice) - 1}"

    parsed_source = _DICE.sub(replace_die, source)
    try:
        tree = ast.parse(parsed_source, mode="eval")
    except SyntaxError as exc:
        raise GameSystemError("fórmula inválida") from exc
    references: set[str] = set()

    def evaluate(node: ast.AST, depth: int = 0) -> float:
        if depth > 16:
            raise GameSystemError("fórmula complexa demais")
        if isinstance(node, ast.Expression):
            return evaluate(node.body, depth + 1)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            value = float(node.value)
        elif isinstance(node, ast.Name):
            if node.id.startswith("__die_"):
                suffix = node.id.removeprefix("__die_")
                if not suffix.isdigit() or int(suffix) >= len(dice):
                    raise GameSystemError("referência de dado inválida")
                index = int(suffix)
                count, sides = dice[index]
                value = count * (sides + 1) / 2
            elif node.id in values:
                references.add(node.id)
                value = values[node.id]
            else:
                raise GameSystemError(f"atributo desconhecido: {node.id}")
        elif isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
            left = evaluate(node.left, depth + 1)
            right = evaluate(node.right, depth + 1)
            try:
                value = _BIN_OPS[type(node.op)](left, right)
            except ZeroDivisionError as exc:
                raise GameSystemError("a fórmula divide por zero") from exc
        elif isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            value = _UNARY_OPS[type(node.op)](evaluate(node.operand, depth + 1))
        else:
            raise GameSystemError("use apenas números, atributos, dados e operadores + - * / // %")
        if not math.isfinite(value) or abs(value) > 1_000_000_000:
            raise GameSystemError("resultado fora do limite permitido")
        return value

    preview = evaluate(tree)
    return FormulaCheckOut(
        valid=True,
        normalized=source,
        references=sorted(references),
        preview=round(preview, 4),
    )


def validate_manifest(manifest: SystemManifest) -> SystemManifest:
    keys: set[str] = set()
    for item in [*manifest.attributes, *manifest.resources, *manifest.rolls]:
        if item.key in keys:
            raise GameSystemError(f"chave duplicada: {item.key}")
        keys.add(item.key)
    for resource in manifest.resources:
        validate_formula(resource.maximum_formula, manifest.attributes)
    for roll in manifest.rolls:
        validate_formula(roll.formula, manifest.attributes)
    return manifest


def _out(row: GameSystem) -> GameSystemOut:
    return GameSystemOut(
        id=row.id,
        campaign_id=row.campaign_id,
        manifest=SystemManifest.model_validate_json(row.manifest_json),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def get_system(campaign_id: str) -> GameSystemOut | None:
    with SessionLocal() as db:
        row = db.scalar(select(GameSystem).where(GameSystem.campaign_id == campaign_id))
        return _out(row) if row else None


def save_system(campaign_id: str, manifest: SystemManifest) -> GameSystemOut:
    validated = validate_manifest(manifest)
    with SessionLocal() as db:
        row = db.scalar(select(GameSystem).where(GameSystem.campaign_id == campaign_id))
        if row is None:
            row = GameSystem(id=uuid.uuid4().hex, campaign_id=campaign_id, manifest_json="{}")
            db.add(row)
        row.manifest_json = validated.model_dump_json()
        db.commit()
        db.refresh(row)
        return _out(row)


def import_package(campaign_id: str, content: bytes) -> GameSystemOut:
    if len(content) > 512_000:
        raise GameSystemError("o pacote excede 500 KB")
    try:
        manifest = SystemManifest.model_validate(json.loads(content.decode("utf-8-sig")))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise GameSystemError("pacote de sistema inválido") from exc
    return save_system(campaign_id, manifest)


def export_package(campaign_id: str) -> tuple[bytes, str] | None:
    system = get_system(campaign_id)
    if system is None:
        return None
    content = system.manifest.model_dump_json(indent=2).encode("utf-8")
    slug = re.sub(r"[^a-z0-9]+", "-", system.manifest.name.lower()).strip("-") or "sistema"
    return content, f"{slug}-{system.manifest.version}.nephyrus.json"
