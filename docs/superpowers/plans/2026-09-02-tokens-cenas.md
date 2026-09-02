# Tokens e Cenas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar tokens personalizados persistentes, vinculados a fichas e jogadores, com drag and drop entre cenas e direção individual ou coletiva dos participantes.

**Architecture:** `Token` torna-se uma entidade da campanha com cena opcional, enquanto `CampaignMember.current_scene_id` guarda apenas desvios da cena padrão. REST gerencia o catálogo e os vínculos; WebSocket mantém colocação, transferência, movimento, redimensionamento e troca de cena em tempo real. O frontend separa catálogo de tokens do estado renderizado da cena e usa um MIME interno para drag and drop sobre o canvas PixiJS.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, Pydantic, WebSocket, Preact Signals, PixiJS, TypeScript, Vitest, Testing Library e CSS nativo.

**Spec:** `docs/superpowers/specs/2026-09-02-tokens-cenas-design.md`

## Global Constraints

- Um token existe em no máximo uma cena.
- Jogadores controlam somente tokens cujo `owner_id` corresponde ao participante autenticado.
- O jogador só pode colocar tokens na própria cena efetiva.
- Ficha, asset, responsável, token e cena sempre pertencem à mesma campanha.
- Apenas o Mestre cria, exclui, retira ou reatribui tokens.
- Apenas o Mestre move participantes ou altera a cena padrão.
- Preparar uma cena não move jogadores.
- Não retomar o editor de modelo de ficha ou o sistema customizado de regras.
- Preservar a paleta, tipografia, escala de cantos e família Phosphor existentes.

---

## File map

### Backend

- `backend/models/token.py`: catálogo persistente e vínculos do token.
- `backend/models/campaign.py`: cena individual do participante.
- `backend/database.py`: migração idempotente do banco existente.
- `backend/schemas/scene.py`: contratos de token, catálogo, cenas e participantes.
- `backend/services/scene_service.py`: regras de catálogo, colocação e direção de cenas.
- `backend/controllers/token_controller.py`: REST do catálogo.
- `backend/network/handlers/token.py`: colocação e sincronização dos tokens.
- `backend/network/handlers/scene.py`: movimentação do grupo e de participantes.
- `backend/network/handlers/__init__.py`: autorização declarativa dos novos eventos.
- `backend/main.py`: registro do controller de tokens.
- `tests/test_database_migrations.py`: preservação de banco legado.
- `tests/test_auth_flow.py`: integração REST e WebSocket real.

### Frontend

- `frontend-react/src/net/rest.ts`: `TokenClient` e contratos REST.
- `frontend-react/src/net/types.ts`: payloads de catálogo, participantes e cenas.
- `frontend-react/src/net/message-types.ts`: novos envelopes WebSocket.
- `frontend-react/src/state/token-catalog-store.ts`: catálogo independente da cena renderizada.
- `frontend-react/src/session/table-controller.ts`: sincronização e colocação.
- `frontend-react/src/engine/table-engine.ts`: conversão de coordenada da tela para mundo.
- `frontend-react/src/engine/react/TableStage.tsx`: alvo de drop acessível.
- `frontend-react/src/features/tokens/token-dnd.ts`: formato interno do drag and drop.
- `frontend-react/src/features/tokens/TokensPane.tsx`: estante persistente.
- `frontend-react/src/features/tokens/TokenEditor.tsx`: editor do Mestre.
- `frontend-react/src/features/scene/ScenePane.tsx`: régua de direção.
- `frontend-react/src/styles/index.css`: estados responsivos e visuais.
- `frontend-react/src/**/*.test.ts(x)`: testes Vitest dos estados e interações.

---

### Task 1: Migrar tokens e participantes sem perda de dados

**Files:**
- Modify: `backend/models/token.py`
- Modify: `backend/models/campaign.py`
- Modify: `backend/database.py`
- Create: `tests/test_database_migrations.py`

**Interfaces:**
- Produces: `Token.campaign_id: str`, `Token.scene_id: int | None`, `Token.sheet_id: str | None`.
- Produces: `CampaignMember.current_scene_id: int | None`.
- Produces: `_migrate_token_catalog(connection: Connection) -> None`, idempotente.

- [ ] **Step 1: escrever o teste de migração legado**

Criar um SQLite temporário com as tabelas antigas `scenes`, `tokens` e `campaign_members`, inserir um token com largura, altura e imagem, executar `_migrate_token_catalog` e verificar os valores literais:

```python
def test_token_catalog_migration_preserves_existing_token(tmp_path: Path) -> None:
    legacy = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy.begin() as conn:
        conn.execute(text("CREATE TABLE scenes (id INTEGER PRIMARY KEY, campaign_id VARCHAR NOT NULL)"))
        conn.execute(text("CREATE TABLE campaign_members (id VARCHAR PRIMARY KEY, campaign_id VARCHAR NOT NULL)"))
        conn.execute(text("""CREATE TABLE tokens (
            id INTEGER PRIMARY KEY, scene_id INTEGER NOT NULL, name VARCHAR,
            image_url VARCHAR, x FLOAT, y FLOAT, size_squares FLOAT,
            width FLOAT, height FLOAT, layer VARCHAR, owner_id VARCHAR,
            is_hidden BOOLEAN, is_locked BOOLEAN, light_radius FLOAT,
            conditions VARCHAR
        )"""))
        conn.execute(text("INSERT INTO scenes VALUES (7, 'camp-a')"))
        conn.execute(text("INSERT INTO tokens VALUES (11, 7, 'Ravi', '/storage/token.png', 32, 64, 1, 96, 80, 'object', 'p1', 0, 0, 0, '')"))
        _migrate_token_catalog(conn)

    columns = {column["name"]: column for column in inspect(legacy).get_columns("tokens")}
    assert columns["scene_id"]["nullable"] is True
    with legacy.connect() as conn:
        row = conn.execute(text("SELECT campaign_id, scene_id, sheet_id, width, height FROM tokens WHERE id=11")).one()
    assert tuple(row) == ("camp-a", 7, None, 96.0, 80.0)
```

- [ ] **Step 2: executar o teste e confirmar RED**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_database_migrations -v`

Expected: erro de importação porque `_migrate_token_catalog` ainda não existe.

- [ ] **Step 3: implementar a migração mínima e os models**

Reconstruir `tokens` dentro da conexão recebida quando `campaign_id` não existir ou `scene_id` ainda for obrigatório. Copiar `campaign_id` via `JOIN scenes`, manter todos os campos existentes e recriar os índices `ix_tokens_campaign_id`, `ix_tokens_scene_id`, `ix_tokens_owner_id` e `ix_tokens_sheet_id`. Adicionar `current_scene_id` com `ALTER TABLE campaign_members ADD COLUMN` quando ausente.

No model:

```python
campaign_id: Mapped[str] = mapped_column(
    ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
)
scene_id: Mapped[int | None] = mapped_column(
    ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True, index=True
)
sheet_id: Mapped[str | None] = mapped_column(
    ForeignKey("character_sheets.id", ondelete="SET NULL"), nullable=True, index=True
)
```

- [ ] **Step 4: executar teste de migração e suíte existente**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_database_migrations -v`

Expected: PASS.

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: todos os testes existentes PASS.

- [ ] **Step 5: commit**

```bash
git add backend/models/token.py backend/models/campaign.py backend/database.py tests/test_database_migrations.py
git commit -m "feat: migrate tokens into campaign catalog"
```

---

### Task 2: Criar catálogo REST seguro de tokens

**Files:**
- Modify: `backend/schemas/scene.py`
- Modify: `backend/services/scene_service.py`
- Create: `backend/controllers/token_controller.py`
- Modify: `backend/main.py`
- Modify: `tests/test_auth_flow.py`

**Interfaces:**
- Produces: `TokenCatalogOut`, `TokenCreateIn`, `TokenCatalogUpdateIn`.
- Produces: `list_campaign_tokens(campaign_id, member_id, is_gm) -> list[TokenCatalogOut]`.
- Produces: `create_campaign_token(campaign_id, data) -> TokenCatalogOut | None`.
- Produces: `update_campaign_token(campaign_id, token_id, data) -> TokenCatalogOut | None`.
- Produces: REST `GET/POST /api/campaigns/{campaign_id}/tokens` e `PATCH/DELETE /api/tokens/{token_id}`.

- [ ] **Step 1: escrever testes de catálogo, imagem e vínculos**

Adicionar um teste integrado que cria duas campanhas, um asset `token`, uma ficha e um jogador. Verificar:

```python
created = client.post(
    f"/api/campaigns/{campaign_id}/tokens",
    headers=gm_headers,
    json={
        "name": "Vigia",
        "image_url": token_asset["url"],
        "sheet_id": sheet["id"],
    },
)
assert created.status_code == 201
assert created.json()["scene_id"] is None
assert created.json()["owner_id"] == player["identity"]["member_id"]

player_list = client.get(f"/api/campaigns/{campaign_id}/tokens", headers=player_headers)
assert [item["id"] for item in player_list.json()] == [created.json()["id"]]

foreign_image = client.post(
    f"/api/campaigns/{campaign_id}/tokens",
    headers=gm_headers,
    json={"name": "Intruso", "image_url": other_asset["url"]},
)
assert foreign_image.status_code == 422
```

Também verificar 403 para criação por jogador e 404 sem vazamento para edição de token de outra campanha.

- [ ] **Step 2: executar teste e confirmar RED**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_persistent_token_catalog_and_links -v`

Expected: FAIL 404 porque as rotas ainda não existem.

- [ ] **Step 3: implementar schemas, serviço e controller mínimos**

`TokenCatalogOut` deve incluir os campos atuais de `TokenOut` mais `campaign_id`, `scene_name`, `sheet_id`, `sheet_title` e `owner_name`. A listagem de jogador sempre filtra `Token.owner_id == member_id` no SQL. O serviço resolve ficha e owner no servidor e valida `asset_service.get_campaign_asset(campaign_id, url=image_url, kinds={KIND_TOKEN})`.

Erros do domínio devem ser convertidos em 422 para vínculo inválido, 403 para papel inadequado e 404 para objeto fora da campanha.

- [ ] **Step 4: executar teste focado e suíte**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_persistent_token_catalog_and_links -v`

Expected: PASS.

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: todos PASS.

- [ ] **Step 5: commit**

```bash
git add backend/schemas/scene.py backend/services/scene_service.py backend/controllers/token_controller.py backend/main.py tests/test_auth_flow.py
git commit -m "feat: add secure campaign token catalog"
```

---

### Task 3: Colocar e transferir tokens em tempo real

**Files:**
- Modify: `backend/services/scene_service.py`
- Modify: `backend/network/handlers/token.py`
- Modify: `backend/network/handlers/__init__.py`
- Modify: `tests/test_auth_flow.py`

**Interfaces:**
- Produces: `TokenPlaceIn(token_id, scene_id, x, y)`.
- Produces: `place_token(campaign_id, token_id, scene_id, x, y, member_id, is_gm) -> tuple[int | None, TokenOut] | None`.
- Produces: WebSocket `token:place` e `token:catalog_update`.

- [ ] **Step 1: escrever teste WebSocket de colocação e transferência**

Conectar Mestre e jogador, colocar um token próprio na cena A e transferi-lo para B. Verificar literalmente que A recebe remoção, B recebe adição e o banco mantém apenas um registro:

```python
player_ws.send_json({
    "type": "token:place",
    "payload": {"token_id": token_id, "scene_id": scene_a, "x": 128, "y": 192},
})
placed = player_ws.receive_json()
assert placed["type"] == "token:add"
assert placed["payload"]["scene_id"] == scene_a

gm_ws.send_json({
    "type": "token:place",
    "payload": {"token_id": token_id, "scene_id": scene_b, "x": 64, "y": 64},
})
removed = player_ws.receive_json()
assert removed == {"type": "token:remove", "payload": {"token_id": token_id}}
assert scene_service.get_campaign_token(campaign_id, token_id).scene_id == scene_b
```

Adicionar casos de jogador tentando colocar token alheio e tentando colocar o próprio token em cena diferente da cena efetiva; ambos retornam `error` sem mutação.

- [ ] **Step 2: executar teste e confirmar RED**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_player_places_and_transfers_owned_token -v`

Expected: resposta `unknown_type` para `token:place`.

- [ ] **Step 3: implementar colocação atômica**

O serviço deve carregar token e cena na mesma sessão, validar campanha, dono e cena efetiva, guardar `previous_scene_id`, atualizar `scene_id/x/y`, aplicar clamp e retornar ambos. O handler envia `token:remove` à cena anterior quando diferente, `token:add` à nova e `token:catalog_update` ao Mestre e ao dono.

Registrar `token:place` como evento permitido a jogadores, mantendo criação, remoção e reatribuição em `GM_ONLY_MESSAGE_TYPES`.

- [ ] **Step 4: executar teste focado e suíte**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_player_places_and_transfers_owned_token -v`

Expected: PASS.

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: todos PASS.

- [ ] **Step 5: commit**

```bash
git add backend/services/scene_service.py backend/network/handlers/token.py backend/network/handlers/__init__.py tests/test_auth_flow.py
git commit -m "feat: place and transfer owned tokens"
```

---

### Task 4: Direcionar grupo e jogadores para cenas

**Files:**
- Modify: `backend/schemas/scene.py`
- Modify: `backend/services/scene_service.py`
- Modify: `backend/network/handlers/scene.py`
- Modify: `backend/network/handlers/__init__.py`
- Modify: `backend/network/connection_manager.py`
- Modify: `frontend-react/src/net/types.ts`
- Modify: `tests/test_auth_flow.py`

**Interfaces:**
- Produces: `SceneParticipantOut(member_id, display_name, online)` em `SceneSummary.participants`.
- Produces: `set_default_scene(campaign_id, scene_id) -> SceneOut | None`.
- Produces: `assign_members_to_scene(campaign_id, scene_id, member_ids) -> list[str]`.
- Produces: WebSocket `scene:move_group` e `scene:move_members`.

- [ ] **Step 1: escrever teste de grupo, indivíduo e preparação**

Criar duas cenas e dois jogadores. Verificar que `scene:request` do Mestre abre a cena B sem alterar jogadores; depois mover somente jogador 1 e finalmente o grupo:

```python
gm_ws.send_json({"type": "scene:request", "payload": {"scene_id": scene_b}})
assert gm_ws.receive_json()["payload"]["id"] == scene_b
assert scene_service.effective_scene_id(campaign_id, player_1_id) == scene_a

gm_ws.send_json({
    "type": "scene:move_members",
    "payload": {"scene_id": scene_b, "member_ids": [player_1_id]},
})
assert player_1_ws.receive_json()["payload"]["id"] == scene_b
assert scene_service.effective_scene_id(campaign_id, player_2_id) == scene_a

gm_ws.send_json({"type": "scene:move_group", "payload": {"scene_id": scene_b}})
assert scene_service.effective_scene_id(campaign_id, player_1_id) == scene_b
assert scene_service.effective_scene_id(campaign_id, player_2_id) == scene_b
```

Verificar que jogador recebe `gm_only` ao emitir os dois eventos e que IDs de outra campanha são ignorados sem vazamento.

- [ ] **Step 2: executar teste e confirmar RED**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_gm_moves_group_or_selected_members_between_scenes -v`

Expected: `unknown_type` para `scene:move_members`.

- [ ] **Step 3: implementar resolução de cena e broadcasts direcionados**

`effective_scene_id` retorna `current_scene_id` válido ou a cena `is_active`. `scene:move_group` chama `set_default_scene`, limpa `current_scene_id` de jogadores e envia o estado a todas as conexões da campanha. `scene:move_members` atualiza somente membros ativos da campanha e usa `manager.send_to_user` para todas as sessões de cada um.

`list_scenes` deve calcular participantes efetivos, incluindo jogadores offline, e marcar `online` a partir do roster recebido pelo handler antes de serializar. Ao excluir cena, deixar seus tokens disponíveis e limpar atribuições antes de escolher a cena padrão resultante.

- [ ] **Step 4: executar teste focado e suíte**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_auth_flow.AuthFlowTest.test_gm_moves_group_or_selected_members_between_scenes -v`

Expected: PASS.

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: todos PASS.

- [ ] **Step 5: commit**

```bash
git add backend/schemas/scene.py backend/services/scene_service.py backend/network/handlers/scene.py backend/network/handlers/__init__.py backend/network/connection_manager.py frontend-react/src/net/types.ts tests/test_auth_flow.py
git commit -m "feat: direct groups and players between scenes"
```

---

### Task 5: Preparar estado frontend e drag and drop do canvas

**Files:**
- Modify: `frontend-react/package.json`
- Modify: `frontend-react/package-lock.json`
- Modify: `frontend-react/src/net/rest.ts`
- Modify: `frontend-react/src/net/types.ts`
- Modify: `frontend-react/src/net/message-types.ts`
- Create: `frontend-react/src/state/token-catalog-store.ts`
- Create: `frontend-react/src/state/token-catalog-store.test.ts`
- Create: `frontend-react/src/features/tokens/token-dnd.ts`
- Create: `frontend-react/src/features/tokens/token-dnd.test.ts`
- Modify: `frontend-react/src/session/table-controller.ts`
- Modify: `frontend-react/src/engine/table-engine.ts`
- Modify: `frontend-react/src/engine/react/TableStage.tsx`

**Interfaces:**
- Produces: `TokenClient.list/create/update/remove`.
- Produces: `campaignTokens`, `replaceCampaignTokens`, `upsertCampaignToken`.
- Produces: `TOKEN_DRAG_MIME = "application/x-nephyrus-token"`.
- Produces: `encodeTokenDrag(id)`, `decodeTokenDrag(value)`.
- Produces: `TableEngine.clientToWorld(clientX, clientY) -> {x, y}`.
- Consumes: REST e eventos das Tasks 2 a 4.

- [ ] **Step 1: instalar runner de teste frontend**

Run:

```bash
npm --prefix frontend-react install --save-dev vitest jsdom @testing-library/preact
```

Adicionar scripts `test` e `test:run` usando `vitest` e `vitest run`.

- [ ] **Step 2: escrever testes de agrupamento e payload de drag**

```ts
it("separa tokens colocados e disponíveis", () => {
  const grouped = groupCampaignTokens([
    { id: 1, scene_id: 9, owner_id: "p1" },
    { id: 2, scene_id: null, owner_id: "p1" },
  ] as TokenCatalogItem[], 9);
  expect(grouped.inScene.map((token) => token.id)).toEqual([1]);
  expect(grouped.available.map((token) => token.id)).toEqual([2]);
});

it("aceita somente ids inteiros positivos no drop", () => {
  expect(decodeTokenDrag(encodeTokenDrag(27))).toBe(27);
  expect(decodeTokenDrag('{"tokenId":0}')).toBeNull();
  expect(decodeTokenDrag('arquivo externo')).toBeNull();
});
```

- [ ] **Step 3: executar testes e confirmar RED**

Run: `npm --prefix frontend-react run test:run`

Expected: FAIL porque módulos e funções não existem.

- [ ] **Step 4: implementar store, clientes e alvo de drop**

Adicionar `clientToWorld` usando o retângulo do canvas e `world.toLocal`:

```ts
clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = this.app.canvas.getBoundingClientRect();
  const global = new Point(clientX - rect.left, clientY - rect.top);
  const local = this.world.toLocal(global);
  return { x: local.x, y: local.y };
}
```

`TableStage` aceita somente `TOKEN_DRAG_MIME`, mostra estado `is-token-drop-target` durante `dragover` e chama `session.value?.table.placeToken(tokenId, sceneMeta.value.sceneId, x, y)` no drop. O controller solicita o catálogo ao iniciar e aplica `token:catalog_update` sem misturar tokens fora da cena ao store Pixi.

- [ ] **Step 5: executar testes, typecheck e build**

Run: `npm --prefix frontend-react run test:run`

Expected: PASS.

Run: `npm --prefix frontend-react run typecheck`

Expected: PASS.

Run: `npm --prefix frontend-react run build`

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add frontend-react/package.json frontend-react/package-lock.json frontend-react/src/net frontend-react/src/state/token-catalog-store.ts frontend-react/src/state/token-catalog-store.test.ts frontend-react/src/features/tokens/token-dnd.ts frontend-react/src/features/tokens/token-dnd.test.ts frontend-react/src/session/table-controller.ts frontend-react/src/engine/table-engine.ts frontend-react/src/engine/react/TableStage.tsx
git commit -m "feat: add token catalog drag and drop state"
```

---

### Task 6: Construir a estante e o editor de tokens

**Files:**
- Modify: `frontend-react/src/features/tokens/TokensPane.tsx`
- Create: `frontend-react/src/features/tokens/TokenEditor.tsx`
- Create: `frontend-react/src/features/tokens/TokensPane.test.tsx`
- Modify: `frontend-react/src/styles/index.css`

**Interfaces:**
- Consumes: `campaignTokens`, `groupCampaignTokens`, `TokenClient`, `SheetClient`, `AssetClient` e `TOKEN_DRAG_MIME`.
- Produces: estante filtrável e editor contextual do Mestre.

- [ ] **Step 1: escrever testes de interface da estante**

Renderizar a estante com fixtures reais e verificar comportamento, não texto estrutural:

```tsx
it("permite ao jogador arrastar somente token próprio disponível", () => {
  render(<TokensPaneFixture identity={player} tokens={[ownedAvailable, ownedPlaced]} />);
  const available = screen.getByRole("button", { name: /Vigia disponível/i });
  expect(available.getAttribute("draggable")).toBe("true");
  expect(screen.queryByText("Token alheio")).toBeNull();
});

it("mostra ao mestre imagem, ficha, responsável e cena", () => {
  render(<TokensPaneFixture identity={gm} tokens={[linkedToken]} />);
  expect(screen.getByRole("img", { name: "Vigia" })).toBeTruthy();
  expect(screen.getByText("Ficha de Ravi")).toBeTruthy();
  expect(screen.getByText("Ravi")).toBeTruthy();
  expect(screen.getByText("Bosque Norte")).toBeTruthy();
});
```

- [ ] **Step 2: executar teste e confirmar RED**

Run: `npm --prefix frontend-react run test:run -- TokensPane.test.tsx`

Expected: FAIL porque a estante atual lista apenas tokens da cena e não possui editor.

- [ ] **Step 3: implementar estante e editor mínimos**

Substituir o formulário “token vazio” por botão `Criar token`. O editor carrega assets `kind=token`, fichas e responsáveis; permite upload de imagem pelo `AssetClient`; ao selecionar ficha, preenche seu dono. Usar componentes Phosphor já instalados, miniaturas reais e monograma CSS quando não houver imagem.

Os filtros `Nesta cena`, `Disponíveis` e `Todos` usam contagens reais. Itens disponíveis recebem `draggable=true`; tokens em outra cena informam `Será transferido de <cena>` no início do drag. Estados loading, vazio e erro devem orientar a próxima ação.

- [ ] **Step 4: executar testes e build**

Run: `npm --prefix frontend-react run test:run -- TokensPane.test.tsx`

Expected: PASS.

Run: `npm --prefix frontend-react run typecheck && npm --prefix frontend-react run build`

Expected: ambos PASS.

- [ ] **Step 5: commit**

```bash
git add frontend-react/src/features/tokens/TokensPane.tsx frontend-react/src/features/tokens/TokenEditor.tsx frontend-react/src/features/tokens/TokensPane.test.tsx frontend-react/src/styles/index.css
git commit -m "feat: build persistent token shelf and editor"
```

---

### Task 7: Construir a régua de direção de cenas

**Files:**
- Modify: `frontend-react/src/features/scene/ScenePane.tsx`
- Create: `frontend-react/src/features/scene/ScenePane.test.tsx`
- Modify: `frontend-react/src/state/ui-store.ts`
- Modify: `frontend-react/src/session/table-controller.ts`
- Modify: `frontend-react/src/styles/index.css`

**Interfaces:**
- Consumes: `SceneListItem.participants`, `scene:move_group`, `scene:move_members`.
- Produces: régua de cenas, preparação privada e seleção múltipla de participantes.

- [ ] **Step 1: escrever testes de preparação e movimentação**

```tsx
it("prepara uma cena sem publicar", async () => {
  render(<ScenePaneFixture scenes={[activeScene, prepScene]} />);
  fireEvent.click(screen.getByRole("button", { name: "Preparar Ruínas" }));
  expect(sentMessages).toEqual([
    { type: "scene:request", payload: { scene_id: prepScene.id } },
  ]);
});

it("envia somente participantes selecionados", async () => {
  render(<ScenePaneFixture scenes={[activeScene, prepScene]} />);
  fireEvent.click(screen.getByRole("button", { name: "Mover jogadores para Ruínas" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Ravi" }));
  fireEvent.click(screen.getByRole("button", { name: "Mover 1 jogador" }));
  expect(sentMessages.at(-1)).toEqual({
    type: "scene:move_members",
    payload: { scene_id: prepScene.id, member_ids: ["ravi-id"] },
  });
});
```

- [ ] **Step 2: executar teste e confirmar RED**

Run: `npm --prefix frontend-react run test:run -- ScenePane.test.tsx`

Expected: FAIL porque os controles e participantes ainda não existem.

- [ ] **Step 3: implementar régua e modal de participantes**

Cada linha usa a miniatura de `background_url`, estado `Padrão` ou `Preparação`, ocupantes e três ações. `Preparar` chama somente `requestScene`. `Levar grupo` exige confirmação inline e envia `scene:move_group`. `Mover jogadores` abre modal com seleção múltipla e contagem precisa.

Em viewport estreito, miniatura, título e estado ficam na primeira linha; participantes usam chips roláveis; ações ocupam uma linha com alvos mínimos de 44 px. Não adicionar gradientes, glassmorphism ou outra cor de acento.

- [ ] **Step 4: executar testes frontend completos**

Run: `npm --prefix frontend-react run test:run`

Expected: todos PASS.

Run: `npm --prefix frontend-react run typecheck && npm --prefix frontend-react run build`

Expected: ambos PASS.

- [ ] **Step 5: commit**

```bash
git add frontend-react/src/features/scene/ScenePane.tsx frontend-react/src/features/scene/ScenePane.test.tsx frontend-react/src/state/ui-store.ts frontend-react/src/session/table-controller.ts frontend-react/src/styles/index.css
git commit -m "feat: add scene direction rail"
```

---

### Task 8: Verificação integrada e atualização do MVP

**Files:**
- Modify: `docs/MVP_FASE_1.md`
- Modify only if a failing acceptance test requires it: files from Tasks 1 a 7.

**Interfaces:**
- Consumes: sistema completo das Tasks 1 a 7.
- Produces: evidência reproduzível de aceite.

- [ ] **Step 1: executar toda a suíte backend sem gerar bytecode no workspace**

Run:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Expected: todos PASS, sem traceback ou warning de autorização.

- [ ] **Step 2: executar toda a verificação frontend**

Run:

```bash
npm --prefix frontend-react run test:run
npm --prefix frontend-react run typecheck
npm --prefix frontend-react run build
```

Expected: testes, tipos e build PASS. O warning preexistente de chunk grande pode permanecer registrado como dívida de performance, sem ocultar outros warnings.

- [ ] **Step 3: verificar visualmente desktop e mobile**

Iniciar o host local, criar Mestre e dois jogadores de teste e validar no navegador:

1. enviar uma imagem de token;
2. criar token vinculado à ficha e ao jogador;
3. arrastar token disponível para a cena;
4. mover e redimensionar, recarregar e confirmar persistência;
5. criar cena a partir de imagem de mapa;
6. preparar cena sem mover jogadores;
7. mover um jogador e depois o grupo;
8. repetir as superfícies em 390 x 844, verificando foco, contraste e alvos de 44 px.

- [ ] **Step 4: atualizar checklist somente com critérios observados**

Marcar em `docs/MVP_FASE_1.md` somente itens P0/P1 efetivamente satisfeitos pelos testes e pela verificação visual. Não marcar teste físico iOS/Android quando a validação tiver ocorrido apenas em viewport emulado.

- [ ] **Step 5: revisar diff e preservar dados do usuário**

Run: `git diff --check && git status --short`

Confirmar que `data/neferus.db` e arquivos sob `data/sheets/` não foram adicionados ao commit.

- [ ] **Step 6: commit final de documentação**

```bash
git add docs/MVP_FASE_1.md
git commit -m "docs: record token and scene direction progress"
```
