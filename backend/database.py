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
    if "scenes" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("scenes")}
    if "is_active" not in columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE scenes ADD COLUMN is_active BOOLEAN DEFAULT 0 NOT NULL")
            )
