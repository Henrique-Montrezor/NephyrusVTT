"""Regras de negócio da cena/tokens (persistência no SQLite).

Cada função abre sua própria sessão (SessionLocal), executa e fecha — isso
mantém os handlers WebSocket assíncronos desacoplados do ciclo de request HTTP.
Para a escala local (SQLite, poucos jogadores) o uso síncrono é adequado.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.scene import Scene
from backend.models.campaign import CampaignMember
from backend.models.character_sheet import CharacterSheet
from backend.models.asset import KIND_TOKEN
from backend.models.token import LAYER_GM, LAYER_OBJECT, LAYERS, Token
from backend.schemas.scene import (
    FogOut,
    GridOut,
    GridUpdateIn,
    SceneOut,
    SceneSummary,
    TokenAddIn,
    TokenCatalogOut,
    TokenCatalogUpdateIn,
    TokenCreateIn,
    TokenOut,
    TokenUpdateIn,
)
from backend.services import asset_service

# URL de exemplo enquanto o upload (Fase 3) não existe.
DEFAULT_BACKGROUND = "https://placehold.co/1600x1200/1e293b/64748b/png?text=Mapa+Exemplo"


def token_hidden_for_players(td: dict) -> bool:
    """Um token não deve ir aos jogadores se está oculto ou na camada GM."""
    return bool(td.get("is_hidden")) or td.get("layer") == LAYER_GM


def scene_belongs_to_campaign(scene_id: int, campaign_id: str) -> bool:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        return scene is not None and scene.campaign_id == campaign_id


def token_belongs_to_campaign(token_id: int, campaign_id: str) -> bool:
    with _session() as db:
        token = db.get(Token, token_id)
        return token is not None and token.campaign_id == campaign_id


class TokenCatalogError(ValueError):
    """Vínculo de token inválido dentro da campanha."""


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


def get_or_create_default_scene(campaign_id: str) -> SceneOut:
    """Retorna a cena ATIVA da campanha, criando uma padrão se não houver nenhuma."""
    with _session() as db:
        return _to_scene_out(_ensure_active_scene(db, campaign_id))


def _ensure_active_scene(db: Session, campaign_id: str) -> Scene:
    """Garante que exista exatamente uma cena ativa; retorna-a."""
    active = db.scalar(
        select(Scene).where(Scene.campaign_id == campaign_id, Scene.is_active.is_(True))
    )
    if active is not None:
        return active
    # Sem cena ativa: usa a primeira existente ou cria uma inicial.
    first = db.scalar(
        select(Scene).where(Scene.campaign_id == campaign_id).order_by(Scene.id).limit(1)
    )
    if first is None:
        first = _create_seed_scene(db, campaign_id)
    first.is_active = True
    db.flush()
    return first


def _create_seed_scene(db: Session, campaign_id: str) -> Scene:
    """Cria uma cena inicial com um mapa exemplo e dois tokens."""
    scene = Scene(
        campaign_id=campaign_id,
        name="Cena Inicial",
        is_active=True,
        background_url=DEFAULT_BACKGROUND,
        width=1600,
        height=1200,
        grid_enabled=True,
        grid_size_px=64,
        meters_per_square=1.5,
    )
    db.add(scene)
    db.flush()  # garante scene.id

    scene.tokens.append(
        Token(
            campaign_id=campaign_id,
            name="Herói",
            image_url="https://placehold.co/64x64/22c55e/ffffff/png?text=P",
            x=64 * 2,
            y=64 * 2,
            width=64,
            height=64,
            layer=LAYER_OBJECT,
            owner_id="player-hero",
        )
    )
    scene.tokens.append(
        Token(
            campaign_id=campaign_id,
            name="NPC Oculto",
            image_url="https://placehold.co/64x64/ef4444/ffffff/png?text=N",
            x=64 * 6,
            y=64 * 4,
            width=64,
            height=64,
            layer=LAYER_OBJECT,
            owner_id=None,
            is_hidden=True,
        )
    )
    return scene


def get_scene_by_id(scene_id: int) -> SceneOut | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        return _to_scene_out(scene) if scene else None


def _clamp_token_pos(
    scene: Scene, token_w: float, token_h: float, x: float, y: float
) -> tuple[float, float]:
    """Mantém o token inteiramente dentro dos limites da cena."""
    max_x = max(0.0, scene.width - token_w)
    max_y = max(0.0, scene.height - token_h)
    cx = min(max(0.0, float(x)), max_x)
    cy = min(max(0.0, float(y)), max_y)
    return cx, cy


def _token_px_size(scene: Scene, token: Token) -> tuple[float, float]:
    fallback = (token.size_squares or 1.0) * scene.grid_size_px
    return (token.width or fallback, token.height or fallback)


def move_token(
    token_id: int,
    x: float,
    y: float,
    *,
    user_id: str | None,
    is_gm: bool,
) -> TokenOut | None:
    """Move um token, validando permissão e limitando aos limites do mapa.

    Regras: o GM move qualquer token; um jogador só move tokens de sua posse
    (owner_id == user_id). Retorna None se não autorizado ou inexistente.
    """
    with _session() as db:
        token = db.get(Token, token_id)
        if token is None or token.scene is None:
            return None
        if not is_gm and token.owner_id != user_id:
            return None
        if token.is_locked:
            return None  # travado: não se move até destravar
        scene = token.scene
        tw, th = _token_px_size(scene, token)
        token.x, token.y = _clamp_token_pos(scene, tw, th, x, y)
        db.flush()
        return TokenOut.model_validate(token)


def add_token(scene_id: int, data: TokenAddIn) -> TokenOut | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        if data.owner_id is not None:
            owner = db.get(CampaignMember, data.owner_id)
            if owner is None or owner.campaign_id != scene.campaign_id or not owner.is_active:
                return None
        token = Token(
            campaign_id=scene.campaign_id, scene_id=scene_id, **data.model_dump()
        )
        if token.layer not in LAYERS:
            token.layer = LAYER_OBJECT
        tw, th = _token_px_size(scene, token)
        token.x, token.y = _clamp_token_pos(scene, tw, th, token.x, token.y)
        db.add(token)
        db.flush()
        return TokenOut.model_validate(token)


def _catalog_out(db: Session, token: Token) -> TokenCatalogOut:
    owner = db.get(CampaignMember, token.owner_id) if token.owner_id else None
    sheet = db.get(CharacterSheet, token.sheet_id) if token.sheet_id else None
    scene = db.get(Scene, token.scene_id) if token.scene_id else None
    payload = TokenOut.model_validate(token).model_dump()
    return TokenCatalogOut(
        **payload,
        campaign_id=token.campaign_id,
        scene_name=scene.name if scene else None,
        sheet_id=token.sheet_id,
        sheet_title=sheet.title if sheet else None,
        owner_name=owner.display_name if owner else None,
    )


def list_campaign_tokens(
    campaign_id: str, member_id: str, is_gm: bool
) -> list[TokenCatalogOut]:
    with _session() as db:
        stmt = select(Token).where(Token.campaign_id == campaign_id)
        if not is_gm:
            stmt = stmt.where(Token.owner_id == member_id)
        tokens = db.scalars(stmt.order_by(Token.name, Token.id)).all()
        return [_catalog_out(db, token) for token in tokens]


def _validate_token_image(campaign_id: str, image_url: str | None) -> None:
    if image_url and asset_service.get_campaign_asset(
        campaign_id, url=image_url, kinds={KIND_TOKEN}
    ) is None:
        raise TokenCatalogError("imagem de token inválida para esta campanha")


def _resolve_token_links(
    db: Session,
    campaign_id: str,
    *,
    sheet_id: str | None,
    owner_id: str | None,
) -> tuple[str | None, str | None]:
    resolved_owner = owner_id
    if sheet_id is not None:
        sheet = db.get(CharacterSheet, sheet_id)
        if sheet is None or sheet.campaign_id != campaign_id:
            raise TokenCatalogError("ficha inválida para esta campanha")
        resolved_owner = sheet.owner_id
    if resolved_owner is not None:
        owner = db.get(CampaignMember, resolved_owner)
        if (
            owner is None
            or owner.campaign_id != campaign_id
            or not owner.is_active
            or owner.role == "gm"
        ):
            raise TokenCatalogError("jogador inválido para esta campanha")
    return sheet_id, resolved_owner


def create_campaign_token(
    campaign_id: str, data: TokenCreateIn
) -> TokenCatalogOut:
    _validate_token_image(campaign_id, data.image_url)
    with _session() as db:
        sheet_id, owner_id = _resolve_token_links(
            db,
            campaign_id,
            sheet_id=data.sheet_id,
            owner_id=data.owner_id,
        )
        token = Token(
            campaign_id=campaign_id,
            scene_id=None,
            sheet_id=sheet_id,
            owner_id=owner_id,
            name=data.name.strip() or "Token",
            image_url=data.image_url,
            width=data.width,
            height=data.height,
            layer=LAYER_OBJECT,
        )
        db.add(token)
        db.flush()
        return _catalog_out(db, token)


def update_campaign_token(
    campaign_id: str, token_id: int, data: TokenCatalogUpdateIn
) -> TokenCatalogOut | None:
    if "image_url" in data.model_fields_set:
        _validate_token_image(campaign_id, data.image_url)
    with _session() as db:
        token = db.get(Token, token_id)
        if token is None or token.campaign_id != campaign_id:
            return None
        next_sheet = data.sheet_id if "sheet_id" in data.model_fields_set else token.sheet_id
        next_owner = data.owner_id if "owner_id" in data.model_fields_set else token.owner_id
        if "sheet_id" in data.model_fields_set and data.sheet_id is not None:
            next_owner = None
        next_sheet, next_owner = _resolve_token_links(
            db,
            campaign_id,
            sheet_id=next_sheet,
            owner_id=next_owner,
        )
        token.sheet_id = next_sheet
        token.owner_id = next_owner
        if data.name is not None:
            token.name = data.name.strip() or token.name
        if "image_url" in data.model_fields_set:
            token.image_url = data.image_url
        if data.width is not None:
            token.width = data.width
        if data.height is not None:
            token.height = data.height
        db.flush()
        return _catalog_out(db, token)


def delete_campaign_token(campaign_id: str, token_id: int) -> bool:
    with _session() as db:
        token = db.get(Token, token_id)
        if token is None or token.campaign_id != campaign_id:
            return False
        db.delete(token)
        return True


def remove_token(token_id: int) -> int | None:
    """Remove um token. Retorna o scene_id afetado (para broadcast) ou None."""
    with _session() as db:
        token = db.get(Token, token_id)
        if token is None:
            return None
        scene_id = token.scene_id
        db.delete(token)
        return scene_id


# --- Gerenciamento de cenas (múltiplas cenas por campanha) ---


def list_scenes(campaign_id: str) -> list[SceneSummary]:
    with _session() as db:
        _ensure_active_scene(db, campaign_id)
        scenes = db.scalars(
            select(Scene).where(Scene.campaign_id == campaign_id).order_by(Scene.id)
        ).all()
        return [
            SceneSummary(
                id=s.id,
                name=s.name,
                is_active=s.is_active,
                background_url=s.background_url,
                token_count=len(s.tokens),
            )
            for s in scenes
        ]


def create_scene(
    campaign_id: str, name: str | None = None, background_url: str | None = None
) -> SceneOut:
    with _session() as db:
        scene = Scene(
            campaign_id=campaign_id,
            name=(name or "Nova Cena").strip()[:120] or "Nova Cena",
            is_active=False,
            background_url=background_url,
            width=1600,
            height=1200,
            grid_enabled=True,
            grid_size_px=64,
            meters_per_square=1.5,
        )
        db.add(scene)
        db.flush()
        return _to_scene_out(scene)


def get_scene(scene_id: int) -> SceneOut | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        return _to_scene_out(scene) if scene else None


def rename_scene(scene_id: int, name: str) -> SceneSummary | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        clean = name.strip()[:120]
        if clean:
            scene.name = clean
        db.flush()
        return SceneSummary(
            id=scene.id,
            name=scene.name,
            is_active=scene.is_active,
            background_url=scene.background_url,
            token_count=len(scene.tokens),
        )


def set_active_scene(campaign_id: str, scene_id: int) -> SceneOut | None:
    """Marca a cena como ativa (e desmarca as demais da campanha)."""
    with _session() as db:
        target = db.get(Scene, scene_id)
        if target is None or target.campaign_id != campaign_id:
            return None
        for s in db.scalars(
            select(Scene).where(Scene.campaign_id == campaign_id, Scene.is_active.is_(True))
        ).all():
            s.is_active = False
        target.is_active = True
        db.flush()
        return _to_scene_out(target)


def delete_scene(campaign_id: str, scene_id: int) -> SceneOut | None:
    """Exclui uma cena. Retorna a cena ativa resultante (nunca fica sem cena)."""
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None or scene.campaign_id != campaign_id:
            return None
        was_active = scene.is_active
        db.delete(scene)
        db.flush()
        if was_active:
            # Ativa outra cena existente (ou cria uma inicial).
            other = db.scalar(
                select(Scene)
                .where(Scene.campaign_id == campaign_id)
                .order_by(Scene.id)
                .limit(1)
            )
            if other is None:
                other = _create_seed_scene(db, campaign_id)
            other.is_active = True
            db.flush()
        return _to_scene_out(_ensure_active_scene(db, campaign_id))


def set_token_visibility(token_id: int, is_hidden: bool) -> TokenOut | None:
    with _session() as db:
        token = db.get(Token, token_id)
        if token is None:
            return None
        token.is_hidden = is_hidden
        db.flush()
        return TokenOut.model_validate(token)


def update_token(
    data: TokenUpdateIn,
    *,
    user_id: str | None,
    is_gm: bool,
) -> TokenOut | None:
    """Atualiza nome/tamanho/estado de um token (permissão dono ou GM)."""
    with _session() as db:
        token = db.get(Token, data.token_id)
        if token is None:
            return None
        if not is_gm and token.owner_id != user_id:
            return None
        if "owner_id" in data.model_fields_set:
            if not is_gm:
                return None
            if data.owner_id is not None:
                owner = db.get(CampaignMember, data.owner_id)
                if owner is None or owner.campaign_id != token.campaign_id or not owner.is_active:
                    return None
        if data.name is not None:
            token.name = data.name.strip() or token.name
        if data.width is not None:
            token.width = data.width
        if data.height is not None:
            token.height = data.height
        if data.is_locked is not None:
            token.is_locked = data.is_locked
        if data.light_radius is not None:
            token.light_radius = data.light_radius
        if data.conditions is not None:
            # Guarda as chaves como CSV (saneadas).
            keys = [c.strip() for c in data.conditions if c and c.strip()]
            token.conditions = ",".join(dict.fromkeys(keys))
        if data.layer is not None and data.layer in LAYERS:
            token.layer = data.layer
        if "owner_id" in data.model_fields_set:
            token.owner_id = data.owner_id
        db.flush()
        return TokenOut.model_validate(token)


def update_grid(scene_id: int, data: GridUpdateIn) -> GridOut | None:
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        if data.enabled is not None:
            scene.grid_enabled = data.enabled
        if data.size_px is not None:
            scene.grid_size_px = data.size_px
        if data.meters_per_square is not None:
            scene.meters_per_square = data.meters_per_square
        db.flush()
        return GridOut(
            enabled=scene.grid_enabled,
            size_px=scene.grid_size_px,
            meters_per_square=scene.meters_per_square,
        )


def set_background(scene_id: int, url: str) -> SceneOut | None:
    """Define a imagem de fundo (mapa) da cena e retorna o estado atualizado."""
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        scene.background_url = url
        db.flush()
        return _to_scene_out(scene)


def resize_scene(scene_id: int, width: int, height: int) -> SceneOut | None:
    """Redimensiona a cena (mapa) e retorna o estado atualizado."""
    with _session() as db:
        scene = db.get(Scene, scene_id)
        if scene is None:
            return None
        scene.width = width
        scene.height = height
        db.flush()
        return _to_scene_out(scene)


# --- Serialização ---


def _to_scene_out(scene: Scene) -> SceneOut:
    return SceneOut(
        id=scene.id,
        campaign_id=scene.campaign_id,
        name=scene.name,
        is_active=scene.is_active,
        background_url=scene.background_url,
        width=scene.width,
        height=scene.height,
        grid=GridOut(
            enabled=scene.grid_enabled,
            size_px=scene.grid_size_px,
            meters_per_square=scene.meters_per_square,
        ),
        fog=FogOut(
            enabled=scene.fog_enabled,
            cells=[(c.cx, c.cy) for c in scene.fog_cells],
        ),
        tokens=[TokenOut.model_validate(t) for t in scene.tokens],
    )
