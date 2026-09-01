"""Persistência e fórmulas do sistema baseado em uma ficha PDF."""

from __future__ import annotations

import ast
import io
import json
import math
import operator
import re
import uuid
from typing import Callable

from sqlalchemy import select
from reportlab.pdfgen import canvas

from backend.database import SessionLocal
from backend.models.game_system import GameSystem
from backend.schemas.character_sheet import CharacterSheetOut
from backend.schemas.game_system import FormulaCheckOut, GameSystemOut, SystemManifest
from backend.services import character_sheet_service as sheets


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


def sheet_variables(sheet: CharacterSheetOut) -> dict[str, float]:
    values: dict[str, float] = {}
    for field in sheet.fields:
        if field.field_type != "number":
            continue
        raw = sheet.values.get(field.key, 0)
        try:
            values[field.key] = float(raw or 0)
        except (TypeError, ValueError):
            values[field.key] = 0
    return values


def validate_formula(formula: str, variables: dict[str, float]) -> FormulaCheckOut:
    """Valida a expressão por AST e usa somente campos numéricos da ficha."""
    source = re.sub(r"\s+", " ", formula.strip())
    if not source:
        raise GameSystemError("a fórmula não pode ficar vazia")
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
                count, sides = dice[int(suffix)]
                value = count * (sides + 1) / 2
            elif node.id in variables:
                references.add(node.id)
                value = variables[node.id]
            else:
                raise GameSystemError(f"campo numérico desconhecido: {node.id}")
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
            raise GameSystemError("use apenas dados, campos numéricos e operadores + - * / // %")
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


def get_template(campaign_id: str, sheet_id: str | None) -> CharacterSheetOut | None:
    if not sheet_id:
        return None
    found = sheets.get_sheet(sheet_id)
    if found is None or found[0].campaign_id != campaign_id:
        return None
    return found[0]


def validate_manifest(campaign_id: str, manifest: SystemManifest) -> SystemManifest:
    keys: set[str] = set()
    for roll in manifest.rolls:
        if roll.key in keys:
            raise GameSystemError(f"chave duplicada: {roll.key}")
        keys.add(roll.key)
    template = get_template(campaign_id, manifest.base_sheet_id)
    if manifest.rolls and template is None:
        raise GameSystemError("adicione uma ficha PDF base antes de configurar rolagens")
    variables = sheet_variables(template) if template else {}
    for roll in manifest.rolls:
        validate_formula(roll.formula, variables)
    return manifest


def _upgrade_manifest(raw: dict) -> SystemManifest:
    if raw.get("schema_version") == "nephyrus.system/v2":
        return SystemManifest.model_validate(raw)
    return SystemManifest(
        name=str(raw.get("name") or "Regras da campanha"),
        version=str(raw.get("version") or "1.0.0"),
        license=str(raw.get("license") or "Uso privado"),
        rolls=raw.get("rolls") or [],
    )


def _out(row: GameSystem) -> GameSystemOut:
    return GameSystemOut(
        id=row.id,
        campaign_id=row.campaign_id,
        manifest=_upgrade_manifest(json.loads(row.manifest_json)),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def get_system(campaign_id: str) -> GameSystemOut | None:
    with SessionLocal() as db:
        row = db.scalar(select(GameSystem).where(GameSystem.campaign_id == campaign_id))
        return _out(row) if row else None


def save_system(campaign_id: str, manifest: SystemManifest, *, validate: bool = True) -> GameSystemOut:
    stored = validate_manifest(campaign_id, manifest) if validate else manifest
    with SessionLocal() as db:
        row = db.scalar(select(GameSystem).where(GameSystem.campaign_id == campaign_id))
        if row is None:
            row = GameSystem(id=uuid.uuid4().hex, campaign_id=campaign_id, manifest_json="{}")
            db.add(row)
        row.manifest_json = stored.model_dump_json()
        db.commit()
        db.refresh(row)
        return _out(row)


def attach_template(campaign_id: str, sheet_id: str) -> GameSystemOut:
    current = get_system(campaign_id)
    manifest = current.manifest if current else SystemManifest()
    manifest.base_sheet_id = sheet_id
    return save_system(campaign_id, manifest, validate=False)


def example_template_pdf() -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output)
    pdf.setTitle("Jornadas de Nephyrus - Ficha base CC0")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(56, 790, "Jornadas de Nephyrus")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(56, 772, "Modelo de ficha CC0-1.0")
    for label, key, y in (("Força", "forca", 710), ("Agilidade", "agilidade", 660), ("Espírito", "espirito", 610)):
        pdf.drawString(56, y + 8, label)
        pdf.acroForm.textfield(name=key, x=145, y=y, width=90, height=24)
    pdf.showPage()
    pdf.save()
    return output.getvalue()


def configure_example(campaign_id: str, sheet_id: str) -> GameSystemOut:
    manifest = SystemManifest(
        name="Jornadas de Nephyrus",
        version="1.0.0",
        license="CC0-1.0",
        base_sheet_id=sheet_id,
        rolls=[
            {"key": "ataque", "label": "Ataque", "formula": "1d20 + forca"},
            {"key": "iniciativa", "label": "Iniciativa", "formula": "1d20 + agilidade"},
        ],
    )
    return save_system(campaign_id, manifest)


def import_package(campaign_id: str, content: bytes) -> GameSystemOut:
    if len(content) > 512_000:
        raise GameSystemError("o pacote excede 500 KB")
    try:
        raw = json.loads(content.decode("utf-8-sig"))
        manifest = _upgrade_manifest(raw)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise GameSystemError("pacote de sistema inválido") from exc
    manifest.base_sheet_id = None
    return save_system(campaign_id, manifest, validate=False)


def export_package(campaign_id: str) -> tuple[bytes, str] | None:
    system = get_system(campaign_id)
    if system is None:
        return None
    package = system.manifest.model_copy(update={"base_sheet_id": None})
    content = package.model_dump_json(indent=2).encode("utf-8")
    slug = re.sub(r"[^a-z0-9]+", "-", package.name.lower()).strip("-") or "sistema"
    return content, f"{slug}-{package.version}.nephyrus.json"
