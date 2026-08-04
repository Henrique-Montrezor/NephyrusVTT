"""Regras de negócio da Névoa de Guerra (Fog of War).

A névoa é uma máscara de revelação por célula do grid. Estas funções abrem sua
própria sessão (padrão do projeto) e devolvem DTOs simples para os handlers.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.fog import FogCell
from backend.models.scene import Scene
from backend.schemas.scene import FogOut

# Limite de segurança para "revelar tudo" em mapas grandes.
MAX_CELLS = 40_000


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


def _fog_out(db: Session, scene: Scene) -> FogOut:
    cells = db.scalars(
        select(FogCell).where(FogCell.scene_id == scene.id)
    ).all()
    return FogOut(
        enabled=scene.fog_enabled,
        cells=[(c.cx, c.cy) for c in cells],
    )


def set_enabled(scene_id: int, enabled: bool) -> FogOut | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        scene.fog_enabled = enabled
        db.flush()
        return _fog_out(db, scene)


def reveal_cells(
    scene_id: int, cells: list[tuple[int, int]], revealed: bool
) -> list[tuple[int, int]] | None:
    """Revela (revealed=True) ou oculta (False) as células informadas.

    Retorna a lista de células efetivamente alteradas (para broadcast enxuto),
    ou None se a cena não existir.
    """
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        wanted = {(int(cx), int(cy)) for cx, cy in cells}
        if not wanted:
            return []

        existing = set(
            db.execute(
                select(FogCell.cx, FogCell.cy).where(FogCell.scene_id == scene_id)
            ).all()
        )

        changed: list[tuple[int, int]] = []
        if revealed:
            for cell in wanted - existing:
                db.add(FogCell(scene_id=scene_id, cx=cell[0], cy=cell[1]))
                changed.append(cell)
        else:
            to_remove = wanted & existing
            if to_remove:
                db.execute(
                    delete(FogCell).where(
                        FogCell.scene_id == scene_id,
                        or_(
                            *[
                                and_(FogCell.cx == cx, FogCell.cy == cy)
                                for cx, cy in to_remove
                            ]
                        ),
                    )
                )
                changed = list(to_remove)
        db.flush()
        return changed


def reset(scene_id: int, revealed: bool) -> FogOut | None:
    """Oculta tudo (revealed=False) ou revela tudo (True) dentro dos limites do mapa."""
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        db.execute(delete(FogCell).where(FogCell.scene_id == scene_id))
        db.flush()
        if revealed:
            step = max(1, scene.grid_size_px)
            cols = math.ceil(scene.width / step)
            rows = math.ceil(scene.height / step)
            if cols * rows <= MAX_CELLS:
                db.add_all(
                    FogCell(scene_id=scene_id, cx=cx, cy=cy)
                    for cy in range(rows)
                    for cx in range(cols)
                )
                db.flush()
        return _fog_out(db, scene)
