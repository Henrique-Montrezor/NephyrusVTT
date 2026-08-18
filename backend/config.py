"""Configurações centrais do Host (Neferus VTT).

Todas as opções ficam concentradas aqui para facilitar o empacotamento
futuro (PyInstaller) e a execução local no PC do Mestre.
"""

from __future__ import annotations

import secrets
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Raiz do projeto (Neferus_project/), independente de onde o processo é iniciado.
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Configurações carregadas de variáveis de ambiente ou de um arquivo .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="NEFERUS_",
        extra="ignore",
    )

    # --- Rede ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # --- Segurança (JWT) ---
    # Em produção local, defina NEFERUS_SECRET_KEY para manter as sessões
    # válidas entre reinícios. Caso contrário, uma chave temporária é gerada.
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h

    # --- Caminhos ---
    BASE_DIR: Path = BASE_DIR
    FRONTEND_DIR: Path = BASE_DIR / "frontend"
    # Build do frontend novo (Preact/Vite). Preferido quando existir.
    FRONTEND_DIST_DIR: Path = BASE_DIR / "frontend-react" / "dist"
    STORAGE_DIR: Path = BASE_DIR / "storage"
    DATA_DIR: Path = BASE_DIR / "data"

    # --- Upload de arquivos (Fase 3) ---
    MAX_UPLOAD_MB: int = 50

    @property
    def MAX_UPLOAD_BYTES(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def DB_URL(self) -> str:
        """URL de conexão do SQLite (arquivo local em data/)."""
        return f"sqlite:///{(self.DATA_DIR / 'neferus.db').as_posix()}"

    @property
    def ACTIVE_FRONTEND_DIR(self) -> Path:
        """Frontend a servir: o build novo (dist) se existir, senão o legado."""
        if (self.FRONTEND_DIST_DIR / "index.html").exists():
            return self.FRONTEND_DIST_DIR
        return self.FRONTEND_DIR

    def ensure_dirs(self) -> None:
        """Garante que as pastas de storage/dados existam antes de usar."""
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
