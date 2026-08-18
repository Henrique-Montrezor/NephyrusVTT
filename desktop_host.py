"""Entrypoint do backend para o app desktop empacotado (PyInstaller).

Importa o app diretamente (evita import por string sob o binário congelado) e
força implementações explícitas de protocolo (h11 + websockets) para reduzir os
imports dinâmicos do uvicorn. Os caminhos de dados/frontend podem ser
sobrescritos por variáveis NEFERUS_* passadas pelo Electron.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _base_dir() -> Path:
    """Diretório do executável (congelado) ou da raiz do projeto (dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


_BASE = _base_dir()

# Padrões usados ao rodar o .exe sem o Electron; o Electron sobrescreve estes
# valores apontando para pastas graváveis (userData) e para o frontend em resources.
os.environ.setdefault("NEFERUS_FRONTEND_DIST_DIR", str(_BASE / "web"))
os.environ.setdefault("NEFERUS_DATA_DIR", str(_BASE / "data"))
os.environ.setdefault("NEFERUS_STORAGE_DIR", str(_BASE / "storage"))

import uvicorn  # noqa: E402

from backend.config import settings  # noqa: E402
from backend.main import app  # noqa: E402


def main() -> None:
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        http="h11",
        ws="websockets",
        loop="asyncio",
        lifespan="on",
        log_level="info",
    )


if __name__ == "__main__":
    main()
