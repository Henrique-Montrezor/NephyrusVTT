"""Handlers de cena (bootstrap por WS, grid, visibilidade e gerenciamento)."""

from __future__ import annotations

import logging

from backend.network.connection_manager import Client, manager
from backend.network.handlers import register
from backend.schemas.scene import (
    GridUpdateIn,
    SceneActivateIn,
    SceneCreateIn,
    SceneDeleteIn,
    SceneRenameIn,
    SceneRequestIn,
    SceneResizeIn,
    SceneMoveMembersIn,
)
from backend.models.asset import KIND_AUDIO, KIND_MAP, KIND_PDF
from backend.services import asset_service, scene_service

logger = logging.getLogger("neferus.handlers.scene")


def _scene_state_for(client: Client, scene: object) -> dict:
    """Serializa a cena para um cliente (jogadores não veem tokens ocultos/GM)."""
    data = scene.model_dump()
    if not client.is_gm:
        data["tokens"] = [
            t for t in data["tokens"] if not scene_service.token_hidden_for_players(t)
        ]
    return data


async def _send_scene_list(client: Client) -> None:
    """Envia a lista de cenas apenas ao GM (painel de cenas)."""
    if not client.is_gm:
        return
    online_ids = {entry["user_id"] for entry in manager.roster(client.campaign_id)}
    scenes = scene_service.list_scenes(client.campaign_id, online_ids)
    await manager.send_personal(
        client.websocket,
        {"type": "scene:list", "payload": {"scenes": [s.model_dump() for s in scenes]}},
    )


@register("scene:request")
async def handle_scene_request(client: Client, payload: dict) -> None:
    """Envia o estado de uma cena ao solicitante.

    O GM pode pedir qualquer cena (scene_id); jogadores recebem a cena ativa.
    Atualiza a cena que o cliente está visualizando (para broadcasts por cena).
    """
    req = SceneRequestIn.model_validate(payload)
    scene = None
    if (
        client.is_gm
        and req.scene_id is not None
        and scene_service.scene_belongs_to_campaign(req.scene_id, client.campaign_id)
    ):
        scene = scene_service.get_scene(req.scene_id)
    if scene is None:
        if client.is_gm:
            scene = scene_service.get_or_create_default_scene(client.campaign_id)
        else:
            scene = scene_service.get_scene(
                scene_service.effective_scene_id(
                    client.campaign_id, client.user_id or ""
                )
            )
    client.scene_id = scene.id
    await manager.send_personal(
        client.websocket,
        {"type": "scene:state", "payload": _scene_state_for(client, scene)},
    )
    await _send_scene_list(client)


@register("scene:list")
async def handle_scene_list(client: Client, payload: dict) -> None:
    await _send_scene_list(client)


@register("scene:create")
async def handle_scene_create(client: Client, payload: dict) -> None:
    if not client.is_gm:
        await manager.send_personal(
            client.websocket, {"type": "error", "payload": {"reason": "gm_only"}}
        )
        return
    data = SceneCreateIn.model_validate(payload)
    if data.background_url and asset_service.get_campaign_asset(
        client.campaign_id, url=data.background_url, kinds={KIND_MAP}
    ) is None:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "asset_not_found"}},
        )
        return
    scene_service.create_scene(client.campaign_id, data.name, data.background_url)
    await _send_scene_list(client)


@register("scene:rename")
async def handle_scene_rename(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return
    data = SceneRenameIn.model_validate(payload)
    if not scene_service.scene_belongs_to_campaign(data.scene_id, client.campaign_id):
        return
    scene_service.rename_scene(data.scene_id, data.name)
    await _send_scene_list(client)


@register("scene:activate")
async def handle_scene_activate(client: Client, payload: dict) -> None:
    """GM define a cena ativa; todos os clientes migram para ela."""
    if not client.is_gm:
        await manager.send_personal(
            client.websocket, {"type": "error", "payload": {"reason": "gm_only"}}
        )
        return
    data = SceneActivateIn.model_validate(payload)
    scene = scene_service.set_default_scene(client.campaign_id, data.scene_id)
    if scene is None:
        return
    # Traz todos (GM + jogadores) para a cena ativa.
    for c in list(manager.rooms.get(client.campaign_id, [])):
        c.scene_id = scene.id
        await manager.send_personal(
            c.websocket, {"type": "scene:state", "payload": _scene_state_for(c, scene)}
        )
        await _send_scene_list(c)


@register("scene:move_group")
async def handle_scene_move_group(client: Client, payload: dict) -> None:
    data = SceneActivateIn.model_validate(payload)
    scene = scene_service.set_default_scene(client.campaign_id, data.scene_id)
    if scene is None:
        return
    await manager.send_personal(
        client.websocket,
        {"type": "scene:group_moved", "payload": {"scene_id": scene.id}},
    )
    for connected in list(manager.rooms.get(client.campaign_id, [])):
        connected.scene_id = scene.id
        await manager.send_personal(
            connected.websocket,
            {"type": "scene:state", "payload": _scene_state_for(connected, scene)},
        )
    await _send_scene_list(client)


@register("scene:move_members")
async def handle_scene_move_members(client: Client, payload: dict) -> None:
    data = SceneMoveMembersIn.model_validate(payload)
    member_ids = scene_service.assign_members_to_scene(
        client.campaign_id, data.scene_id, data.member_ids
    )
    if not member_ids:
        return
    scene = scene_service.get_scene(data.scene_id)
    if scene is None:
        return
    await manager.send_personal(
        client.websocket,
        {
            "type": "scene:assignment",
            "payload": {"scene_id": scene.id, "member_ids": member_ids},
        },
    )
    assigned = set(member_ids)
    for connected in list(manager.rooms.get(client.campaign_id, [])):
        if connected.user_id not in assigned:
            continue
        connected.scene_id = scene.id
        await manager.send_personal(
            connected.websocket,
            {"type": "scene:state", "payload": _scene_state_for(connected, scene)},
        )
    await _send_scene_list(client)


@register("scene:delete")
async def handle_scene_delete(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return
    data = SceneDeleteIn.model_validate(payload)
    active = scene_service.delete_scene(client.campaign_id, data.scene_id)
    if active is None:
        return
    # Quem estava vendo a cena excluída vai para a cena ativa.
    for c in list(manager.rooms.get(client.campaign_id, [])):
        if c.scene_id == data.scene_id:
            c.scene_id = active.id
            await manager.send_personal(
                c.websocket, {"type": "scene:state", "payload": _scene_state_for(c, active)}
            )
        await _send_scene_list(c)


@register("grid:update")
async def handle_grid_update(client: Client, payload: dict) -> None:
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    scene_id = int(payload.get("scene_id", 0))
    if not scene_service.scene_belongs_to_campaign(scene_id, client.campaign_id):
        return
    grid = scene_service.update_grid(scene_id, GridUpdateIn.model_validate(payload))
    if grid is None:
        return
    await manager.broadcast_scene(
        client.campaign_id,
        scene_id,
        {"type": "grid:update", "payload": {"scene_id": scene_id, **grid.model_dump()}},
    )


@register("token:visibility")
async def handle_token_visibility(client: Client, payload: dict) -> None:
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    token_id = int(payload.get("token_id", 0))
    if not scene_service.token_belongs_to_campaign(token_id, client.campaign_id):
        return
    is_hidden = bool(payload.get("is_hidden", False))
    token = scene_service.set_token_visibility(token_id, is_hidden)
    if token is None:
        return
    td = token.model_dump()
    sid = td.get("scene_id")

    if is_hidden:
        # Passou a oculto: remove dos jogadores e atualiza o GM (na mesma cena).
        await manager.broadcast_scene(
            client.campaign_id,
            sid,
            {"type": "token:remove", "payload": {"token_id": token_id}},
        )
        await manager.broadcast_scene(
            client.campaign_id,
            sid,
            {"type": "token:add", "payload": td},
            gm_only=True,
        )
    else:
        # Passou a visível: revela para todos na cena.
        await manager.broadcast_scene(
            client.campaign_id,
            sid,
            {"type": "token:add", "payload": td},
        )


@register("scene:background")
async def handle_scene_background(client: Client, payload: dict) -> None:
    """GM define o mapa de fundo da cena; reenvia o estado a todos."""
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    scene_id = int(payload.get("scene_id", 0))
    if not scene_service.scene_belongs_to_campaign(scene_id, client.campaign_id):
        return
    url = str(payload.get("url", "")).strip()
    if asset_service.get_campaign_asset(
        client.campaign_id, url=url, kinds={KIND_MAP}
    ) is None:
        return
    scene = scene_service.set_background(scene_id, url)
    if scene is None:
        return
    # Atualiza apenas quem está vendo esta cena.
    for c in list(manager.rooms.get(client.campaign_id, [])):
        if c.scene_id != scene.id:
            continue
        await manager.send_personal(
            c.websocket, {"type": "scene:state", "payload": _scene_state_for(c, scene)}
        )


@register("scene:resize")
async def handle_scene_resize(client: Client, payload: dict) -> None:
    """GM redimensiona o mapa (px); reenvia o estado a todos."""
    if not client.is_gm:
        await manager.send_personal(
            client.websocket,
            {"type": "error", "payload": {"reason": "gm_only"}},
        )
        return
    data = SceneResizeIn.model_validate(payload)
    if not scene_service.scene_belongs_to_campaign(data.scene_id, client.campaign_id):
        return
    scene = scene_service.resize_scene(data.scene_id, data.width, data.height)
    if scene is None:
        return
    for c in list(manager.rooms.get(client.campaign_id, [])):
        if c.scene_id != scene.id:
            continue
        await manager.send_personal(
            c.websocket, {"type": "scene:state", "payload": _scene_state_for(c, scene)}
        )


@register("audio:play")
async def handle_audio_play(client: Client, payload: dict) -> None:
    """GM toca uma trilha para todos na sala."""
    if not client.is_gm:
        return
    url = str(payload.get("url", "")).strip()
    if asset_service.get_campaign_asset(
        client.campaign_id, url=url, kinds={KIND_AUDIO}
    ) is None:
        return
    await manager.broadcast(
        client.campaign_id,
        {"type": "audio:play", "payload": {"url": url, "loop": bool(payload.get("loop", True))}},
    )


@register("audio:stop")
async def handle_audio_stop(client: Client, payload: dict) -> None:
    if not client.is_gm:
        return
    await manager.broadcast(client.campaign_id, {"type": "audio:stop", "payload": {}})


@register("pdf:share")
async def handle_pdf_share(client: Client, payload: dict) -> None:
    """GM compartilha um documento (PDF) com todos na sala."""
    if not client.is_gm:
        return
    url = str(payload.get("url", "")).strip()
    asset = asset_service.get_campaign_asset(
        client.campaign_id, url=url, kinds={KIND_PDF}
    )
    if asset is None:
        return
    await manager.broadcast(
        client.campaign_id,
        {
            "type": "pdf:share",
            "payload": {"url": asset.url, "name": asset.original_name},
        },
    )
