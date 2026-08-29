"""Importação, persistência e exportação de fichas PDF."""

from __future__ import annotations

import io
import json
import re
import uuid
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from pypdf.generic import ArrayObject, DictionaryObject, NameObject
from sqlalchemy import select

from backend.config import settings
from backend.database import SessionLocal
from backend.models.campaign import CampaignMember
from backend.models.character_sheet import CharacterSheet
from backend.schemas.character_sheet import CharacterSheetOut, SheetFieldOut

MAX_FIELDS = 300
MAX_VALUE_LENGTH = 20_000
_SAFE_KEY = re.compile(r"[^a-zA-Z0-9_.:-]+")


class SheetError(ValueError):
    pass


def _resolved(value: Any) -> Any:
    return value.get_object() if hasattr(value, "get_object") else value


def _inherited(widget: DictionaryObject, key: str) -> Any:
    current: Any = widget
    visited: set[int] = set()
    while isinstance(current, DictionaryObject) and id(current) not in visited:
        visited.add(id(current))
        if key in current:
            return _resolved(current[key])
        current = _resolved(current.get("/Parent"))
    return None


def _qualified_name(widget: DictionaryObject) -> str:
    parts: list[str] = []
    current: Any = widget
    visited: set[int] = set()
    while isinstance(current, DictionaryObject) and id(current) not in visited:
        visited.add(id(current))
        if "/T" in current:
            parts.append(str(_resolved(current["/T"])))
        current = _resolved(current.get("/Parent"))
    return ".".join(reversed(parts))


def _unique_key(name: str, seen: set[str]) -> str:
    base = _SAFE_KEY.sub("_", name).strip("_") or "field"
    key = base
    counter = 2
    while key in seen:
        key = f"{base}_{counter}"
        counter += 1
    return key


def _field_type(pdf_type: str, flags: int) -> str:
    if pdf_type == "/Btn":
        return "checkbox"
    if pdf_type == "/Tx" and flags & 4096:
        return "textarea"
    return "text"


def inspect_pdf(content: bytes) -> tuple[int, list[dict[str, Any]]]:
    """Lê árvore AcroForm e widgets; widgets definem página e geometria."""
    try:
        reader = PdfReader(io.BytesIO(content), strict=False)
        if reader.is_encrypted and reader.decrypt("") == 0:
            raise SheetError("PDF protegido por senha não é suportado")
    except (PdfReadError, ValueError, OSError) as exc:
        raise SheetError("arquivo PDF inválido ou corrompido") from exc

    declared = reader.get_fields() or {}
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page_index, page in enumerate(reader.pages):
        width = float(page.mediabox.width) or 1.0
        height = float(page.mediabox.height) or 1.0
        for annotation_ref in page.get("/Annots", ArrayObject()):
            annotation = _resolved(annotation_ref)
            if not isinstance(annotation, DictionaryObject) or annotation.get("/Subtype") != "/Widget":
                continue
            name = _qualified_name(annotation)
            if not name:
                continue
            key = _unique_key(name, seen)
            pdf_type = str(_inherited(annotation, "/FT") or declared.get(name, {}).get("/FT") or "/Tx")
            flags = int(_inherited(annotation, "/Ff") or 0)
            raw_rect = _resolved(annotation.get("/Rect")) or [0, 0, width, 24]
            x1, y1, x2, y2 = (float(raw_rect[i]) for i in range(4))
            rect = [
                round(100 * min(x1, x2) / width, 3),
                round(100 * (height - max(y1, y2)) / height, 3),
                round(100 * abs(x2 - x1) / width, 3),
                round(100 * abs(y2 - y1) / height, 3),
            ]
            fields.append({
                "key": key,
                "label": name,
                "field_type": _field_type(pdf_type, flags),
                "page": page_index + 1,
                "rect": rect,
                "public": False,
                "source": "acroform",
            })
            seen.add(key)
            if len(fields) >= MAX_FIELDS:
                break
    # Alguns geradores declaram campos na árvore AcroForm sem anexar um
    # widget à página. Eles continuam editáveis e não devem desaparecer.
    for name, declared_field in declared.items():
        if len(fields) >= MAX_FIELDS:
            break
        if any(item["label"] == name for item in fields):
            continue
        key = _unique_key(name, seen)
        pdf_type = str(declared_field.get("/FT") or "/Tx")
        flags = int(declared_field.get("/Ff") or 0)
        fields.append({
            "key": key,
            "label": name,
            "field_type": _field_type(pdf_type, flags),
            "page": 1,
            "rect": [0.0, 0.0, 100.0, 0.0],
            "public": False,
            "source": "acroform",
        })
        seen.add(key)
    return len(reader.pages), fields


def _output(sheet: CharacterSheet, owner_name: str) -> CharacterSheetOut:
    return CharacterSheetOut(
        id=sheet.id,
        campaign_id=sheet.campaign_id,
        owner_id=sheet.owner_id,
        owner_name=owner_name,
        title=sheet.title,
        source_name=sheet.source_name,
        page_count=sheet.page_count,
        fields=[SheetFieldOut.model_validate(item) for item in json.loads(sheet.fields_json)],
        values=json.loads(sheet.values_json),
        created_at=sheet.created_at,
        updated_at=sheet.updated_at,
    )


def create_sheet(campaign_id: str, owner_id: str, title: str, source_name: str, content: bytes) -> CharacterSheetOut:
    if not content or len(content) > settings.MAX_UPLOAD_BYTES:
        raise SheetError(f"PDF vazio ou maior que {settings.MAX_UPLOAD_MB} MB")
    if Path(source_name).suffix.lower() != ".pdf" or not content.startswith(b"%PDF-"):
        raise SheetError("envie um arquivo PDF válido")
    page_count, fields = inspect_pdf(content)
    sheet_id = uuid.uuid4().hex
    # Fichas contêm dados pessoais e não ficam sob o mount público /storage.
    directory = settings.DATA_DIR / "sheets" / campaign_id
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{sheet_id}.pdf"
    with SessionLocal() as db:
        owner = db.get(CampaignMember, owner_id)
        if owner is None or owner.campaign_id != campaign_id or not owner.is_active:
            raise SheetError("jogador não pertence a esta campanha")
        destination.write_bytes(content)
        try:
            sheet = CharacterSheet(
                id=sheet_id,
                campaign_id=campaign_id,
                owner_id=owner_id,
                title=(title.strip() or Path(source_name).stem)[:160],
                source_name=Path(source_name).name[:255],
                source_path=str(destination),
                page_count=page_count,
                fields_json=json.dumps(fields, ensure_ascii=False),
                values_json="{}",
            )
            db.add(sheet)
            db.commit()
            db.refresh(sheet)
            return _output(sheet, owner.display_name)
        except Exception:
            destination.unlink(missing_ok=True)
            raise


def list_sheets(campaign_id: str, member_id: str, is_gm: bool) -> list[CharacterSheetOut]:
    with SessionLocal() as db:
        stmt = select(CharacterSheet).where(CharacterSheet.campaign_id == campaign_id)
        if not is_gm:
            stmt = stmt.where(CharacterSheet.owner_id == member_id)
        stmt = stmt.order_by(CharacterSheet.updated_at.desc())
        result = []
        for sheet in db.scalars(stmt).all():
            owner = db.get(CampaignMember, sheet.owner_id)
            result.append(_output(sheet, owner.display_name if owner else "Jogador removido"))
        return result


def list_owners(campaign_id: str) -> list[dict[str, str]]:
    with SessionLocal() as db:
        stmt = (
            select(CampaignMember)
            .where(
                CampaignMember.campaign_id == campaign_id,
                CampaignMember.role == "player",
                CampaignMember.is_active.is_(True),
            )
            .order_by(CampaignMember.display_name)
        )
        return [{"id": member.id, "display_name": member.display_name} for member in db.scalars(stmt).all()]


def get_sheet(sheet_id: str) -> tuple[CharacterSheetOut, Path] | None:
    with SessionLocal() as db:
        sheet = db.get(CharacterSheet, sheet_id)
        if sheet is None:
            return None
        owner = db.get(CampaignMember, sheet.owner_id)
        return _output(sheet, owner.display_name if owner else "Jogador removido"), Path(sheet.source_path)


def _clean_value(field_type: str, value: Any) -> Any:
    if field_type == "checkbox":
        return bool(value)
    if field_type == "number":
        if value in (None, ""):
            return ""
        try:
            return float(value) if "." in str(value) else int(value)
        except (TypeError, ValueError) as exc:
            raise SheetError("campo numérico contém um valor inválido") from exc
    if field_type == "image":
        raise SheetError("campos de imagem serão habilitados no próximo corte do editor")
    return str(value or "")[:MAX_VALUE_LENGTH]


def update_values(sheet_id: str, patch: dict[str, Any]) -> CharacterSheetOut | None:
    with SessionLocal() as db:
        sheet = db.get(CharacterSheet, sheet_id)
        if sheet is None:
            return None
        fields = {item["key"]: item for item in json.loads(sheet.fields_json)}
        unknown = set(patch) - set(fields)
        if unknown:
            raise SheetError(f"campo desconhecido: {sorted(unknown)[0]}")
        values = json.loads(sheet.values_json)
        for key, value in patch.items():
            values[key] = _clean_value(fields[key]["field_type"], value)
        sheet.values_json = json.dumps(values, ensure_ascii=False)
        db.commit()
        db.refresh(sheet)
        owner = db.get(CampaignMember, sheet.owner_id)
        return _output(sheet, owner.display_name if owner else "Jogador removido")


def add_custom_field(sheet_id: str, field: dict[str, Any]) -> CharacterSheetOut | None:
    with SessionLocal() as db:
        sheet = db.get(CharacterSheet, sheet_id)
        if sheet is None:
            return None
        fields = json.loads(sheet.fields_json)
        key = _SAFE_KEY.sub("_", field["key"]).strip("_")
        if not key or any(item["key"] == key for item in fields):
            raise SheetError("identificador de campo inválido ou já utilizado")
        if field["page"] > sheet.page_count or any(not 0 <= float(value) <= 100 for value in field["rect"]):
            raise SheetError("página ou posição do campo inválida")
        if len(fields) >= MAX_FIELDS:
            raise SheetError(f"limite de {MAX_FIELDS} campos atingido")
        fields.append({**field, "key": key, "source": "custom"})
        sheet.fields_json = json.dumps(fields, ensure_ascii=False)
        db.commit()
        db.refresh(sheet)
        owner = db.get(CampaignMember, sheet.owner_id)
        return _output(sheet, owner.display_name if owner else "Jogador removido")


def set_field_public(sheet_id: str, field_key: str, public: bool) -> CharacterSheetOut | None:
    with SessionLocal() as db:
        sheet = db.get(CharacterSheet, sheet_id)
        if sheet is None:
            return None
        fields = json.loads(sheet.fields_json)
        field = next((item for item in fields if item["key"] == field_key), None)
        if field is None:
            raise SheetError("campo não encontrado")
        field["public"] = public
        sheet.fields_json = json.dumps(fields, ensure_ascii=False)
        db.commit()
        db.refresh(sheet)
        owner = db.get(CampaignMember, sheet.owner_id)
        return _output(sheet, owner.display_name if owner else "Jogador removido")


def public_values(sheet_id: str) -> dict[str, Any] | None:
    found = get_sheet(sheet_id)
    if found is None:
        return None
    sheet, _ = found
    public_keys = {field.key for field in sheet.fields if field.public}
    return {key: value for key, value in sheet.values.items() if key in public_keys}


def export_pdf(sheet_id: str) -> tuple[bytes, str] | None:
    found = get_sheet(sheet_id)
    if found is None:
        return None
    sheet, path = found
    reader = PdfReader(path, strict=False)
    writer = PdfWriter(clone_from=reader)
    acro_values = {
        field.label: ("/Yes" if sheet.values.get(field.key) else "/Off")
        if field.field_type == "checkbox"
        else str(sheet.values.get(field.key, ""))
        for field in sheet.fields
        if field.source == "acroform" and field.key in sheet.values
    }
    if acro_values:
        for page in writer.pages:
            writer.update_page_form_field_values(page, acro_values, auto_regenerate=False)
    output = io.BytesIO()
    writer.write(output)
    safe_title = re.sub(r"[^a-zA-Z0-9_-]+", "_", sheet.title).strip("_") or "ficha"
    return output.getvalue(), f"{safe_title}-preenchida.pdf"
