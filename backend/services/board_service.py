"""Estado colaborativo do "quadro" da mesa, em memória (por campanha).

Guarda anotações efêmeras que não precisam sobreviver a reinícios do servidor:
- strokes: traços de caneta (desenho livre);
- texts: rótulos de texto sobre o mapa;
- templates: efeitos de magia / áreas de efeito (círculo, cone, linha);
- turn: ordem de turnos (lista + índice atual + rodada).

Como é local (poucos jogadores), manter em memória é suficiente e evita
migrações de banco. Novos clientes recebem o estado ao entrar (board:request).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

MAX_STROKES = 800
MAX_TEXTS = 300
MAX_TEMPLATES = 300


def _empty_board() -> dict[str, Any]:
    return {
        "strokes": [],
        "texts": [],
        "templates": [],
        "turn": {"entries": [], "current": 0, "round": 1},
    }


_boards: dict[str, dict[str, Any]] = defaultdict(_empty_board)


def get_board(campaign_id: str) -> dict[str, Any]:
    return _boards[campaign_id]


# --- Desenho (caneta) ---


def add_stroke(campaign_id: str, stroke: dict) -> dict:
    board = _boards[campaign_id]
    board["strokes"].append(stroke)
    if len(board["strokes"]) > MAX_STROKES:
        board["strokes"] = board["strokes"][-MAX_STROKES:]
    return stroke


def clear_strokes(campaign_id: str) -> None:
    _boards[campaign_id]["strokes"] = []


# --- Texto ---


def add_text(campaign_id: str, text: dict) -> dict:
    board = _boards[campaign_id]
    board["texts"].append(text)
    if len(board["texts"]) > MAX_TEXTS:
        board["texts"] = board["texts"][-MAX_TEXTS:]
    return text


def remove_text(
    campaign_id: str, text_id: str, *, user_id: str | None, is_gm: bool
) -> bool:
    board = _boards[campaign_id]
    target = next((t for t in board["texts"] if t.get("id") == text_id), None)
    if target is None or (not is_gm and target.get("owner") != user_id):
        return False
    board["texts"] = [t for t in board["texts"] if t.get("id") != text_id]
    return True


# --- Templates de magia / área de efeito ---


def add_template(campaign_id: str, template: dict) -> dict:
    board = _boards[campaign_id]
    board["templates"].append(template)
    if len(board["templates"]) > MAX_TEMPLATES:
        board["templates"] = board["templates"][-MAX_TEMPLATES:]
    return template


def remove_template(
    campaign_id: str, template_id: str, *, user_id: str | None, is_gm: bool
) -> bool:
    board = _boards[campaign_id]
    target = next(
        (t for t in board["templates"] if t.get("id") == template_id), None
    )
    if target is None or (not is_gm and target.get("owner") != user_id):
        return False
    board["templates"] = [
        t for t in board["templates"] if t.get("id") != template_id
    ]
    return True


def move_template(
    campaign_id: str,
    template_id: str,
    x: float,
    y: float,
    x2: float,
    y2: float,
    *,
    user_id: str | None,
    is_gm: bool,
) -> dict | None:
    board = _boards[campaign_id]
    for t in board["templates"]:
        if t.get("id") == template_id:
            if not is_gm and t.get("owner") != user_id:
                return None
            t["x"] = x
            t["y"] = y
            t["x2"] = x2
            t["y2"] = y2
            return t
    return None


def clear_templates(campaign_id: str) -> None:
    _boards[campaign_id]["templates"] = []


# --- Ordem de turnos ---


def set_turn(campaign_id: str, entries: list, current: int, rnd: int) -> dict:
    turn = {
        "entries": entries,
        "current": max(0, current),
        "round": max(1, rnd),
    }
    _boards[campaign_id]["turn"] = turn
    return turn
