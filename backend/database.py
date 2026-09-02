"""Camada de acesso ao banco (SQLAlchemy + SQLite).

Fornece o engine, a fábrica de sessões e a Base declarativa usada pelos
models. `get_db` é a dependência padrão para injeção nas rotas FastAPI.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings

# SQLite exige `check_same_thread=False` quando usado com múltiplas threads
# (caso do servidor ASGI + WebSockets).
engine = create_engine(
    settings.DB_URL,
    connect_args={"check_same_thread": False},
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


class Base(DeclarativeBase):
    """Base declarativa compartilhada por todos os models."""


def get_db() -> Iterator[Session]:
    """Dependência FastAPI: abre uma sessão por request e fecha ao final."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    """Cria as tabelas registradas na Base (chamado no startup)."""
    # Import tardio garante que os models sejam registrados na metadata
    # antes da criação das tabelas.
    from backend import models  # noqa: F401

    settings.ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _run_light_migrations()


def _run_light_migrations() -> None:
    """Migrações leves e idempotentes para SQLite (adiciona colunas faltantes).

    Evita perder dados existentes quando um novo campo é introduzido — o
    `create_all` não altera tabelas já existentes.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "scenes" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("scenes")}
        if "is_active" not in columns:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE scenes ADD COLUMN is_active BOOLEAN DEFAULT 0 NOT NULL")
                )
    with engine.begin() as conn:
        _migrate_token_catalog(conn)


def _migrate_token_catalog(connection: object) -> None:
    """Transforma tokens de cena em catálogo de campanha, preservando dados.

    A função recebe uma ``Connection`` SQLAlchemy, mas mantém a anotação
    estrutural simples para também ser exercitada em bancos temporários.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    tables = set(inspector.get_table_names())

    if "campaign_members" in tables:
        member_columns = {
            column["name"] for column in inspector.get_columns("campaign_members")
        }
        if "current_scene_id" not in member_columns:
            connection.execute(
                text("ALTER TABLE campaign_members ADD COLUMN current_scene_id INTEGER")
            )

    if "tokens" not in tables:
        return

    token_columns = {
        column["name"]: column for column in inspector.get_columns("tokens")
    }
    if (
        "campaign_id" in token_columns
        and "sheet_id" in token_columns
        and token_columns["scene_id"]["nullable"]
    ):
        return

    source = set(token_columns)

    def old(name: str, fallback: str) -> str:
        return name if name in source else fallback

    campaign_expr = (
        "campaign_id"
        if "campaign_id" in source
        else "(SELECT campaign_id FROM scenes WHERE scenes.id = tokens_catalog_legacy.scene_id)"
    )

    connection.execute(text("ALTER TABLE tokens RENAME TO tokens_catalog_legacy"))
    connection.execute(
        text(
            """CREATE TABLE tokens (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                campaign_id VARCHAR NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
                scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
                sheet_id VARCHAR REFERENCES character_sheets(id) ON DELETE SET NULL,
                name VARCHAR NOT NULL DEFAULT 'Token',
                image_url VARCHAR,
                x FLOAT NOT NULL DEFAULT 0,
                y FLOAT NOT NULL DEFAULT 0,
                size_squares FLOAT NOT NULL DEFAULT 1,
                width FLOAT,
                height FLOAT,
                layer VARCHAR NOT NULL DEFAULT 'object',
                owner_id VARCHAR,
                is_hidden BOOLEAN NOT NULL DEFAULT 0,
                is_locked BOOLEAN NOT NULL DEFAULT 0,
                light_radius FLOAT NOT NULL DEFAULT 0,
                conditions VARCHAR NOT NULL DEFAULT ''
            )"""
        )
    )
    connection.execute(
        text(
            f"""INSERT INTO tokens (
                id, campaign_id, scene_id, sheet_id, name, image_url, x, y,
                size_squares, width, height, layer, owner_id, is_hidden,
                is_locked, light_radius, conditions
            ) SELECT
                id, {campaign_expr}, scene_id, {old('sheet_id', 'NULL')},
                {old('name', "'Token'")}, {old('image_url', 'NULL')},
                {old('x', '0')}, {old('y', '0')}, {old('size_squares', '1')},
                {old('width', 'NULL')}, {old('height', 'NULL')},
                {old('layer', "'object'")}, {old('owner_id', 'NULL')},
                {old('is_hidden', '0')}, {old('is_locked', '0')},
                {old('light_radius', '0')}, {old('conditions', "''")}
            FROM tokens_catalog_legacy"""
        )
    )
    connection.execute(text("DROP TABLE tokens_catalog_legacy"))
    connection.execute(text("CREATE INDEX ix_tokens_campaign_id ON tokens (campaign_id)"))
    connection.execute(text("CREATE INDEX ix_tokens_scene_id ON tokens (scene_id)"))
    connection.execute(text("CREATE INDEX ix_tokens_owner_id ON tokens (owner_id)"))
    connection.execute(text("CREATE INDEX ix_tokens_sheet_id ON tokens (sheet_id)"))
