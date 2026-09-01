"""Regras de negócio para upload/listagem/remoção de assets.

Salva arquivos em storage/<campaign>/<kind>/<uuid>.<ext> e registra metadados
na tabela Asset. Valida tipo (mime/extensão) e tamanho, e saneia nomes para
evitar path traversal.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import SessionLocal
from backend.models.asset import KIND_AUDIO, KIND_DOC, KIND_MAP, KIND_PDF, KIND_TOKEN, KINDS, Asset
from backend.schemas.asset import AssetOut

# Extensões permitidas por tipo (também validamos o mime declarado).
ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    KIND_MAP: {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    KIND_TOKEN: {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    KIND_PDF: {".pdf"},
    KIND_AUDIO: {".mp3", ".ogg", ".wav", ".m4a"},
    KIND_DOC: {".txt", ".md", ".rtf", ".doc", ".docx", ".odt", ".csv"},
}

ALLOWED_MIME_PREFIX: dict[str, tuple[str, ...]] = {
    KIND_MAP: ("image/",),
    KIND_TOKEN: ("image/",),
    KIND_PDF: ("application/pdf",),
    KIND_AUDIO: ("audio/",),
    KIND_DOC: ("text/", "application/"),
}

_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9_-]+")
_SAFE_FOLDER_SEGMENT = re.compile(r"[^\w .-]+", re.UNICODE)


class UploadError(ValueError):
    """Erro de validação de upload (tipo/tamanho inválido)."""


def _safe_segment(value: str, default: str = "default") -> str:
    """Saneia um segmento de caminho (campaign_id, kind)."""
    cleaned = _SAFE_SEGMENT.sub("_", (value or "").strip())
    return cleaned or default


def _safe_folder(folder: str, max_depth: int = 6) -> str:
    """Saneia um caminho de pasta virtual ("a/b/c"). Vazio = raiz."""
    if not folder:
        return ""
    segments = []
    for raw in str(folder).split("/"):
        compact = re.sub(r"\s+", " ", raw.strip())
        seg = _SAFE_FOLDER_SEGMENT.sub("_", compact).strip(" ._")[:80]
        if seg:
            segments.append(seg)
        if len(segments) >= max_depth:
            break
    return "/".join(segments)


@contextmanager
def _session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def validate(kind: str, filename: str, mime: str, size: int) -> str:
    """Valida tipo/extensão/tamanho. Retorna a extensão em minúsculas."""
    if kind not in KINDS:
        raise UploadError(f"tipo inválido: {kind}")
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS[kind]:
        raise UploadError(f"extensão não permitida para {kind}: {ext or '(vazia)'}")
    if mime and not mime.startswith(ALLOWED_MIME_PREFIX[kind]):
        raise UploadError(f"mime não permitido para {kind}: {mime}")
    if size <= 0:
        raise UploadError("arquivo vazio")
    if size > settings.MAX_UPLOAD_BYTES:
        raise UploadError(f"arquivo excede {settings.MAX_UPLOAD_MB} MB")
    return ext


def save_upload(
    campaign_id: str,
    kind: str,
    original_name: str,
    mime: str,
    content: bytes,
    folder: str = "",
) -> AssetOut:
    """Grava o arquivo em disco e registra o Asset. Valida antes de escrever."""
    ext = validate(kind, original_name, mime, len(content))

    campaign_seg = _safe_segment(campaign_id, "lobby")
    kind_seg = _safe_segment(kind)
    filename = f"{uuid.uuid4().hex}{ext}"

    dest_dir = settings.STORAGE_DIR / campaign_seg / kind_seg
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_bytes(content)

    url = f"/storage/{campaign_seg}/{kind_seg}/{filename}"

    with _session() as db:
        asset = Asset(
            campaign_id=campaign_id,
            kind=kind,
            filename=filename,
            original_name=original_name or filename,
            url=url,
            mime=mime or "application/octet-stream",
            size=len(content),
            folder=_safe_folder(folder),
        )
        db.add(asset)
        db.flush()
        return AssetOut.model_validate(asset)


def list_assets(campaign_id: str, kind: str | None = None) -> list[AssetOut]:
    with _session() as db:
        stmt = select(Asset).where(Asset.campaign_id == campaign_id)
        if kind:
            stmt = stmt.where(Asset.kind == kind)
        stmt = stmt.order_by(Asset.created_at.desc())
        return [AssetOut.model_validate(a) for a in db.scalars(stmt).all()]


def update_asset(
    asset_id: int,
    original_name: str | None = None,
    folder: str | None = None,
) -> AssetOut | None:
    """Renomeia e/ou move (pasta virtual) um asset. Retorna None se não existe."""
    with _session() as db:
        asset = db.get(Asset, asset_id)
        if asset is None:
            return None
        if original_name is not None:
            name = original_name.strip()
            if name:
                asset.original_name = name
        if folder is not None:
            asset.folder = _safe_folder(folder)
        db.flush()
        return AssetOut.model_validate(asset)


def delete_asset(asset_id: int) -> bool:
    with _session() as db:
        asset = db.get(Asset, asset_id)
        if asset is None:
            return False
        # Remove o arquivo do disco (best-effort).
        rel = asset.url.lstrip("/")
        file_path = settings.BASE_DIR / rel
        try:
            if file_path.is_file():
                file_path.unlink()
        except OSError:
            pass
        db.delete(asset)
        return True
