"""DTOs Pydantic para cenas e tokens (serialização de entrada/saída)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TokenOut(BaseModel):
    """Representação de um token enviada ao cliente."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    scene_id: int | None
    name: str
    image_url: str | None
    x: float
    y: float
    size_squares: float
    width: float | None = None
    height: float | None = None
    layer: str
    owner_id: str | None
    is_hidden: bool
    is_locked: bool = False
    light_radius: float = 0.0
    conditions: list[str] = Field(default_factory=list)
    active_stage: int = 0
    initiative: int = 0
    sort_order: int = 0

    @field_validator("conditions", mode="before")
    @classmethod
    def _split_conditions(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [c for c in v.split(",") if c]
        return list(v) if v else []


class GridOut(BaseModel):
    enabled: bool
    size_px: int
    meters_per_square: float


class FogOut(BaseModel):
    """Estado da névoa: ativa? e lista de células reveladas [cx, cy]."""

    enabled: bool
    cells: list[tuple[int, int]] = Field(default_factory=list)


class MapStageOut(BaseModel):
    id: str
    name: str
    image_url: str
    order: int = Field(ge=0)


class MapStagesIn(BaseModel):
    stages: list[MapStageOut] = Field(max_length=12)
    active_stage: int = Field(default=0, ge=0, le=11)


class SceneOut(BaseModel):
    """Estado completo da cena para bootstrap/render."""

    id: int
    campaign_id: str
    name: str
    is_active: bool = False
    background_url: str | None
    map_stages: list[MapStageOut] = Field(default_factory=list)
    active_map_stage: int = 0
    width: int
    height: int
    grid: GridOut
    fog: FogOut
    tokens: list[TokenOut]


class SceneParticipantOut(BaseModel):
    member_id: str
    display_name: str
    online: bool = False


class SceneSummary(BaseModel):
    """Resumo de cena para a lista/painel de cenas (sem tokens)."""

    id: int
    name: str
    is_active: bool
    background_url: str | None
    token_count: int = 0
    participants: list[SceneParticipantOut] = Field(default_factory=list)


class SceneCreateIn(BaseModel):
    name: str | None = None
    background_url: str | None = None


class SceneRenameIn(BaseModel):
    scene_id: int
    name: str


class SceneActivateIn(BaseModel):
    scene_id: int


class SceneDeleteIn(BaseModel):
    scene_id: int


class SceneRequestIn(BaseModel):
    scene_id: int | None = None


# --- Entradas (payloads de WebSocket) ---


class TokenMoveIn(BaseModel):
    token_id: int
    x: float
    y: float


class TokenAddIn(BaseModel):
    name: str = "Token"
    image_url: str | None = None
    x: float = 0.0
    y: float = 0.0
    size_squares: float = 1.0
    width: float | None = None
    height: float | None = None
    layer: str = "object"
    owner_id: str | None = None
    is_hidden: bool = False


class TokenCreateIn(BaseModel):
    name: str = Field(default="Token", min_length=1, max_length=120)
    image_url: str | None = None
    sheet_id: str | None = None
    owner_id: str | None = None
    width: float | None = Field(default=None, gt=0, le=4000)
    height: float | None = Field(default=None, gt=0, le=4000)


class TokenCatalogUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    image_url: str | None = None
    sheet_id: str | None = None
    owner_id: str | None = None
    width: float | None = Field(default=None, gt=0, le=4000)
    height: float | None = Field(default=None, gt=0, le=4000)


class TokenCatalogOut(TokenOut):
    campaign_id: str
    scene_name: str | None = None
    sheet_id: str | None = None
    sheet_title: str | None = None
    owner_name: str | None = None


class TokenRemoveIn(BaseModel):
    token_id: int


class TokenPlaceIn(BaseModel):
    token_id: int
    scene_id: int
    x: float
    y: float


class SceneMoveMembersIn(BaseModel):
    scene_id: int
    member_ids: list[str] = Field(min_length=1, max_length=100)


class TokenVisibilityIn(BaseModel):
    token_id: int
    is_hidden: bool


class TokenUpdateIn(BaseModel):
    """Atualização de token (nome/tamanho/estado) via menu de contexto."""

    token_id: int
    name: str | None = None
    width: float | None = Field(default=None, gt=0)
    height: float | None = Field(default=None, gt=0)
    is_locked: bool | None = None
    light_radius: float | None = Field(default=None, ge=0, le=200)
    conditions: list[str] | None = None
    layer: str | None = None
    owner_id: str | None = None
    active_stage: int | None = Field(default=None, ge=0, le=11)
    initiative: int | None = Field(default=None, ge=-999, le=999)
    sort_order: int | None = Field(default=None, ge=0)


class GridUpdateIn(BaseModel):
    enabled: bool | None = None
    size_px: int | None = Field(default=None, ge=8, le=512)
    meters_per_square: float | None = Field(default=None, gt=0)


class SceneResizeIn(BaseModel):
    scene_id: int
    width: int = Field(ge=64, le=20000)
    height: int = Field(ge=64, le=20000)


class FogToggleIn(BaseModel):
    scene_id: int
    enabled: bool


class FogRevealIn(BaseModel):
    """Pincel de névoa: revela/oculta um conjunto de células."""

    scene_id: int
    cells: list[tuple[int, int]] = Field(default_factory=list, max_length=4000)
    revealed: bool = True


class FogResetIn(BaseModel):
    """Revela tudo (revealed=True) ou oculta tudo (revealed=False)."""

    scene_id: int
    revealed: bool = False
