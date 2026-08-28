"""Entrypoint da aplicação Neferus VTT (Host).

Cria a instância FastAPI, configura CORS, registra o roteador WebSocket e
serve o frontend estático. No startup, garante as pastas e cria as tabelas.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.database import create_all
from backend.controllers.scene_controller import router as scene_router
from backend.controllers.asset_controller import router as asset_router
from backend.controllers.page_controller import router as page_router
from backend.controllers.auth_controller import router as auth_router
from backend.network.ws_router import router as ws_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicialização: cria diretórios e tabelas antes de aceitar requests."""
    settings.ensure_dirs()
    create_all()
    yield


app = FastAPI(title="Neferus VTT", version="0.1.0", lifespan=lifespan)

# Em execução local o Mestre e os jogadores acessam pela mesma máquina/rede;
# CORS aberto simplifica o acesso via IP local. Restrinja conforme necessário.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas de tempo real (WebSocket).
app.include_router(ws_router)

# Rotas REST (bootstrap de cena, assets, etc.).
app.include_router(scene_router)
app.include_router(asset_router)
app.include_router(page_router)
app.include_router(auth_router)


@app.get("/health")
async def health() -> dict:
    """Verificação simples de disponibilidade do Host."""
    return {"status": "ok", "app": "neferus-vtt"}


# Arquivos enviados pelo Mestre (mapas, tokens, pdf, áudio) servidos em /storage.
settings.ensure_dirs()
app.mount("/storage", StaticFiles(directory=settings.STORAGE_DIR), name="storage")


# Serve o frontend (index.html + js/css). Deve ficar por último para não
# capturar as rotas de API/WS acima. Prefere o build novo (frontend-react/dist).
_frontend_dir = settings.ACTIVE_FRONTEND_DIR
if _frontend_dir.exists():
    app.mount(
        "/",
        StaticFiles(directory=_frontend_dir, html=True),
        name="frontend",
    )
