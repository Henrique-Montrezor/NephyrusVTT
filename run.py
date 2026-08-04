"""Inicializador local do Host (Neferus VTT).

Uso:
    python run.py

Equivale a `uvicorn backend.main:app`, mas centraliza host/porta em config.py
e facilita o empacotamento futuro com PyInstaller.
"""

from __future__ import annotations

import uvicorn

from backend.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
