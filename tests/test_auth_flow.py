"""Fluxo crítico de campanha, convite, autorização HTTP e WebSocket."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

_db_handle, _db_path = tempfile.mkstemp(prefix="nephyrus-auth-", suffix=".db")
os.close(_db_handle)
os.environ["NEFERUS_DATABASE_URL"] = f"sqlite:///{Path(_db_path).as_posix()}"
os.environ["NEFERUS_SECRET_KEY"] = "test-secret-key-with-at-least-thirty-two-characters"
_storage_path = tempfile.mkdtemp(prefix="nephyrus-storage-")
_data_path = tempfile.mkdtemp(prefix="nephyrus-data-")
os.environ["NEFERUS_STORAGE_DIR"] = _storage_path
os.environ["NEFERUS_DATA_DIR"] = _data_path

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402
from backend.database import engine  # noqa: E402
from backend.schemas.scene import TokenAddIn, TokenUpdateIn  # noqa: E402
from backend.services import scene_service  # noqa: E402
from pypdf import PdfReader  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402


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
        shutil.rmtree(_storage_path, ignore_errors=True)
        shutil.rmtree(_data_path, ignore_errors=True)

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
        player_id = joined.json()["identity"]["member_id"]
        player_headers = {"Authorization": f"Bearer {player_token}"}

        owned = scene_service.add_token(
            scene.json()["id"],
            TokenAddIn(name="Ravi", owner_id=player_id),
        )
        self.assertIsNotNone(owned)
        assert owned is not None
        self.assertEqual(owned.owner_id, player_id)

        foreign_owner = scene_service.add_token(
            scene.json()["id"],
            TokenAddIn(name="Intruso", owner_id="member-from-another-campaign"),
        )
        self.assertIsNone(foreign_owner)

        denied_owner_change = scene_service.update_token(
            TokenUpdateIn(token_id=owned.id, owner_id=None),
            user_id=player_id,
            is_gm=False,
        )
        self.assertIsNone(denied_owner_change)

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

    def test_fillable_pdf_sheet_is_private_persistent_and_exportable(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Arquivo das Fichas", "display_name": "Mestre Iara"},
        ).json()
        gm_headers = {"Authorization": f"Bearer {created['access_token']}"}
        campaign_id = created["identity"]["campaign_id"]
        player = self.client.post(
            "/api/auth/join",
            json={"invite_code": created["invite_code"], "display_name": "Dante"},
        ).json()
        player_headers = {"Authorization": f"Bearer {player['access_token']}"}

        owners = self.client.get(
            f"/api/campaigns/{campaign_id}/sheet-owners", headers=gm_headers
        )
        self.assertEqual(owners.status_code, 200, owners.text)
        self.assertEqual(owners.json()[0]["display_name"], "Dante")

        source = BytesIO()
        pdf = canvas.Canvas(source)
        pdf.drawString(72, 780, "Ficha de teste")
        pdf.acroForm.textfield(name="character_name", x=72, y=720, width=220, height=24)
        pdf.acroForm.checkbox(name="heroic", x=72, y=670, size=18, buttonStyle="check")
        pdf.showPage()
        pdf.save()

        imported = self.client.post(
            f"/api/campaigns/{campaign_id}/sheets",
            headers=gm_headers,
            data={"owner_id": player["identity"]["member_id"], "title": "Dante"},
            files={"file": ("dante.pdf", source.getvalue(), "application/pdf")},
        )
        self.assertEqual(imported.status_code, 201, imported.text)
        sheet = imported.json()
        self.assertEqual(sheet["page_count"], 1)
        self.assertEqual({field["key"] for field in sheet["fields"]}, {"character_name", "heroic"})

        sheet_id = sheet["id"]
        denied = self.client.get(f"/api/sheets/{sheet_id}/pdf")
        self.assertEqual(denied.status_code, 401)
        outsider = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Outra Mesa", "display_name": "Mestre Nilo"},
        ).json()
        outsider_headers = {"Authorization": f"Bearer {outsider['access_token']}"}
        isolated = self.client.get(f"/api/sheets/{sheet_id}/pdf", headers=outsider_headers)
        self.assertEqual(isolated.status_code, 404)
        player_list = self.client.get(
            f"/api/campaigns/{campaign_id}/sheets", headers=player_headers
        )
        self.assertEqual(player_list.status_code, 200)
        self.assertEqual(len(player_list.json()), 1)

        saved = self.client.patch(
            f"/api/sheets/{sheet_id}/values",
            headers=player_headers,
            json={"values": {"character_name": "Dante Vale", "heroic": True}},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["values"]["character_name"], "Dante Vale")

        visible = self.client.patch(
            f"/api/sheets/{sheet_id}/fields/character_name",
            headers=gm_headers,
            json={"public": True},
        )
        self.assertEqual(visible.status_code, 200, visible.text)
        public = self.client.get(f"/api/sheets/{sheet_id}/public", headers=gm_headers)
        self.assertEqual(public.json()["values"], {"character_name": "Dante Vale"})

        exported = self.client.get(f"/api/sheets/{sheet_id}/export", headers=player_headers)
        self.assertEqual(exported.status_code, 200, exported.text)
        exported_reader = PdfReader(BytesIO(exported.content))
        exported_fields = exported_reader.get_fields() or {}
        self.assertEqual(str(exported_fields["character_name"].get("/V")), "Dante Vale")
        self.assertEqual(str(exported_fields["heroic"].get("/V")), "/Yes")
        widgets = [
            annotation.get_object()
            for page in exported_reader.pages
            for annotation in page.get("/Annots", [])
            if annotation.get_object().get("/Subtype") == "/Widget"
        ]
        self.assertTrue(all(widget.get("/AP", {}).get("/N") is not None for widget in widgets))


if __name__ == "__main__":
    unittest.main()
