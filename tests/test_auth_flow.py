"""Fluxo crítico de campanha, convite, autorização HTTP e WebSocket."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

_db_handle, _db_path = tempfile.mkstemp(prefix="nephyrus-auth-", suffix=".db")
os.close(_db_handle)
os.environ["NEFERUS_DATABASE_URL"] = f"sqlite:///{Path(_db_path).as_posix()}"
os.environ["NEFERUS_SECRET_KEY"] = "test-secret-key-with-at-least-thirty-two-characters"

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402
from backend.database import engine  # noqa: E402


class AuthFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)
        engine.dispose()
        Path(_db_path).unlink(missing_ok=True)

    def test_campaign_join_and_protected_resources(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Arquivos da Ordem", "display_name": "Lia"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        owner = created.json()
        owner_token = owner["access_token"]
        campaign_id = owner["identity"]["campaign_id"]

        no_session = self.client.get(f"/api/campaigns/{campaign_id}/scene")
        self.assertEqual(no_session.status_code, 401)

        headers = {"Authorization": f"Bearer {owner_token}"}
        me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["is_gm"])

        scene = self.client.get(f"/api/campaigns/{campaign_id}/scene", headers=headers)
        self.assertEqual(scene.status_code, 200, scene.text)
        self.assertEqual(scene.json()["campaign_id"], campaign_id)

        joined = self.client.post(
            "/api/auth/join",
            json={"invite_code": owner["invite_code"], "display_name": "Ravi"},
        )
        self.assertEqual(joined.status_code, 200, joined.text)
        player_token = joined.json()["access_token"]
        player_headers = {"Authorization": f"Bearer {player_token}"}

        forbidden = self.client.post(
            f"/api/campaigns/{campaign_id}/pages",
            headers=player_headers,
            json={"title": "Segredo do mestre"},
        )
        self.assertEqual(forbidden.status_code, 403)

        rotated = self.client.post(
            f"/api/campaigns/{campaign_id}/invite/rotate", headers=headers
        )
        self.assertEqual(rotated.status_code, 200)
        self.assertNotEqual(rotated.json()["invite_code"], owner["invite_code"])

        old_invite = self.client.post(
            "/api/auth/join",
            json={"invite_code": owner["invite_code"], "display_name": "Noah"},
        )
        self.assertEqual(old_invite.status_code, 400)

        with self.client.websocket_connect(f"/ws?token={player_token}") as websocket:
            presence = websocket.receive_json()
            self.assertEqual(presence["type"], "presence:list")
            websocket.send_json({"type": "ping", "payload": {"ts": 42}})
            pong = websocket.receive_json()
            self.assertEqual(pong, {"type": "pong", "payload": {"ts": 42}})


if __name__ == "__main__":
    unittest.main()
