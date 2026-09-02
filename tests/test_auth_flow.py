"""Fluxo crítico de campanha, convite, autorização HTTP e WebSocket."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import base64
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
from PIL import Image  # noqa: E402


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
            websocket.send_json(
                {"type": "scene:create", "payload": {"name": "Cena indevida"}}
            )
            denied_ws = websocket.receive_json()
            self.assertEqual(denied_ws["type"], "error")
            self.assertEqual(denied_ws["payload"]["reason"], "gm_only")

        audit = self.client.get(
            f"/api/campaigns/{campaign_id}/audit", headers=headers
        )
        self.assertEqual(audit.status_code, 200, audit.text)
        self.assertIn("invite:rotate", {event["action"] for event in audit.json()})
        forbidden_audit = self.client.get(
            f"/api/campaigns/{campaign_id}/audit", headers=player_headers
        )
        self.assertEqual(forbidden_audit.status_code, 403)

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

        custom_text = self.client.post(
            f"/api/sheets/{sheet_id}/fields",
            headers=gm_headers,
            json={
                "key": "codinome",
                "label": "Codinome",
                "field_type": "text",
                "page": 1,
                "rect": [12, 22, 35, 4],
                "public": False,
            },
        )
        self.assertEqual(custom_text.status_code, 200, custom_text.text)
        custom_level = self.client.post(
            f"/api/sheets/{sheet_id}/fields",
            headers=gm_headers,
            json={
                "key": "nivel",
                "label": "Nível",
                "field_type": "number",
                "page": 1,
                "rect": [74, 22, 8, 4],
                "public": True,
            },
        )
        self.assertEqual(custom_level.status_code, 200, custom_level.text)
        moved = self.client.put(
            f"/api/sheets/{sheet_id}/fields/codinome",
            headers=gm_headers,
            json={"rect": [12, 24, 35, 4]},
        )
        self.assertEqual(moved.status_code, 200, moved.text)
        self.assertEqual(next(field for field in moved.json()["fields"] if field["key"] == "codinome")["rect"], [12.0, 24.0, 35.0, 4.0])

        portrait = BytesIO()
        Image.new("RGB", (24, 24), (39, 92, 76)).save(portrait, format="PNG")
        portrait_value = "data:image/png;base64," + base64.b64encode(portrait.getvalue()).decode("ascii")
        custom_image = self.client.post(
            f"/api/sheets/{sheet_id}/fields",
            headers=gm_headers,
            json={
                "key": "retrato",
                "label": "Retrato",
                "field_type": "image",
                "page": 1,
                "rect": [70, 30, 18, 18],
                "public": False,
            },
        )
        self.assertEqual(custom_image.status_code, 200, custom_image.text)

        with self.client.websocket_connect(f"/ws?token={player['access_token']}") as websocket:
            self.assertEqual(websocket.receive_json()["type"], "presence:list")
            saved = self.client.patch(
                f"/api/sheets/{sheet_id}/values",
                headers=player_headers,
                json={
                    "values": {
                        "character_name": "Dante Vale",
                        "heroic": True,
                        "codinome": "Vigia",
                        "nivel": 7,
                        "retrato": portrait_value,
                    }
                },
            )
            live = websocket.receive_json()
            self.assertEqual(live["type"], "sheet:public_update")
            self.assertEqual(live["payload"]["values"], {"nivel": 7})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["values"]["character_name"], "Dante Vale")

        visible = self.client.patch(
            f"/api/sheets/{sheet_id}/fields/character_name",
            headers=gm_headers,
            json={"public": True},
        )
        self.assertEqual(visible.status_code, 200, visible.text)
        public = self.client.get(f"/api/sheets/{sheet_id}/public", headers=gm_headers)
        self.assertEqual(public.json()["values"], {"character_name": "Dante Vale", "nivel": 7})

        exported = self.client.get(f"/api/sheets/{sheet_id}/export", headers=player_headers)
        self.assertEqual(exported.status_code, 200, exported.text)
        if qa_output := os.environ.get("NEFERUS_PDF_QA_OUTPUT"):
            Path(qa_output).parent.mkdir(parents=True, exist_ok=True)
            Path(qa_output).write_bytes(exported.content)
        exported_reader = PdfReader(BytesIO(exported.content))
        exported_fields = exported_reader.get_fields() or {}
        self.assertEqual(str(exported_fields["character_name"].get("/V")), "Dante Vale")
        self.assertEqual(str(exported_fields["heroic"].get("/V")), "/Yes")
        self.assertIn("Vigia", exported_reader.pages[0].extract_text())
        self.assertIn("7", exported_reader.pages[0].extract_text())
        self.assertGreaterEqual(len(exported_reader.pages[0].images), 1)
        widgets = [
            annotation.get_object()
            for page in exported_reader.pages
            for annotation in page.get("/Annots", [])
            if annotation.get_object().get("/Subtype") == "/Widget"
        ]
        self.assertTrue(all(widget.get("/AP", {}).get("/N") is not None for widget in widgets))

        removed = self.client.delete(
            f"/api/sheets/{sheet_id}/fields/codinome", headers=gm_headers
        )
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertNotIn("codinome", {field["key"] for field in removed.json()["fields"]})

    def test_library_folders_upload_and_realtime_share(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Biblioteca do Breu", "display_name": "Mestre Serena"},
        ).json()
        campaign_id = created["identity"]["campaign_id"]
        gm_headers = {"Authorization": f"Bearer {created['access_token']}"}
        player = self.client.post(
            "/api/auth/join",
            json={"invite_code": created["invite_code"], "display_name": "Ícaro"},
        ).json()
        player_headers = {"Authorization": f"Bearer {player['access_token']}"}

        initial = self.client.get(
            f"/api/campaigns/{campaign_id}/folders", headers=gm_headers
        )
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertEqual(
            {folder["path"] for folder in initial.json()},
            {"Mapas", "Fichas", "Tokens", "Documentos"},
        )
        fichas = next(folder for folder in initial.json() if folder["path"] == "Fichas")

        nested = self.client.post(
            f"/api/campaigns/{campaign_id}/folders",
            headers=gm_headers,
            json={"name": "Investigadores", "parent": "Fichas"},
        )
        self.assertEqual(nested.status_code, 201, nested.text)
        self.assertEqual(nested.json()["path"], "Fichas/Investigadores")

        forbidden = self.client.post(
            f"/api/campaigns/{campaign_id}/folders",
            headers=player_headers,
            json={"name": "Segredos", "parent": ""},
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        uploaded = self.client.post(
            f"/api/campaigns/{campaign_id}/assets",
            headers=gm_headers,
            data={"kind": "pdf", "folder": "Fichas/Investigadores"},
            files={"file": ("registro.pdf", b"%PDF-1.4 teste", "application/pdf")},
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        self.assertEqual(uploaded.json()["folder"], "Fichas/Investigadores")

        renamed = self.client.patch(
            f"/api/folders/{fichas['id']}",
            headers=gm_headers,
            json={"name": "Personagens"},
        )
        self.assertEqual(renamed.status_code, 200, renamed.text)
        self.assertEqual(renamed.json()["path"], "Personagens")
        assets = self.client.get(
            f"/api/campaigns/{campaign_id}/assets", headers=gm_headers
        ).json()
        self.assertEqual(assets[0]["folder"], "Personagens/Investigadores")
        folder_paths = {
            folder["path"]
            for folder in self.client.get(
                f"/api/campaigns/{campaign_id}/folders", headers=gm_headers
            ).json()
        }
        self.assertIn("Personagens/Investigadores", folder_paths)

        nonempty = self.client.delete(
            f"/api/folders/{renamed.json()['id']}", headers=gm_headers
        )
        self.assertEqual(nonempty.status_code, 409, nonempty.text)

        empty = self.client.post(
            f"/api/campaigns/{campaign_id}/folders",
            headers=gm_headers,
            json={"name": "Rascunhos", "parent": ""},
        ).json()
        removed = self.client.delete(f"/api/folders/{empty['id']}", headers=gm_headers)
        self.assertEqual(removed.status_code, 200, removed.text)

        with self.client.websocket_connect(f"/ws?token={created['access_token']}") as gm_ws:
            self.assertEqual(gm_ws.receive_json()["type"], "presence:list")
            with self.client.websocket_connect(f"/ws?token={player['access_token']}") as player_ws:
                self.assertEqual(player_ws.receive_json()["type"], "presence:list")
                self.assertEqual(gm_ws.receive_json()["type"], "presence:list")
                gm_ws.send_json(
                    {
                        "type": "library:share",
                        "payload": {
                            "to": player["identity"]["member_id"],
                            "item": {
                                "id": str(uploaded.json()["id"]),
                                "kind": "pdf",
                                "name": "registro.pdf",
                                "url": uploaded.json()["url"],
                            },
                        },
                    }
                )
                shared = player_ws.receive_json()
                self.assertEqual(shared["type"], "library:share")
                self.assertEqual(shared["payload"]["from"], "Mestre Serena")
                self.assertEqual(shared["payload"]["item"]["name"], "registro.pdf")

                other = self.client.post(
                    "/api/auth/campaigns",
                    json={"campaign_name": "Biblioteca alheia", "display_name": "Mestre Nox"},
                ).json()
                foreign_upload = self.client.post(
                    f"/api/campaigns/{other['identity']['campaign_id']}/assets",
                    headers={"Authorization": f"Bearer {other['access_token']}"},
                    data={"kind": "pdf", "folder": ""},
                    files={"file": ("segredo.pdf", b"%PDF-1.4 outro", "application/pdf")},
                ).json()
                gm_ws.send_json(
                    {
                        "type": "library:share",
                        "payload": {
                            "to": player["identity"]["member_id"],
                            "item": {"id": str(foreign_upload["id"])},
                        },
                    }
                )
                isolated = gm_ws.receive_json()
                self.assertEqual(isolated["type"], "error")
                self.assertEqual(isolated["payload"]["reason"], "asset_not_found")

        audit = self.client.get(
            f"/api/campaigns/{campaign_id}/audit", headers=gm_headers
        )
        actions = {event["action"] for event in audit.json()}
        self.assertIn("asset:upload", actions)
        self.assertIn("library:share", actions)

    def test_custom_system_manifest_formulas_and_package_roundtrip(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Marchas do Norte", "display_name": "Mestre Maíra"},
        ).json()
        campaign_id = created["identity"]["campaign_id"]
        gm_headers = {"Authorization": f"Bearer {created['access_token']}"}
        player = self.client.post(
            "/api/auth/join",
            json={"invite_code": created["invite_code"], "display_name": "Caio"},
        ).json()
        player_headers = {"Authorization": f"Bearer {player['access_token']}"}

        source = BytesIO()
        pdf = canvas.Canvas(source)
        pdf.drawString(72, 780, "Ficha base da campanha")
        pdf.acroForm.textfield(name="forca", x=72, y=720, width=120, height=24)
        pdf.showPage()
        pdf.save()
        uploaded_template = self.client.post(
            f"/api/campaigns/{campaign_id}/system/template",
            headers=gm_headers,
            files={"file": ("modelo-base.pdf", source.getvalue(), "application/pdf")},
        )
        self.assertEqual(uploaded_template.status_code, 200, uploaded_template.text)
        template_id = uploaded_template.json()["id"]
        number_field = self.client.put(
            f"/api/sheets/{template_id}/fields/forca",
            headers=gm_headers,
            json={"label": "Força", "field_type": "number"},
        )
        self.assertEqual(number_field.status_code, 200, number_field.text)
        values = self.client.patch(
            f"/api/sheets/{template_id}/values",
            headers=gm_headers,
            json={"values": {"forca": 2}},
        )
        self.assertEqual(values.status_code, 200, values.text)

        manifest = {
            "schema_version": "nephyrus.system/v2",
            "name": "Jornadas de Nephyrus",
            "version": "1.0.0",
            "license": "CC0-1.0",
            "base_sheet_id": template_id,
            "rolls": [
                {"key": "ataque", "label": "Ataque", "formula": "1d20 + forca"}
            ],
        }

        forbidden = self.client.put(
            f"/api/campaigns/{campaign_id}/system", headers=player_headers, json=manifest
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        saved = self.client.put(
            f"/api/campaigns/{campaign_id}/system", headers=gm_headers, json=manifest
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["manifest"]["rolls"][0]["formula"], "1d20 + forca")

        checked = self.client.post(
            f"/api/campaigns/{campaign_id}/system/formula-check",
            headers=gm_headers,
            json={"formula": "2d6 + forca * 2", "sheet_id": template_id},
        )
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertEqual(checked.json()["references"], ["forca"])
        self.assertEqual(checked.json()["preview"], 11.0)

        attribute_dice = self.client.post(
            f"/api/campaigns/{campaign_id}/system/formula-check",
            headers=gm_headers,
            json={"formula": "{forca}d20", "sheet_id": template_id},
        )
        self.assertEqual(attribute_dice.status_code, 200, attribute_dice.text)
        self.assertEqual(attribute_dice.json()["references"], ["forca"])
        self.assertEqual(attribute_dice.json()["preview"], 21.0)

        injection = self.client.post(
            f"/api/campaigns/{campaign_id}/system/formula-check",
            headers=gm_headers,
            json={"formula": "__import__('os').system('echo unsafe')", "sheet_id": template_id},
        )
        self.assertEqual(injection.status_code, 422, injection.text)

        template = self.client.get(
            f"/api/campaigns/{campaign_id}/system/template", headers=gm_headers
        )
        self.assertEqual(template.status_code, 200, template.text)
        self.assertEqual(template.json()["fields"][0]["key"], "forca")

        exported = self.client.get(
            f"/api/campaigns/{campaign_id}/system/export", headers=gm_headers
        )
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("attachment", exported.headers["content-disposition"])

        imported_campaign = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Costa Cinzenta", "display_name": "Mestre Ravi"},
        ).json()
        imported_id = imported_campaign["identity"]["campaign_id"]
        imported_headers = {"Authorization": f"Bearer {imported_campaign['access_token']}"}
        imported = self.client.post(
            f"/api/campaigns/{imported_id}/system/import",
            headers=imported_headers,
            files={"file": ("sistema.nephyrus.json", exported.content, "application/json")},
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        self.assertEqual(imported.json()["manifest"]["name"], manifest["name"])

        example = self.client.post(
            f"/api/campaigns/{imported_id}/system/template/example",
            headers=imported_headers,
        )
        self.assertEqual(example.status_code, 200, example.text)
        self.assertEqual(
            {field["field_type"] for field in example.json()["fields"]}, {"number"}
        )
        example_system = self.client.get(
            f"/api/campaigns/{imported_id}/system", headers=imported_headers
        )
        self.assertEqual(example_system.json()["manifest"]["license"], "CC0-1.0")
        self.assertEqual(len(example_system.json()["manifest"]["rolls"]), 2)

    def test_persistent_token_catalog_and_links(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Sentinelas do Vale", "display_name": "Mestre Lume"},
        ).json()
        campaign_id = created["identity"]["campaign_id"]
        gm_headers = {"Authorization": f"Bearer {created['access_token']}"}
        player = self.client.post(
            "/api/auth/join",
            json={"invite_code": created["invite_code"], "display_name": "Ravi"},
        ).json()
        player_headers = {"Authorization": f"Bearer {player['access_token']}"}

        uploaded = self.client.post(
            f"/api/campaigns/{campaign_id}/assets",
            headers=gm_headers,
            data={"kind": "token", "folder": "Tokens"},
            files={"file": ("vigia.png", b"imagem-token", "image/png")},
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)

        source = BytesIO()
        pdf = canvas.Canvas(source)
        pdf.drawString(72, 780, "Ficha de Ravi")
        pdf.showPage()
        pdf.save()
        sheet = self.client.post(
            f"/api/campaigns/{campaign_id}/sheets",
            headers=gm_headers,
            data={
                "owner_id": player["identity"]["member_id"],
                "title": "Ficha de Ravi",
            },
            files={"file": ("ravi.pdf", source.getvalue(), "application/pdf")},
        )
        self.assertEqual(sheet.status_code, 201, sheet.text)

        catalog_token = self.client.post(
            f"/api/campaigns/{campaign_id}/tokens",
            headers=gm_headers,
            json={
                "name": "Vigia",
                "image_url": uploaded.json()["url"],
                "sheet_id": sheet.json()["id"],
            },
        )
        self.assertEqual(catalog_token.status_code, 201, catalog_token.text)
        token = catalog_token.json()
        self.assertIsNone(token["scene_id"])
        self.assertEqual(token["owner_id"], player["identity"]["member_id"])
        self.assertEqual(token["owner_name"], "Ravi")
        self.assertEqual(token["sheet_title"], "Ficha de Ravi")
        self.assertEqual(token["image_url"], uploaded.json()["url"])

        player_list = self.client.get(
            f"/api/campaigns/{campaign_id}/tokens", headers=player_headers
        )
        self.assertEqual(player_list.status_code, 200, player_list.text)
        self.assertEqual([item["id"] for item in player_list.json()], [token["id"]])

        forbidden = self.client.post(
            f"/api/campaigns/{campaign_id}/tokens",
            headers=player_headers,
            json={"name": "Não autorizado"},
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        other = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Outra Companhia", "display_name": "Mestre Nox"},
        ).json()
        other_headers = {"Authorization": f"Bearer {other['access_token']}"}
        other_id = other["identity"]["campaign_id"]
        foreign_asset = self.client.post(
            f"/api/campaigns/{other_id}/assets",
            headers=other_headers,
            data={"kind": "token", "folder": ""},
            files={"file": ("intruso.png", b"imagem-estranha", "image/png")},
        ).json()

        rejected = self.client.post(
            f"/api/campaigns/{campaign_id}/tokens",
            headers=gm_headers,
            json={"name": "Intruso", "image_url": foreign_asset["url"]},
        )
        self.assertEqual(rejected.status_code, 422, rejected.text)

        isolated = self.client.patch(
            f"/api/tokens/{token['id']}",
            headers=other_headers,
            json={"name": "Roubo"},
        )
        self.assertEqual(isolated.status_code, 404, isolated.text)

    def test_player_places_and_gm_transfers_owned_token(self) -> None:
        created = self.client.post(
            "/api/auth/campaigns",
            json={"campaign_name": "Rotas do Norte", "display_name": "Mestre Ivo"},
        ).json()
        campaign_id = created["identity"]["campaign_id"]
        gm_headers = {"Authorization": f"Bearer {created['access_token']}"}
        player = self.client.post(
            "/api/auth/join",
            json={"invite_code": created["invite_code"], "display_name": "Nara"},
        ).json()
        active = self.client.get(
            f"/api/campaigns/{campaign_id}/scene", headers=gm_headers
        ).json()
        reserve = scene_service.create_scene(campaign_id, "Reserva", None)
        catalog_token = self.client.post(
            f"/api/campaigns/{campaign_id}/tokens",
            headers=gm_headers,
            json={
                "name": "Nara",
                "owner_id": player["identity"]["member_id"],
                "width": 72,
                "height": 72,
            },
        ).json()

        with self.client.websocket_connect(f"/ws?token={created['access_token']}") as gm_ws:
            self.assertEqual(gm_ws.receive_json()["type"], "presence:list")
            with self.client.websocket_connect(f"/ws?token={player['access_token']}") as player_ws:
                self.assertEqual(player_ws.receive_json()["type"], "presence:list")
                self.assertEqual(gm_ws.receive_json()["type"], "presence:list")

                gm_ws.send_json({"type": "scene:request", "payload": {}})
                self.assertEqual(gm_ws.receive_json()["type"], "scene:state")
                self.assertEqual(gm_ws.receive_json()["type"], "scene:list")
                player_ws.send_json({"type": "scene:request", "payload": {}})
                self.assertEqual(player_ws.receive_json()["type"], "scene:state")

                player_ws.send_json(
                    {
                        "type": "token:place",
                        "payload": {
                            "token_id": catalog_token["id"],
                            "scene_id": active["id"],
                            "x": 128,
                            "y": 192,
                        },
                    }
                )
                player_added = player_ws.receive_json()
                self.assertEqual(player_added["type"], "token:add")
                gm_added = gm_ws.receive_json()
                self.assertEqual(gm_added["type"], "token:add")
                self.assertEqual(player_added["payload"]["scene_id"], active["id"])
                self.assertEqual(player_ws.receive_json()["type"], "token:catalog_update")
                self.assertEqual(gm_ws.receive_json()["type"], "token:catalog_update")

                gm_ws.send_json(
                    {
                        "type": "scene:request",
                        "payload": {"scene_id": reserve.id},
                    }
                )
                self.assertEqual(gm_ws.receive_json()["type"], "scene:state")
                self.assertEqual(gm_ws.receive_json()["type"], "scene:list")

                gm_ws.send_json(
                    {
                        "type": "token:place",
                        "payload": {
                            "token_id": catalog_token["id"],
                            "scene_id": reserve.id,
                            "x": 64,
                            "y": 64,
                        },
                    }
                )
                player_removed = player_ws.receive_json()
                gm_transferred = gm_ws.receive_json()
                self.assertEqual(player_removed["type"], "token:remove")
                self.assertEqual(
                    player_removed["payload"]["token_id"], catalog_token["id"]
                )
                self.assertEqual(gm_transferred["type"], "token:add")
                self.assertEqual(gm_transferred["payload"]["scene_id"], reserve.id)

        persisted = scene_service.get_campaign_token(campaign_id, catalog_token["id"])
        self.assertIsNotNone(persisted)
        assert persisted is not None
        self.assertEqual(persisted.scene_id, reserve.id)
        self.assertEqual((persisted.x, persisted.y), (64.0, 64.0))


if __name__ == "__main__":
    unittest.main()
