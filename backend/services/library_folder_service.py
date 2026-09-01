"""Regras de hierarquia para as pastas virtuais da biblioteca."""

from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.asset import Asset
from backend.models.library_folder import LibraryFolder
from backend.models.page import Page
from backend.schemas.library_folder import LibraryFolderOut
from backend.services.asset_service import _safe_folder

DEFAULT_FOLDERS = ("Mapas", "Fichas", "Tokens", "Documentos")
MAX_DEPTH = 6


class LibraryFolderError(ValueError):
    """Erro de validação ou conflito na árvore de pastas."""


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


def _folder_out(folder: LibraryFolder) -> LibraryFolderOut:
    parts = folder.path.split("/")
    return LibraryFolderOut(
        id=folder.id,
        campaign_id=folder.campaign_id,
        path=folder.path,
        name=parts[-1],
        parent="/".join(parts[:-1]),
        created_at=folder.created_at,
    )


def _clean_name(value: str) -> str:
    name = re.sub(r"\s+", " ", str(value or "")).strip()
    if "/" in name or "\\" in name:
        raise LibraryFolderError("o nome da pasta não pode conter barras")
    if name in {"", ".", ".."} or len(name) > 80:
        raise LibraryFolderError("o nome da pasta deve ter entre 1 e 80 caracteres")
    cleaned = _safe_folder(name, max_depth=1)
    if not cleaned:
        raise LibraryFolderError("nome de pasta inválido")
    return cleaned


def _clean_parent(value: str) -> str:
    return _safe_folder(value, max_depth=MAX_DEPTH)


def _join(parent: str, name: str) -> str:
    path = f"{parent}/{name}" if parent else name
    if len(path.split("/")) > MAX_DEPTH:
        raise LibraryFolderError(f"a biblioteca aceita até {MAX_DEPTH} níveis")
    return path


def _require_parent(db: Session, campaign_id: str, parent: str) -> None:
    if not parent:
        return
    exists = db.scalar(
        select(LibraryFolder.id).where(
            LibraryFolder.campaign_id == campaign_id,
            LibraryFolder.path == parent,
        )
    )
    if exists is None:
        raise LibraryFolderError("pasta de destino não encontrada")


def _seed_defaults(db: Session, campaign_id: str) -> None:
    count = db.scalar(
        select(LibraryFolder.id)
        .where(LibraryFolder.campaign_id == campaign_id)
        .limit(1)
    )
    if count is None:
        db.add_all(
            [LibraryFolder(campaign_id=campaign_id, path=name) for name in DEFAULT_FOLDERS]
        )
        db.flush()


def list_folders(campaign_id: str) -> list[LibraryFolderOut]:
    with _session() as db:
        _seed_defaults(db, campaign_id)
        folders = db.scalars(
            select(LibraryFolder)
            .where(LibraryFolder.campaign_id == campaign_id)
            .order_by(LibraryFolder.path.asc())
        ).all()
        return [_folder_out(folder) for folder in folders]


def create_folder(campaign_id: str, name: str, parent: str = "") -> LibraryFolderOut:
    clean_name = _clean_name(name)
    clean_parent = _clean_parent(parent)
    path = _join(clean_parent, clean_name)
    with _session() as db:
        _seed_defaults(db, campaign_id)
        _require_parent(db, campaign_id, clean_parent)
        duplicate = db.scalar(
            select(LibraryFolder.id).where(
                LibraryFolder.campaign_id == campaign_id,
                LibraryFolder.path == path,
            )
        )
        if duplicate is not None:
            raise LibraryFolderError("já existe uma pasta com esse nome")
        folder = LibraryFolder(campaign_id=campaign_id, path=path)
        db.add(folder)
        db.flush()
        return _folder_out(folder)


def update_folder(
    folder_id: int,
    campaign_id: str,
    name: str | None = None,
    parent: str | None = None,
) -> LibraryFolderOut | None:
    with _session() as db:
        folder = db.get(LibraryFolder, folder_id)
        if folder is None or folder.campaign_id != campaign_id:
            return None

        old_path = folder.path
        old_parts = old_path.split("/")
        next_name = _clean_name(name) if name is not None else old_parts[-1]
        next_parent = _clean_parent(parent) if parent is not None else "/".join(old_parts[:-1])
        if next_parent == old_path or next_parent.startswith(f"{old_path}/"):
            raise LibraryFolderError("uma pasta não pode ser movida para dentro dela mesma")
        _require_parent(db, campaign_id, next_parent)
        next_path = _join(next_parent, next_name)
        if next_path == old_path:
            return _folder_out(folder)

        conflict = db.scalar(
            select(LibraryFolder.id).where(
                LibraryFolder.campaign_id == campaign_id,
                LibraryFolder.path == next_path,
                LibraryFolder.id != folder_id,
            )
        )
        if conflict is not None:
            raise LibraryFolderError("já existe uma pasta com esse nome no destino")

        folders = db.scalars(
            select(LibraryFolder).where(
                LibraryFolder.campaign_id == campaign_id,
                or_(
                    LibraryFolder.path == old_path,
                    LibraryFolder.path.startswith(f"{old_path}/"),
                ),
            )
        ).all()
        for child in folders:
            child.path = next_path + child.path[len(old_path) :]

        assets = db.scalars(
            select(Asset).where(
                Asset.campaign_id == campaign_id,
                or_(Asset.folder == old_path, Asset.folder.startswith(f"{old_path}/")),
            )
        ).all()
        for asset in assets:
            asset.folder = next_path + asset.folder[len(old_path) :]

        pages = db.scalars(
            select(Page).where(
                Page.campaign_id == campaign_id,
                or_(Page.folder == old_path, Page.folder.startswith(f"{old_path}/")),
            )
        ).all()
        for page in pages:
            page.folder = next_path + page.folder[len(old_path) :]

        db.flush()
        return _folder_out(folder)


def delete_folder(folder_id: int, campaign_id: str) -> bool:
    with _session() as db:
        folder = db.get(LibraryFolder, folder_id)
        if folder is None or folder.campaign_id != campaign_id:
            return False
        path = folder.path
        child = db.scalar(
            select(LibraryFolder.id).where(
                LibraryFolder.campaign_id == campaign_id,
                LibraryFolder.path.startswith(f"{path}/"),
            )
        )
        asset = db.scalar(
            select(Asset.id).where(Asset.campaign_id == campaign_id, Asset.folder == path)
        )
        page = db.scalar(
            select(Page.id).where(Page.campaign_id == campaign_id, Page.folder == path)
        )
        if child is not None or asset is not None or page is not None:
            raise LibraryFolderError("a pasta precisa estar vazia para ser excluída")
        db.execute(delete(LibraryFolder).where(LibraryFolder.id == folder_id))
        return True
