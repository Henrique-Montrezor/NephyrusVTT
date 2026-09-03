# Character, Token, and Scene Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver persistent multi-sheet characters, staged tokens and maps, drag-and-drop placement, initiative ordering, and spacious configuration modals.

**Architecture:** Extend the existing SQLite models with three compact JSON/state fields and reuse current REST, WebSocket, library, modal, Pixi, and PDF editor flows. Character configuration remains REST-driven; live scene state remains WebSocket-driven. UI panels become lightweight collections that open focused modal workspaces.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, SQLite, Preact Signals, TypeScript, PixiJS, Vitest, Python unittest.

**Spec:** `docs/superpowers/specs/2026-09-02-character-token-scene-workspace-design.md`

## Global Constraints

- Do not add dependencies.
- Preserve existing campaigns through additive SQLite migrations and safe defaults.
- Persist movement, resizing, stage, initiative, and ordering automatically when the interaction ends.
- A player may control only tokens linked to their own sheets; the Mestre controls all tokens.
- Keep the Tokens panel scoped to the open scene.
- Every drag-and-drop action must have a button alternative and keyboard-visible focus.
- Suggested token names must remove `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.avif` case-insensitively.
- Do not add generated databases, uploaded files, Python bytecode, or build output to commits.

---

### Task 1: Persist staged character, token, and map state

**Files:**
- Modify: `backend/models/character_sheet.py`
- Modify: `backend/models/token.py`
- Modify: `backend/models/scene.py`
- Modify: `backend/database.py`
- Modify: `backend/schemas/character_sheet.py`
- Modify: `backend/schemas/scene.py`
- Test: `tests/test_database_migrations.py`

**Interfaces:**
- Produces: `TokenStageOut { id: str; name: str; image_url: str; order: int }`.
- Produces: `MapStageOut { id: str; name: str; image_url: str; order: int }`.
- Extends `CharacterSheetOut.token_stages`, `TokenOut.active_stage`, `TokenOut.initiative`, `TokenOut.sort_order`, `SceneOut.map_stages`, and `SceneOut.active_map_stage`.

- [ ] **Step 1: Write failing migration and schema tests**

```python
def test_workspace_state_migration_adds_stage_and_initiative_columns(self):
    with self.engine.begin() as connection:
        _migrate_workspace_state(connection)
        token_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(tokens)")}
        scene_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(scenes)")}
        sheet_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(character_sheets)")}
    self.assertTrue({"active_stage", "initiative", "sort_order"} <= token_columns)
    self.assertTrue({"map_stages_json", "active_map_stage"} <= scene_columns)
    self.assertIn("token_stages_json", sheet_columns)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `.venv/Scripts/python.exe -m unittest tests.test_database_migrations.DatabaseMigrationTest.test_workspace_state_migration_adds_stage_and_initiative_columns -v`

Expected: FAIL because `_migrate_workspace_state` does not exist.

- [ ] **Step 3: Add minimal model fields and migration**

```python
# character_sheet.py
token_stages_json: Mapped[str] = mapped_column(Text, default="[]")

# token.py
active_stage: Mapped[int] = mapped_column(Integer, default=0)
initiative: Mapped[int] = mapped_column(Integer, default=0)
sort_order: Mapped[int] = mapped_column(Integer, default=0)

# scene.py
map_stages_json: Mapped[str] = mapped_column(Text, default="[]")
active_map_stage: Mapped[int] = mapped_column(Integer, default=0)
```

Implement `_migrate_workspace_state(connection)` with `PRAGMA table_info` and one `ALTER TABLE ... ADD COLUMN` per missing column, then call it from the existing startup migration path.

- [ ] **Step 4: Extend response schemas with safe defaults**

```python
class TokenStageOut(BaseModel):
    id: str
    name: str
    image_url: str
    order: int = Field(ge=0)

class MapStageOut(TokenStageOut):
    pass
```

- [ ] **Step 5: Run migration and existing tests**

Run: `.venv/Scripts/python.exe -m unittest tests.test_database_migrations -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/models backend/database.py backend/schemas tests/test_database_migrations.py
git commit -m "feat: persist staged workspace state"
```

### Task 2: Create sheets from the campaign model and support Mestre ownership

**Files:**
- Modify: `backend/services/character_sheet_service.py`
- Modify: `backend/controllers/character_sheet_controller.py`
- Modify: `backend/schemas/character_sheet.py`
- Modify: `frontend-react/src/net/rest.ts`
- Test: `tests/test_auth_flow.py`

**Interfaces:**
- Produces: `POST /api/campaigns/{campaign_id}/sheets/from-template` with `{ owner_id, title }`.
- Produces: `PUT /api/sheets/{sheet_id}/token-stages` with `{ stages: TokenStageOut[] }`.
- Produces: `SheetClient.createFromTemplate(ownerId, title)` and `SheetClient.saveTokenStages(sheetId, stages)`.

- [ ] **Step 1: Write failing API tests**

```python
def test_gm_can_own_sheet_and_build_it_from_campaign_template(self):
    campaign, gm_headers = self.create_campaign("Mestre")
    template = self.create_example_template(campaign, gm_headers)
    owners = self.client.get(f"/api/campaigns/{campaign}/sheet-owners", headers=gm_headers).json()
    gm = next(owner for owner in owners if owner["display_name"] == "Mestre")
    response = self.client.post(
        f"/api/campaigns/{campaign}/sheets/from-template",
        headers=gm_headers,
        json={"owner_id": gm["id"], "title": "Oráculo"},
    )
    self.assertEqual(response.status_code, 201)
    self.assertEqual(response.json()["owner_id"], gm["id"])
    self.assertEqual(response.json()["values"], {})
    self.assertEqual(response.json()["fields"], template["fields"])
```

- [ ] **Step 2: Verify RED**

Run: `.venv/Scripts/python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_gm_can_own_sheet_and_build_it_from_campaign_template -v`

Expected: FAIL because owners currently exclude the Mestre and the route is absent.

- [ ] **Step 3: Include active campaign members of both roles in owners**

Change `list_owners()` to filter only by campaign and active state, ordering the Mestre first and then by display name.

- [ ] **Step 4: Implement template duplication**

```python
def create_sheet_from_template(campaign_id: str, owner_id: str, title: str) -> CharacterSheetOut:
    template = get_campaign_template(campaign_id)
    if template is None:
        raise SheetError("a campanha ainda não possui modelo de ficha")
    source = Path(template.source_path)
    return create_sheet(campaign_id, owner_id, title, template.source_name, source.read_bytes())
```

Copy the model PDF through the existing private sheet storage path and keep values empty.

- [ ] **Step 5: Add token stage validation and save route**

Validate at most 12 stages, unique IDs, non-empty names, campaign-local `/storage/` image URLs, sequential order, and Mestre-only configuration. Serialize with `ensure_ascii=False`.

- [ ] **Step 6: Add REST client methods and run tests**

Run: `.venv/Scripts/python.exe -m unittest tests.test_auth_flow -v`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/services/character_sheet_service.py backend/controllers/character_sheet_controller.py backend/schemas/character_sheet.py frontend-react/src/net/rest.ts tests/test_auth_flow.py
git commit -m "feat: build character sheets from campaign model"
```

### Task 3: Synchronize live token state, stage, initiative, and order

**Files:**
- Modify: `backend/services/scene_service.py`
- Modify: `backend/network/handlers/token.py`
- Modify: `backend/schemas/scene.py`
- Modify: `frontend-react/src/net/message-types.ts`
- Modify: `frontend-react/src/net/types.ts`
- Modify: `frontend-react/src/session/table-controller.ts`
- Test: `tests/test_auth_flow.py`

**Interfaces:**
- Extends existing `token:update` payload with `active_stage`, `initiative`, and `sort_order`.
- Produces: `token:order` payload `{ scene_id: number; token_ids: number[] }`.
- Produces: `TableController.setTokenStage(id, stage)`, `setTokenInitiative(id, initiative)`, and `reorderTokens(ids)`.

- [ ] **Step 1: Write failing permission and persistence tests**

```python
def test_owned_token_stage_size_position_and_initiative_persist(self):
    moved = scene_service.move_token(
        token_id=self.staged_token_id,
        x=320,
        y=192,
        user_id=self.staged_token_owner_id,
        is_gm=False,
    )
    updated = scene_service.update_token(
        TokenUpdateIn(
            token_id=self.staged_token_id,
            width=96,
            height=96,
            active_stage=1,
            initiative=17,
        ),
        user_id=self.staged_token_owner_id,
        is_gm=False,
    )
    self.assertIsNotNone(updated)
    saved = scene_service.get_campaign_token(self.staged_campaign_id, self.staged_token_id)
    self.assertEqual((saved.x, saved.y), (320, 192))
    self.assertEqual((saved.width, saved.height), (96, 96))
    self.assertEqual(saved.active_stage, 1)
    self.assertEqual(saved.initiative, 17)
    self.assertTrue(saved.image_url.endswith("battle.png"))
```

Create the campaign, two-stage sheet, and linked token in the test immediately before this assertion block using the existing HTTP setup pattern from `test_player_places_and_gm_transfers_owned_token`.

- [ ] **Step 2: Verify RED**

Run the named unittest and confirm missing response fields or rejected payload.

- [ ] **Step 3: Extend update service atomically**

Resolve `active_stage` against the linked sheet's stages. Reject out-of-range stages and replace `token.image_url` with the selected stage image. Clamp dimensions to `8..2048`, initiative to `-999..999`, and sort order to non-negative integers.

- [ ] **Step 4: Implement scene-scoped reorder**

Require the supplied IDs to match the controllable scene token set for the acting Mestre. Save `sort_order` according to array index and broadcast updated tokens once.

- [ ] **Step 5: Wire frontend controller methods**

```ts
setTokenStage(tokenId: number, activeStage: number): void {
  this.updateToken(tokenId, { active_stage: activeStage });
}

setTokenInitiative(tokenId: number, initiative: number): void {
  this.updateToken(tokenId, { initiative });
}
```

- [ ] **Step 6: Run backend and TypeScript checks**

Run: `.venv/Scripts/python.exe -m unittest tests.test_auth_flow -v`

Run: `npm --prefix frontend-react run typecheck`

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/services/scene_service.py backend/network/handlers/token.py backend/schemas/scene.py frontend-react/src/net frontend-react/src/session/table-controller.ts tests/test_auth_flow.py
git commit -m "feat: synchronize token stage and initiative"
```

### Task 4: Restore intentional drag-and-drop placement and normalize names

**Files:**
- Create: `frontend-react/src/features/tokens/token-dnd.ts`
- Create: `frontend-react/src/features/tokens/token-dnd.test.ts`
- Modify: `frontend-react/src/features/tokens/token-flow.ts`
- Modify: `frontend-react/src/features/tokens/token-flow.test.ts`
- Modify: `frontend-react/src/engine/react/TableStage.tsx`
- Modify: `frontend-react/src/engine/table-engine.ts`
- Modify: `frontend-react/src/session/table-controller.ts`
- Modify: `frontend-react/src/features/library/LibraryPane.tsx`

**Interfaces:**
- Produces: `cleanAssetName(name: string): string`.
- Produces: drag payload `{ source: "catalog" | "asset"; id?: number; name?: string; imageUrl?: string }`.
- Produces: `TableController.enginePointFromClient(clientX, clientY)`.

- [ ] **Step 1: Write failing helper tests**

```ts
it.each(["hero.png", "hero.JPG", "hero.jpeg", "hero.webp"])("removes image extension from %s", (name) => {
  expect(cleanAssetName(name)).toBe("hero");
});

it("round-trips the typed token drag payload", () => {
  const transfer = new DataTransfer();
  writeTokenDrag(transfer, { source: "asset", name: "Hero", imageUrl: "/storage/hero.png" });
  expect(readTokenDrag(transfer)?.source).toBe("asset");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix frontend-react test -- --run src/features/tokens/token-flow.test.ts src/features/tokens/token-dnd.test.ts`

Expected: FAIL because helpers are absent.

- [ ] **Step 3: Implement minimal helpers with one custom MIME type**

```ts
export const cleanAssetName = (name: string) =>
  name.replace(/\.(png|jpe?g|webp|gif|avif)$/i, "");
```

Serialize and parse only `application/x-nephyrus-token`; reject malformed payloads.

- [ ] **Step 4: Reintroduce map drop using real canvas coordinates**

For catalog payloads, call `placeToken`. For asset payloads, create the catalog token with the normalized name, then place it. Keep the existing click alternative `Adicionar à cena`.

- [ ] **Step 5: Make Library token cards draggable**

Set `draggable={asset.kind === "token"}` and write the asset payload on `dragstart`. Use `cleanAssetName()` for both button and drop creation paths.

- [ ] **Step 6: Verify GREEN and typecheck**

Run the focused Vitest command, then `npm --prefix frontend-react run typecheck`.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/features/tokens frontend-react/src/features/library/LibraryPane.tsx frontend-react/src/engine frontend-react/src/session/table-controller.ts
git commit -m "feat: drag tokens from library to map"
```

### Task 5: Replace the sheet selector with a multi-sheet card workspace

**Files:**
- Create: `frontend-react/src/features/sheet/SheetWorkspaceModal.tsx`
- Modify: `frontend-react/src/features/sheet/SheetPane.tsx`
- Modify: `frontend-react/src/features/sheet/SheetTokenPanel.tsx`
- Modify: `frontend-react/src/ui/modal.tsx`
- Modify: `frontend-react/src/styles/index.css`
- Test: `frontend-react/src/features/tokens/token-flow.test.ts`

**Interfaces:**
- Consumes: `SheetClient.createFromTemplate()` and `saveTokenStages()` from Task 2.
- Consumes: typed catalog drag payload from Task 4.
- Produces: `openSheetWorkspace(sheetId, initialTab)` with tabs `info | sheet | token`.

- [ ] **Step 1: Add a failing pure view-model test**

```ts
it("keeps multiple sheets per owner and links each token by sheet id", () => {
  const sheets = [
    { id: "a", owner_id: "player-1", title: "Heroína" },
    { id: "b", owner_id: "player-1", title: "Familiar" },
  ] as CharacterSheetOut[];
  const tokens = [{ id: 9, sheet_id: "b", name: "Corvo" }] as TokenCatalogItem[];
  expect(sheetCards(sheets, tokens).map(({ sheet, token }) => [sheet.id, token?.id])).toEqual([
    ["a", undefined],
    ["b", 9],
  ]);
});
```

- [ ] **Step 2: Verify RED, then add the minimal view-model helper**

Run the focused Vitest test until it fails because `sheetCards` is absent; add the helper and confirm it passes.

- [ ] **Step 3: Render a card collection**

Each card displays title, owner, token thumbnail, last update, `Abrir ficha`, and an icon-labelled `Configurar`. Do not keep a global selected-sheet dropdown.

- [ ] **Step 4: Add creation actions**

`Montar com modelo da mesa` opens a compact owner/title modal and calls `createFromTemplate`. `Importar PDF` opens the existing upload controls. The owner list includes the Mestre.

- [ ] **Step 5: Move sheet content into the wide modal**

Reuse current Info field form, PDF viewer, and `SheetTokenPanel`. Add a modal size option `className: "modal-sheet-workspace"` rather than a second modal system.

- [ ] **Step 6: Add the character stage strip**

For the Mestre, add/reorder/remove up to 12 Library token images and save automatically with a 250 ms debounce. For all users, show numbered stage buttons. Make the linked token/card draggable and retain `Colocar na cena aberta`.

- [ ] **Step 7: Add responsive and accessible styling**

Use the established Nephyrus surfaces; make the stage filmstrip the one strong visual signature. Modal becomes full-screen below 720 px. Ensure 44 px actions and `:focus-visible` states.

- [ ] **Step 8: Verify**

Run: `npm --prefix frontend-react test -- --run`

Run: `npm --prefix frontend-react run typecheck`

- [ ] **Step 9: Commit**

```bash
git add frontend-react/src/features/sheet frontend-react/src/ui/modal.tsx frontend-react/src/styles/index.css frontend-react/src/features/tokens/token-flow.test.ts
git commit -m "feat: add multi-sheet character workspace"
```

### Task 6: Add persistent token queue, initiative, and stage controls

**Files:**
- Modify: `frontend-react/src/features/tokens/TokensPane.tsx`
- Modify: `frontend-react/src/features/tokens/token-flow.ts`
- Modify: `frontend-react/src/features/tokens/token-flow.test.ts`
- Modify: `frontend-react/src/styles/index.css`

**Interfaces:**
- Consumes: live token methods from Task 3.
- Produces: `reorder<T>(items: T[], from: number, to: number): T[]`.

- [ ] **Step 1: Write failing reorder and initiative-sort tests**

```ts
expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
expect(sortInitiative([{ id: 1, initiative: 10, sort_order: 1 }, { id: 2, initiative: 10, sort_order: 0 }]).map(x => x.id)).toEqual([2, 1]);
```

- [ ] **Step 2: Verify RED, implement helpers, verify GREEN**

Use immutable array operations; sort by initiative descending, then manual order ascending.

- [ ] **Step 3: Make rows reorderable with button alternatives**

Native drag-and-drop updates local order and calls `reorderTokens`. Add `Mover para cima` and `Mover para baixo` icon actions for keyboard/touch.

- [ ] **Step 4: Add initiative editing**

`Definir iniciativa` toggles compact number inputs for current-scene tokens. Save on blur/Enter through `setTokenInitiative`.

- [ ] **Step 5: Add selected-token stage controls**

When a linked token is selected, show numbered buttons from its sheet stages; call `setTokenStage` and reflect the new image from the broadcast.

- [ ] **Step 6: Verify and commit**

Run Vitest, typecheck, and build. Commit as `feat: organize scene tokens and initiative`.

### Task 7: Move scene controls into settings and add map stages

**Files:**
- Create: `frontend-react/src/features/scene/SceneSettingsModal.tsx`
- Modify: `frontend-react/src/features/scene/ScenePane.tsx`
- Modify: `frontend-react/src/net/rest.ts`
- Modify: `frontend-react/src/session/table-controller.ts`
- Modify: `backend/controllers/scene_controller.py`
- Modify: `backend/services/scene_service.py`
- Modify: `backend/schemas/scene.py`
- Modify: `frontend-react/src/styles/index.css`
- Test: `tests/test_auth_flow.py`

**Interfaces:**
- Produces: `PUT /api/scenes/{scene_id}/map-stages` with stages and active index.
- Produces: `TableController.setMapStage(sceneId, activeStage)`.

- [ ] **Step 1: Write failing API test for map stages**

```python
response = self.client.put(
    f"/api/scenes/{scene_id}/map-stages",
    headers=gm_headers,
    json={
        "active_map_stage": 1,
        "stages": [
            {"id": "normal", "name": "Normal", "image_url": normal_url, "order": 0},
            {"id": "ruins", "name": "Destruído", "image_url": ruins_url, "order": 1},
        ],
    },
)
self.assertEqual(response.status_code, 200, response.text)
reloaded = self.client.get(f"/api/campaigns/{campaign_id}/scene", headers=gm_headers).json()
self.assertEqual(reloaded["active_map_stage"], 1)
self.assertEqual(reloaded["background_url"], ruins_url)
self.assertEqual([stage["id"] for stage in reloaded["map_stages"]], ["normal", "ruins"])
```

- [ ] **Step 2: Verify RED and implement the validated service/route**

Validate at most 12 campaign-local image URLs and sequential order. Setting the active stage also sets `scene.background_url` in the same transaction and broadcasts scene state.

- [ ] **Step 3: Simplify ScenePane**

Remove inline Movement and Grid cards. Add one labelled gear button `Configurar cena atual`; retain scene cards and move/open/publish actions.

- [ ] **Step 4: Build the settings modal from existing controls**

Move the current snap, grid, meters, and resize controls without duplicating logic. Add Library map picker and the same reorderable stage filmstrip used conceptually by characters.

- [ ] **Step 5: Verify and commit**

Run the focused backend test, full frontend typecheck, and commit as `feat: configure staged scene maps`.

### Task 8: Open the campaign sheet model in a visual configurator modal

**Files:**
- Create: `frontend-react/src/features/system/SystemConfiguratorModal.tsx`
- Modify: `frontend-react/src/features/system/SystemPane.tsx`
- Modify: `frontend-react/src/features/sheet/SheetEditor.tsx`
- Modify: `frontend-react/src/styles/index.css`
- Test: `frontend-react/src/features/tokens/token-flow.test.ts`

**Interfaces:**
- Consumes: existing `GameSystemClient`, `SheetClient`, PDF renderer, and field editor.
- Produces: overview action `Configurar modelo` and explicit mapped/unmapped field presentation.

- [ ] **Step 1: Write failing field partition test**

```ts
const { mapped, unmapped } = partitionPdfFields(fields);
expect(mapped.map(x => x.key)).toEqual(["forca"]);
expect(unmapped.map(x => x.key)).toEqual(["untitled1"]);
```

Treat a field as mapped only when width and height are positive and its label is not an autogenerated `untitledN` name.

- [ ] **Step 2: Verify RED, add helper, verify GREEN**

Keep the rule pure and local; no PDF heuristics in rendering components.

- [ ] **Step 3: Reduce SystemPane to an overview**

Show model name, page count, mapped attribute count, roll count, `Configurar modelo`, `Trocar PDF`, and `Usar ficha de exemplo` when empty.

- [ ] **Step 4: Build the wide configurator**

Reuse `SheetEditor` for PDF pages and rectangle overlays. Place mapped attributes in a clear side rail and unmapped AcroForm items in a collapsed section. Each mapped field exposes type, public flag, `Usado em rolagem`, and die selector.

- [ ] **Step 5: Save one coherent manifest**

Generate rolls only for fields marked for rolling. Preserve system metadata and base sheet ID. Show the live example `FOR = 2 → 2d20` beside the selected attribute.

- [ ] **Step 6: Verify and commit**

Run Vitest, typecheck, build, and commit as `refactor: open sheet model in visual configurator`.

### Task 9: End-to-end verification and delivery

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified build in the main checkout.

- [ ] **Step 1: Run complete automated verification**

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
& '.\.venv\Scripts\python.exe' -m unittest discover -s tests -v
npm --prefix frontend-react test -- --run
npm --prefix frontend-react run typecheck
npm --prefix frontend-react run build
```

- [ ] **Step 2: Run browser QA against a temporary database**

Validate: Mestre owns a sheet; two sheets share one owner; create from model; open sheet/config modals; add/reorder/switch token stages; drag from sheet and Library; move/resize and reload; set/reorder initiative; open scene settings; add/switch map stages; configure PDF fields; narrow mobile viewport.

- [ ] **Step 3: Inspect console and repository state**

Require no new browser errors. Confirm only intended source/tests/docs are tracked and user database/storage changes remain untouched.

- [ ] **Step 4: Commit any QA fixes separately**

Use `fix:` commits scoped to the verified defect; rerun the affected check and then the full suite.
