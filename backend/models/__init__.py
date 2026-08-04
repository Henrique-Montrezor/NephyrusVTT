"""Pacote de models (ORM).

Importe os módulos aqui para que sejam registrados na metadata da Base
antes da criação das tabelas (create_all).
"""

from backend.models.scene import Scene
from backend.models.token import Token
from backend.models.asset import Asset
from backend.models.fog import FogCell
from backend.models.page import Page

# Futuro: User, Campaign.

__all__ = ["Scene", "Token", "Asset", "FogCell", "Page"]
