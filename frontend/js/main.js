/**
 * Bootstrap do cliente Neferus VTT (Fase 2).
 *
 * Inicializa a rede, a Mesa (PixiJS) e os controllers, e liga a UI de chat/GM.
 */
import { WebSocketController } from "./controllers/websocket_controller.js";
import { TableController } from "./controllers/table_controller.js";
import { InputController } from "./controllers/input_controller.js";
import { AssetController } from "./controllers/asset_controller.js";
import { PageController } from "./controllers/page_controller.js";
import { DiceController } from "./controllers/dice_controller.js";
import { ToolsController } from "./controllers/tools_controller.js";
import { TableView } from "./views/table_view.js";
import { DiceView } from "./views/dice_view.js";
import { AuroraBackground } from "./views/aurora_background.js";
import { GameState } from "./models/game_state.js";
import { MESSAGE_TYPES } from "./network/message_types.js";
import { ICONS, CONDITION_DEFS, svgMarkup } from "./ui/token_icons.js";
import { openContextMenu } from "./ui/context_menu.js";
import { mountPageEditor } from "./ui/page_editor.js";
import { openModal } from "./ui/modal.js";

// --- Identidade a partir da URL (auth real virá em fase futura) ---
const params = new URLSearchParams(window.location.search);
const identity = {
  campaignId: params.get("campaign_id") || "lobby",
  userId: params.get("user_id") || `player-${Math.floor(Math.random() * 1000)}`,
  isGm: params.get("is_gm") === "true",
};

// --- Elementos ---
const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const roleBadge = document.getElementById("role-badge");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const stageEl = document.getElementById("stage");
const gmToolbar = document.getElementById("gm-toolbar");
const gridToggle = document.getElementById("grid-toggle");
const metersInput = document.getElementById("grid-meters");
const sceneNameEl = document.getElementById("scene-name");
const tokenListEl = document.getElementById("token-list");
const addTokenForm = document.getElementById("add-token-form");
const libraryPanel = document.getElementById("library-panel");
const uploadForm = document.getElementById("upload-form");
const uploadInput = document.getElementById("upload-input");
const uploadKind = document.getElementById("upload-kind");
const uploadFileName = document.getElementById("upload-file-name");
const dropzone = document.getElementById("dropzone");
const assetGrid = document.getElementById("asset-grid");
const bgAudio = document.getElementById("bg-audio");
const tabRail = document.getElementById("tab-rail");
const snapToggle = document.getElementById("snap-toggle");
const mapWidthM = document.getElementById("map-width-m");
const mapHeightM = document.getElementById("map-height-m");
const mapResizeBtn = document.getElementById("map-resize-btn");
const tokenMenu = document.getElementById("token-menu");
const fogToggle = document.getElementById("fog-toggle");
const fogTools = document.getElementById("fog-tools");
const fogBrushReveal = document.getElementById("fog-brush-reveal");
const fogBrushHide = document.getElementById("fog-brush-hide");
const fogRevealAll = document.getElementById("fog-reveal-all");
const fogHideAll = document.getElementById("fog-hide-all");
const diceOverlay = document.getElementById("dice-overlay");
const diceQuick = document.getElementById("dice-quick");
const diceCount = document.getElementById("dice-count");
const diceMod = document.getElementById("dice-mod");
const diceForm = document.getElementById("dice-form");
const diceNotation = document.getElementById("dice-notation");
const diceHistory = document.getElementById("dice-history");
const themeToggle = document.getElementById("theme-toggle");
const toolRecenter = document.getElementById("tool-recenter");
const toolZoomIn = document.getElementById("tool-zoom-in");
const toolZoomOut = document.getElementById("tool-zoom-out");
const tokenOwnerSelect = document.getElementById("token-owner");
const tokenPickerGrid = document.getElementById("token-picker-grid");
const libPath = document.getElementById("lib-path");
const libUpBtn = document.getElementById("lib-up-btn");
const newFolderBtn = document.getElementById("new-folder-btn");
const newPageBtn = document.getElementById("new-page-btn");

function log(message) {
  const line = document.createElement("div");
  line.textContent = message;
  logEl?.appendChild(line);
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
}

/** Loga uma linha com um link clicável (usado no compartilhamento de PDF). */
function logLink(prefix, url, label) {
  const line = document.createElement("div");
  line.append(document.createTextNode(prefix + " "));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = label || url;
  a.style.color = "#a855f7";
  line.append(a);
  logEl?.appendChild(line);
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(connected) {
  if (!statusEl) return;
  statusEl.dataset.connected = String(connected);
  const dot = statusEl.querySelector(".dot");
  statusEl.textContent = "";
  if (dot) statusEl.appendChild(dot);
  else statusEl.insertAdjacentHTML("afterbegin", '<span class="dot"></span>');
  statusEl.append(connected ? " Conectado" : " Desconectado");
}

// --- Estado + rede ---
const state = new GameState();
const ws = new WebSocketController();

// --- Mesa (PixiJS) ---
const view = new TableView(stageEl, {
  onTokenDragEnd: (id, x, y) => table.handleTokenDragEnd(id, x, y),
  canControlToken: (token) => table.canControlToken(token),
  onTokenContextMenu: (id, cx, cy) => openTokenMenu(id, cx, cy),
  onTokenResizeEnd: (id, w, h) => {
    table.handleTokenResizeEnd(id, w, h);
    const tk = state.tokens.get(id);
    if (tk?.imageUrl) rememberTokenSize(tk.imageUrl, w, h);
  },
  onFogPaint: (cells, revealed) => table.paintFog(cells, revealed),
});

const table = new TableController({ state, view, ws, identity });

// --- Dados 3D (Three.js) ---
const diceView = new DiceView(diceOverlay);
const dice = new DiceController({ ws, view: diceView, identity });

// --- Ferramentas da mesa (caneta, texto, régua, raio, magia) ---
const tools = new ToolsController({ view, ws, state, identity });

// Referência à câmera/zoom da Mesa (atribuída ao iniciar o Pixi).
let inputCtl = null;

// --- Tema (claro por padrão; escuro fica para depois) ---
const THEME_KEY = "neferus-theme";
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignora armazenamento indisponível */
  }
  // Atualiza o fundo da Mesa para casar com o tema.
  view.refreshThemeColors?.();
}
(() => {
  let saved = "light";
  try {
    saved = localStorage.getItem(THEME_KEY) || "light";
  } catch {
    /* ignora */
  }
  document.documentElement.dataset.theme = saved;
})();
themeToggle?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
});

// --- Identidade visível ---
if (roleBadge) {
  roleBadge.textContent = identity.isGm ? "Mestre (GM)" : `Jogador: ${identity.userId}`;
  roleBadge.dataset.gm = String(identity.isGm);
}

// --- Lista de tokens na barra lateral ---
function renderTokenList(tokens) {
  if (!tokenListEl) return;
  tokenListEl.innerHTML = "";
  if (!tokens.length) {
    tokenListEl.innerHTML = '<li class="token-empty">Nenhum token na cena.</li>';
    return;
  }
  for (const t of tokens) {
    const li = document.createElement("li");
    li.className = "token-item" + (t.isHidden ? " hidden" : "");

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    if (t.imageUrl) swatch.style.backgroundImage = `url("${t.imageUrl}")`;

    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.name + (t.isHidden ? " (oculto)" : "");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = t.ownerId ? `dono: ${t.ownerId}` : "sem dono";
    meta.append(name, sub);

    li.append(swatch, meta);

    // Clicar centraliza a câmera no token.
    li.addEventListener("click", () => table.centerOnToken(t.id));

    // Ações do GM: esconder/revelar e remover.
    if (identity.isGm) {
      const actions = document.createElement("div");
      actions.className = "token-actions";

      const hideBtn = document.createElement("button");
      hideBtn.className = "icon-btn";
      hideBtn.title = t.isHidden ? "Revelar" : "Esconder";
      hideBtn.innerHTML = svgMarkup(t.isHidden ? ICONS.reveal : ICONS.hide, 16);
      hideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        table.toggleTokenVisibility(t.id);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn";
      delBtn.title = "Remover";
      delBtn.innerHTML = svgMarkup(ICONS.remove, 16);
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        table.removeToken(t.id);
      });

      actions.append(hideBtn, delBtn);
      li.append(actions);
    }

    tokenListEl.append(li);
  }
}

table.onTokensChanged = renderTokenList;

// --- Presença de usuários (para o seletor de dono do token) ---
let roster = [];
function renderOwnerOptions() {
  if (!tokenOwnerSelect) return;
  const current = tokenOwnerSelect.value;
  tokenOwnerSelect.innerHTML =
    '<option value="">Sem dono (só o Mestre)</option>';
  for (const u of roster) {
    if (u.is_gm) continue; // dono geralmente é um jogador
    const opt = document.createElement("option");
    opt.value = u.user_id;
    opt.textContent = u.user_id;
    tokenOwnerSelect.append(opt);
  }
  // Preserva a seleção anterior, se o usuário ainda estiver presente.
  if ([...tokenOwnerSelect.options].some((o) => o.value === current)) {
    tokenOwnerSelect.value = current;
  }
}

// --- Abas verticais da barra lateral ---
tabRail?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab;
  tabRail.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab-pane").forEach((p) => {
    p.classList.toggle("active", p.dataset.tab === tab);
  });
});

// Revela elementos exclusivos do GM.
if (identity.isGm) {
  document.querySelectorAll(".gm-only").forEach((el) => (el.hidden = false));
}

// --- Redimensionamento da aba lateral (dock) ---
const dockEl = document.getElementById("dock");
const dockResizer = document.getElementById("dock-resizer");
if (dockEl && dockResizer) {
  const DOCK_W_KEY = "neferus-dock-width";
  const clampW = (w) => {
    const max = Math.min(1000, Math.max(360, window.innerWidth - 420));
    return Math.max(300, Math.min(max, Math.round(w)));
  };
  const savedW = parseInt(localStorage.getItem(DOCK_W_KEY) || "", 10);
  if (Number.isFinite(savedW) && savedW) dockEl.style.width = `${clampW(savedW)}px`;

  let startX = 0;
  let startW = 0;
  const onMove = (e) => {
    dockEl.style.width = `${clampW(startW + (startX - e.clientX))}px`;
  };
  const onUp = () => {
    dockResizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    localStorage.setItem(DOCK_W_KEY, String(parseInt(dockEl.style.width, 10) || 366));
  };
  dockResizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = dockEl.getBoundingClientRect().width;
    dockResizer.classList.add("dragging");
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

// Snap é preferência LOCAL (não sincronizada).
snapToggle?.addEventListener("change", (e) => table.setSnap(e.target.checked));

// --- Barra de ferramentas do mapa ---
toolRecenter?.addEventListener("click", () => {
  const w = state.width || 0;
  const h = state.height || 0;
  if (w && h) view.centerOn(w / 2, h / 2);
});
toolZoomIn?.addEventListener("click", () => inputCtl?.zoomIn());
toolZoomOut?.addEventListener("click", () => inputCtl?.zoomOut());

// --- Ferramentas (caneta, texto, métrica) ---
const toolButtons = document.querySelectorAll(".tool-btn[data-tool]");
const toolOptions = document.getElementById("tool-options");
const metricShapes = document.getElementById("metric-shapes");
const toolColor = document.getElementById("tool-color");
const metricPersist = document.getElementById("metric-persist");

function updateToolUI(active) {
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === active));
  // O card de opções (formas/cor/fixar) só aparece na ferramenta Métrica.
  if (toolOptions) toolOptions.hidden = active !== "metric";
}
tools.onToolChange = updateToolUI;
toolButtons.forEach((b) =>
  b.addEventListener("click", () => tools.selectTool(b.dataset.tool)),
);
toolColor?.addEventListener("input", (e) => tools.setColor(e.target.value));
metricShapes?.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  metricShapes.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  tools.setMetricShape(chip.dataset.shape);
});
metricPersist?.addEventListener("change", (e) => tools.setPersist(e.target.checked));
document.getElementById("clear-drawings")?.addEventListener("click", () => tools.clearDrawings());
document.getElementById("clear-effects")?.addEventListener("click", () => tools.clearTemplatesAll());
// Sincroniza os valores iniciais do card com o controller.
if (toolColor) tools.setColor(toolColor.value);
tools.setMetricShape("circle");
tools.setPersist(metricPersist ? metricPersist.checked : true);

// --- Ordem de turnos ---
const turnPanel = document.getElementById("turn-panel");
const turnListEl = document.getElementById("turn-list");
const turnRoundEl = document.getElementById("turn-round");
let turnState = { entries: [], current: 0, round: 1 };

document.getElementById("tool-turns")?.addEventListener("click", () => {
  if (turnPanel) turnPanel.hidden = !turnPanel.hidden;
});
document.getElementById("turn-close")?.addEventListener("click", () => {
  if (turnPanel) turnPanel.hidden = true;
});

// --- Névoa de Guerra (card flutuante na barra de ferramentas) ---
const fogPanel = document.getElementById("fog-panel");
document.getElementById("tool-fog")?.addEventListener("click", () => {
  if (fogPanel) fogPanel.hidden = !fogPanel.hidden;
});
document.getElementById("fog-close")?.addEventListener("click", () => {
  if (fogPanel) fogPanel.hidden = true;
});

// --- Camadas (Mapa / Tokens / GM) ---
const LAYER_DEFS = [
  { key: "gm", label: "GM (só Mestre)", icon: ICONS.hide },
  { key: "object", label: "Tokens", icon: ICONS.token },
  { key: "map", label: "Mapa", icon: ICONS.map },
];
let activeLayer = "object";
const layerVisible = { gm: true, object: true, map: true };
const layerPanel = document.getElementById("layer-panel");
const layerList = document.getElementById("layer-list");

function renderLayerPanel() {
  if (!layerList) return;
  layerList.innerHTML = "";
  for (const def of LAYER_DEFS) {
    const row = document.createElement("div");
    row.className = "layer-row" + (activeLayer === def.key ? " active" : "");

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "layer-pick";
    pick.title = "Tornar camada ativa";
    pick.innerHTML = svgMarkup(def.icon, 18);
    const span = document.createElement("span");
    span.textContent = def.label;
    pick.append(span);
    pick.addEventListener("click", () => {
      activeLayer = def.key;
      renderLayerPanel();
    });

    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "layer-eye" + (layerVisible[def.key] ? "" : " off");
    eye.title = layerVisible[def.key] ? "Ocultar camada (só p/ você)" : "Mostrar camada";
    eye.innerHTML = svgMarkup(layerVisible[def.key] ? ICONS.reveal : ICONS.hide, 16);
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      layerVisible[def.key] = !layerVisible[def.key];
      table.setLayerVisible(def.key, layerVisible[def.key]);
      renderLayerPanel();
    });

    row.append(pick, eye);
    layerList.append(row);
  }
}
renderLayerPanel();

document.getElementById("tool-layers")?.addEventListener("click", () => {
  if (layerPanel) layerPanel.hidden = !layerPanel.hidden;
});
document.getElementById("layer-close")?.addEventListener("click", () => {
  if (layerPanel) layerPanel.hidden = true;
});

// --- Cenas (múltiplas cenas por campanha, só GM) ---
const sceneListEl = document.getElementById("scene-list");
let scenesCache = [];

function renderScenes(scenes) {
  scenesCache = scenes || scenesCache;
  if (!sceneListEl) return;
  sceneListEl.innerHTML = "";
  if (!scenesCache.length) {
    sceneListEl.innerHTML = '<div class="asset-empty">Nenhuma cena.</div>';
    return;
  }
  for (const s of scenesCache) {
    const card = document.createElement("div");
    card.className = "scene-card" + (s.id === state.sceneId ? " viewing" : "");

    // Mídia (imagem do mapa) no topo — abre a cena ao clicar.
    const media = document.createElement("div");
    media.className = "scene-media";
    if (s.background_url) media.style.backgroundImage = `url("${s.background_url}")`;
    else media.innerHTML = svgMarkup(ICONS.map, 30);
    media.title = "Abrir cena";
    media.addEventListener("click", () => table.openScene(s.id));
    if (s.is_active) {
      const badge = document.createElement("span");
      badge.className = "scene-badge";
      badge.textContent = "Ativa";
      media.append(badge);
    }

    // Corpo: nome + ações.
    const info = document.createElement("div");
    info.className = "scene-info";

    const name = document.createElement("span");
    name.className = "scene-name";
    name.title = s.name;
    name.textContent = s.name;

    const actions = document.createElement("div");
    actions.className = "scene-actions";
    const bringBtn = document.createElement("button");
    bringBtn.className = "btn-primary btn-mini scene-bring";
    bringBtn.textContent = s.is_active ? "Jogadores aqui" : "Trazer jogadores";
    bringBtn.disabled = Boolean(s.is_active);
    bringBtn.addEventListener("click", () => table.activateScene(s.id));
    const kebab = document.createElement("button");
    kebab.className = "icon-btn";
    kebab.title = "Ações";
    kebab.innerHTML = svgMarkup(ICONS.dots, 16);
    kebab.addEventListener("click", (e) => {
      _ctxX = e.clientX;
      _ctxY = e.clientY;
      openContextMenu(e.clientX, e.clientY, [
        { label: "Abrir", icon: ICONS.open, onClick: () => table.openScene(s.id) },
        { label: "Trazer jogadores", icon: ICONS.reveal, onClick: () => table.activateScene(s.id) },
        { separator: true },
        {
          label: "Renomear",
          icon: ICONS.rename,
          onClick: () => {
            const n = prompt("Nome da cena:", s.name);
            if (n && n.trim()) table.renameScene(s.id, n.trim());
          },
        },
        {
          label: "Excluir",
          icon: ICONS.remove,
          danger: true,
          onClick: () => {
            if (confirm(`Excluir a cena "${s.name}"?`)) table.deleteScene(s.id);
          },
        },
      ]);
    });
    actions.append(bringBtn, kebab);

    info.append(name, actions);
    card.append(media, info);
    sceneListEl.append(card);
  }
}
table.onScenesChanged = renderScenes;

document.getElementById("scene-new-btn")?.addEventListener("click", () => {
  const name = prompt("Nome da nova cena:", "Nova Cena");
  if (name === null) return;
  table.createScene(name.trim() || "Nova Cena");
});

function renderTurn() {
  if (turnRoundEl) turnRoundEl.textContent = `Rodada ${turnState.round}`;
  if (!turnListEl) return;
  turnListEl.innerHTML = "";
  if (!turnState.entries.length) {
    turnListEl.innerHTML = '<li class="turn-empty">Sem combatentes.</li>';
    return;
  }
  turnState.entries.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = "turn-item" + (i === turnState.current ? " current" : "");
    const init = document.createElement("span");
    init.className = "turn-init";
    init.textContent = e.init;
    const name = document.createElement("span");
    name.className = "turn-name";
    name.textContent = e.name;
    li.append(init, name);
    if (identity.isGm) {
      const del = document.createElement("button");
      del.className = "turn-del";
      del.title = "Remover";
      del.innerHTML = svgMarkup(
        '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        14
      );
      del.addEventListener("click", () => {
        turnState.entries.splice(i, 1);
        if (turnState.current >= turnState.entries.length) turnState.current = 0;
        sendTurn();
      });
      li.append(del);
    }
    turnListEl.append(li);
  });
}
function sendTurn() {
  renderTurn();
  ws.send(MESSAGE_TYPES.TURN_SET, turnState);
}
function setTurn(t) {
  if (!t) return;
  turnState = {
    entries: t.entries || [],
    current: t.current || 0,
    round: t.round || 1,
  };
  renderTurn();
}
ws.on(MESSAGE_TYPES.TURN_STATE, setTurn);
tools.onBoardTurn = setTurn;

if (identity.isGm) {
  document.getElementById("turn-add-btn")?.addEventListener("click", () => {
    const nameI = document.getElementById("turn-name");
    const initI = document.getElementById("turn-init");
    const nm = nameI.value.trim();
    const iv = parseInt(initI.value, 10);
    if (!nm) return;
    turnState.entries.push({
      id: Math.random().toString(36).slice(2, 8),
      name: nm,
      init: Number.isFinite(iv) ? iv : 0,
    });
    turnState.entries.sort((a, b) => b.init - a.init);
    nameI.value = "";
    initI.value = "";
    sendTurn();
  });
  document.getElementById("turn-next")?.addEventListener("click", () => {
    if (!turnState.entries.length) return;
    turnState.current += 1;
    if (turnState.current >= turnState.entries.length) {
      turnState.current = 0;
      turnState.round += 1;
    }
    sendTurn();
  });
  document.getElementById("turn-prev")?.addEventListener("click", () => {
    if (!turnState.entries.length) return;
    turnState.current -= 1;
    if (turnState.current < 0) turnState.current = turnState.entries.length - 1;
    sendTurn();
  });
  document.getElementById("turn-clear")?.addEventListener("click", () => {
    turnState = { entries: [], current: 0, round: 1 };
    sendTurn();
  });
}
renderTurn();

// --- Menu de contexto do token (botão direito) ---
let _menuX = 0;
let _menuY = 0;

function closeTokenMenu() {
  if (tokenMenu) tokenMenu.hidden = true;
}

function menuButton(iconSvg, label, cls) {
  const b = document.createElement("button");
  if (cls) b.className = cls;
  b.innerHTML = `${svgMarkup(iconSvg)}<span>${label}</span>`;
  return b;
}

function openTokenMenu(tokenId, clientX, clientY) {
  if (!tokenMenu) return;
  const token = state.tokens.get(tokenId);
  if (!token || !table.canControlToken(token)) return;
  if (clientX != null) _menuX = clientX;
  if (clientY != null) _menuY = clientY;

  tokenMenu.innerHTML = "";
  const item = (iconSvg, label, cls, fn) => {
    const b = menuButton(iconSvg, label, cls);
    b.addEventListener("click", () => {
      closeTokenMenu();
      fn();
    });
    tokenMenu.append(b);
  };

  item(ICONS.rename, "Renomear", "", () => {
    const name = prompt("Novo nome do token:", token.name);
    if (name && name.trim()) table.updateToken(tokenId, { name: name.trim() });
  });
  item(ICONS.resize, "Redimensionar", "", () => view.selectToken(tokenId));
  item(
    token.isLocked ? ICONS.unlock : ICONS.lock,
    token.isLocked ? "Destravar" : "Travar",
    "",
    () => table.setTokenLock(tokenId, !token.isLocked),
  );
  item(ICONS.light, token.lightRadius > 0 ? "Luz (editar)" : "Ponto de luz", "", () => {
    const cur = token.lightRadius > 0 ? String(token.lightRadius) : "6";
    const val = prompt("Raio de luz em metros (0 remove):", cur);
    if (val === null) return;
    const m = parseFloat(val.replace(",", "."));
    table.setTokenLight(tokenId, Number.isFinite(m) ? m : 0);
  });
  // Submenu de condições (não fecha o menu).
  const activeCount = (token.conditions || []).length;
  const condBtn = menuButton(
    ICONS.conditions,
    `Condições${activeCount ? ` (${activeCount})` : ""}`,
    "has-sub",
  );
  condBtn.addEventListener("click", () => openConditionsMenu(tokenId));
  tokenMenu.append(condBtn);

  if (identity.isGm) {
    const curLayer = LAYER_DEFS.find((l) => l.key === (token.layer || "object"));
    const layerBtn = menuButton(
      ICONS.map,
      `Camada: ${curLayer ? curLayer.label : "Tokens"}`,
      "has-sub",
    );
    layerBtn.addEventListener("click", () => openTokenLayerMenu(tokenId));
    tokenMenu.append(layerBtn);

    item(
      token.isHidden ? ICONS.reveal : ICONS.hide,
      token.isHidden ? "Revelar" : "Esconder",
      "",
      () => table.toggleTokenVisibility(tokenId),
    );
    item(ICONS.remove, "Remover da cena", "danger", () => table.removeToken(tokenId));
  }

  tokenMenu.style.left = `${_menuX}px`;
  tokenMenu.style.top = `${_menuY}px`;
  tokenMenu.hidden = false;
}

/** Submenu para mover o token entre camadas (Mapa / Tokens / GM). */
function openTokenLayerMenu(tokenId) {
  const token = state.tokens.get(tokenId);
  if (!token || !tokenMenu) return;
  tokenMenu.innerHTML = "";

  const back = menuButton(ICONS.back, "Voltar", "menu-back");
  back.addEventListener("click", () => openTokenMenu(tokenId));
  tokenMenu.append(back);

  const cur = token.layer || "object";
  for (const def of LAYER_DEFS) {
    const b = menuButton(def.icon, def.label, "cond-item" + (cur === def.key ? " on" : ""));
    b.addEventListener("click", () => {
      closeTokenMenu();
      table.setTokenLayer(tokenId, def.key);
    });
    tokenMenu.append(b);
  }
  tokenMenu.hidden = false;
}

function openConditionsMenu(tokenId) {
  const token = state.tokens.get(tokenId);
  if (!token || !tokenMenu) return;
  const active = new Set(token.conditions || []);
  tokenMenu.innerHTML = "";

  const back = menuButton(ICONS.back, "Voltar", "menu-back");
  back.addEventListener("click", () => openTokenMenu(tokenId));
  tokenMenu.append(back);

  for (const c of CONDITION_DEFS) {
    const b = menuButton(c.svg, c.label, "cond-item" + (active.has(c.key) ? " on" : ""));
    b.querySelector("svg").style.color = c.color;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (active.has(c.key)) active.delete(c.key);
      else active.add(c.key);
      b.classList.toggle("on", active.has(c.key));
      table.setTokenConditions(tokenId, [...active]);
    });
    tokenMenu.append(b);
  }
  tokenMenu.hidden = false;
}

document.addEventListener("pointerdown", (e) => {
  // Botão direito abre/gerencia o menu — não deve fechá-lo no mesmo clique.
  if (e.button === 2) return;
  if (tokenMenu && !tokenMenu.hidden && !tokenMenu.contains(e.target)) {
    closeTokenMenu();
  }
});

// Tamanho preferido do token por imagem (lembrado após redimensionar).
const TOKEN_SIZE_KEY = `neferus-token-sizes-${identity.campaignId}`;
let tokenSizes = {};
try {
  tokenSizes = JSON.parse(localStorage.getItem(TOKEN_SIZE_KEY) || "{}") || {};
} catch {
  tokenSizes = {};
}
function rememberTokenSize(url, w, h) {
  if (!url) return;
  tokenSizes[url] = { w: Math.round(w), h: Math.round(h) };
  try {
    localStorage.setItem(TOKEN_SIZE_KEY, JSON.stringify(tokenSizes));
  } catch {
    /* ignora */
  }
}

/** Cria um token a partir de uma imagem, preservando a proporção (não 1x1). */
function createTokenFromImage(url, opts = {}) {
  // Novos tokens vão para a camada ativa (a menos que opts já defina uma).
  const base0 = { layer: activeLayer, ...opts };
  // Se já redimensionamos um token desta imagem antes, reutiliza o tamanho.
  const saved = url && tokenSizes[url];
  if (saved && saved.w && saved.h) {
    table.addToken({ ...base0, image_url: url, width: saved.w, height: saved.h });
    return;
  }
  const base = state.grid.size_px || 64;
  const img = new Image();
  img.onload = () => {
    let w = base;
    let h = base;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (iw && ih) {
      const ratio = iw / ih;
      if (ratio >= 1) {
        w = base * ratio;
        h = base;
      } else {
        w = base;
        h = base / ratio;
      }
      const maxD = base * 3;
      w = Math.min(w, maxD);
      h = Math.min(h, maxD);
    }
    table.addToken({ ...base0, image_url: url, width: Math.round(w), height: Math.round(h) });
  };
  img.onerror = () => table.addToken({ ...base0, image_url: url });
  img.src = url;
}

// --- Dados 3D ---
// Clique rápido num dado: usa quantidade/modificador atuais.
diceQuick?.addEventListener("click", (e) => {
  const btn = e.target.closest(".die-btn");
  if (!btn) return;
  const sides = parseInt(btn.dataset.sides, 10);
  const count = Math.max(1, parseInt(diceCount?.value || "1", 10) || 1);
  const mod = parseInt(diceMod?.value || "0", 10) || 0;
  dice.rollDice(sides, count, mod);
});

// Rolagem por notação livre.
diceForm?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = diceNotation.value.trim();
  if (!n) return;
  dice.rollNotation(n);
  diceNotation.value = "";
});

function renderDiceResult(p) {
  const who = p.is_gm ? "GM" : p.roller_id || "?";
  const rolls = (p.dice || []).map((d) => Math.abs(d.value)).join(", ");
  const modTxt = p.modifier ? ` ${p.modifier >= 0 ? "+" : "−"}${Math.abs(p.modifier)}` : "";
  // Log no chat.
  log(`[dados] ${who} rolou ${p.notation}: [${rolls}]${modTxt} = ${p.total}`);
  // Histórico na aba Dados.
  if (diceHistory) {
    const li = document.createElement("li");
    li.className = "dice-entry";
    li.innerHTML =
      `<span class="dice-who">${who}</span>` +
      `<span class="dice-note">${p.notation}</span>` +
      `<span class="dice-total">${p.total}</span>`;
    diceHistory.prepend(li);
    while (diceHistory.children.length > 20) diceHistory.lastChild.remove();
  }
}
dice.onResult = renderDiceResult;

// --- UI: chat ---
form?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  ws.send(MESSAGE_TYPES.CHAT, { text });
  input.value = "";
});

// --- UI: ferramentas do GM ---
if (identity.isGm) {
  gridToggle?.addEventListener("change", (e) => {
    table.updateGrid({ enabled: e.target.checked });
  });
  metersInput?.addEventListener("change", (e) => {
    const meters = parseFloat(e.target.value);
    if (meters > 0) table.updateGrid({ meters_per_square: meters });
  });

  // Redimensionar o mapa (em metros → pixels via metros/quadrado).
  mapResizeBtn?.addEventListener("click", () => {
    const mw = parseFloat(mapWidthM.value);
    const mh = parseFloat(mapHeightM.value);
    const g = state.grid;
    if (!(mw > 0 && mh > 0) || !g) return;
    const pxPerMeter = g.size_px / g.meters_per_square;
    table.resizeScene(mw * pxPerMeter, mh * pxPerMeter);
  });

  addTokenForm?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    table.addToken({
      name: document.getElementById("token-name").value.trim() || "Token",
      owner_id: tokenOwnerSelect?.value || null,
      is_hidden: document.getElementById("token-hidden").checked,
      layer: activeLayer,
    });
    document.getElementById("token-name").value = "";
    document.getElementById("token-hidden").checked = false;
  });

  // --- Névoa de Guerra ---
  let fogBrush = null; // null | "reveal" | "hide"

  function setFogBrush(mode) {
    // Clicar no pincel já ativo o desliga.
    fogBrush = fogBrush === mode ? null : mode;
    fogBrushReveal?.classList.toggle("active", fogBrush === "reveal");
    fogBrushHide?.classList.toggle("active", fogBrush === "hide");
    table.setFogEditMode(fogBrush);
  }

  function syncFogUi(enabled) {
    if (fogToggle) fogToggle.checked = enabled;
    if (fogTools) fogTools.classList.toggle("disabled", !enabled);
    if (!enabled) setFogBrush(fogBrush); // desliga o pincel ao desativar
  }

  fogToggle?.addEventListener("change", (e) => {
    table.toggleFog(e.target.checked);
    syncFogUi(e.target.checked);
  });
  fogBrushReveal?.addEventListener("click", () => setFogBrush("reveal"));
  fogBrushHide?.addEventListener("click", () => setFogBrush("hide"));
  fogRevealAll?.addEventListener("click", () => table.resetFog(true));
  fogHideAll?.addEventListener("click", () => table.resetFog(false));

  // Mantém a UI da névoa em sincronia com o estado autoritativo.
  table.onFogChanged = (fog) => {
    if (fogToggle) fogToggle.checked = fog.enabled;
    if (fogTools) fogTools.classList.toggle("disabled", !fog.enabled);
  };
}

// --- Biblioteca de Assets (só GM) ---
const assets = new AssetController(identity);
const pages = new PageController(identity);

const KIND_SVG = { map: ICONS.map, token: ICONS.token, pdf: ICONS.pdf, doc: ICONS.doc, audio: ICONS.audio };

// --- Visualizador de arquivos (aba lateral) ---
const fileViewer = document.getElementById("file-viewer");
const fvTitle = document.getElementById("fv-title");
const fvBody = document.getElementById("fv-body");
const fvDownload = document.getElementById("fv-download");
document.getElementById("fv-close")?.addEventListener("click", closeFileViewer);

function closeFileViewer() {
  if (fileViewer) fileViewer.hidden = true;
  if (fvBody) fvBody.innerHTML = "";
}

function fileExt(name = "") {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

const IMG_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"];
const AUDIO_EXT = ["mp3", "ogg", "wav", "m4a"];
const TEXT_EXT = ["txt", "md", "csv", "json", "log"];

function isViewable(asset) {
  const ext = fileExt(asset.original_name) || fileExt(asset.url);
  return (
    ["map", "token", "pdf", "audio"].includes(asset.kind) ||
    ext === "pdf" ||
    IMG_EXT.includes(ext) ||
    AUDIO_EXT.includes(ext) ||
    TEXT_EXT.includes(ext)
  );
}

function showViewerMessage(msg) {
  const p = document.createElement("div");
  p.className = "fv-msg";
  p.textContent = msg;
  fvBody.appendChild(p);
}

/** Abre um arquivo no painel lateral (PDF/imagem/áudio/texto). */
async function openFileViewer(asset) {
  if (!fileViewer || !fvBody) return;
  if (fvTitle) fvTitle.textContent = asset.original_name;
  fvBody.innerHTML = "";
  if (fvDownload) {
    fvDownload.href = asset.url;
    fvDownload.hidden = false;
  }
  fileViewer.hidden = false;

  const ext = fileExt(asset.original_name) || fileExt(asset.url);

  if (asset.kind === "pdf" || ext === "pdf") {
    const frame = document.createElement("iframe");
    // Fragmentos do visualizador nativo: sem painel de páginas nem barra de
    // ferramentas — mostra apenas o conteúdo, ajustado à largura.
    frame.src = `${asset.url}#toolbar=0&navpanes=0&statusbar=0&view=FitH`;
    fvBody.appendChild(frame);
    return;
  }
  if (["map", "token"].includes(asset.kind) || IMG_EXT.includes(ext)) {
    const img = document.createElement("img");
    img.src = asset.url;
    img.alt = asset.original_name;
    fvBody.appendChild(img);
    return;
  }
  if (asset.kind === "audio" || AUDIO_EXT.includes(ext)) {
    const audio = document.createElement("audio");
    audio.src = asset.url;
    audio.controls = true;
    audio.style.width = "calc(100% - 2rem)";
    audio.style.margin = "1.5rem 1rem";
    fvBody.appendChild(audio);
    return;
  }
  if (TEXT_EXT.includes(ext)) {
    try {
      const res = await fetch(asset.url);
      const text = await res.text();
      const pre = document.createElement("pre");
      pre.textContent = text;
      fvBody.appendChild(pre);
    } catch (err) {
      showViewerMessage(`Não foi possível abrir o arquivo: ${err.message}`);
    }
    return;
  }
  // doc/docx/rtf/odt: o navegador não renderiza nativamente.
  showViewerMessage(
    "Este formato não pode ser exibido diretamente. Use o botão de download para abri-lo no seu computador.",
  );
}

/** Move/renomeia um asset e recarrega a biblioteca. */
async function renameAsset(asset) {
  const name = prompt("Novo nome do arquivo:", asset.original_name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === asset.original_name) return;
  try {
    await assets.update(asset.id, { original_name: trimmed });
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

function sanitizeFolderPath(value) {
  return String(value || "")
    .split("/")
    .map((s) => s.trim().replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("/");
}

async function moveAsset(asset) {
  const folder = await pickFolder({ title: "Mover arquivo para…", current: asset.folder || "" });
  if (folder === null) return;
  try {
    await assets.update(asset.id, { folder });
    if (folder) registerFolder(folder);
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

async function deleteAssetById(asset) {
  if (!confirm(`Excluir "${asset.original_name}"?`)) return;
  try {
    await assets.remove(asset.id);
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

/** Itens do menu de contexto de um asset. */
function assetContextItems(asset) {
  const items = [];
  if (isViewable(asset)) {
    items.push({ label: "Abrir", icon: ICONS.open, onClick: () => openFileViewer(asset) });
  }
  if (asset.kind === "map") {
    items.push({
      label: "Usar de fundo",
      icon: ICONS.image,
      onClick: () =>
        ws.send(MESSAGE_TYPES.SCENE_BACKGROUND, { scene_id: state.sceneId, url: asset.url }),
    });
  } else if (asset.kind === "token") {
    items.push({
      label: "Criar token",
      icon: ICONS.token,
      onClick: () => createTokenFromImage(asset.url, { name: asset.original_name }),
    });
  } else if (asset.kind === "pdf") {
    items.push({
      label: "Compartilhar",
      icon: ICONS.share,
      onClick: () =>
        ws.send(MESSAGE_TYPES.PDF_SHARE, { url: asset.url, name: asset.original_name }),
    });
  } else if (asset.kind === "audio") {
    items.push({
      label: "Tocar p/ todos",
      icon: ICONS.play,
      onClick: () => ws.send(MESSAGE_TYPES.AUDIO_PLAY, { url: asset.url, loop: true }),
    });
    items.push({ label: "Parar", icon: ICONS.stop, onClick: () => ws.send(MESSAGE_TYPES.AUDIO_STOP, {}) });
  }
  items.push({ separator: true });
  items.push({ label: "Renomear", icon: ICONS.rename, onClick: () => renameAsset(asset) });
  items.push({ label: "Mover para…", icon: ICONS.folder, onClick: () => moveAsset(asset) });
  items.push({
    label: "Compartilhar com…",
    icon: ICONS.share,
    onClick: () =>
      openShareMenu({ type: "asset", kind: asset.kind, url: asset.url, name: asset.original_name }),
  });
  items.push({ separator: true });
  items.push({ label: "Excluir", icon: ICONS.remove, danger: true, onClick: () => deleteAssetById(asset) });
  return items;
}

/** Renomeia uma pasta (move o conteúdo). */
async function renameFolder(name) {
  const from = currentFolder ? `${currentFolder}/${name}` : name;
  const nn = prompt("Novo nome da pasta:", name);
  if (nn == null) return;
  const seg = sanitizeFolderPath(nn).split("/")[0];
  if (!seg || seg === name) return;
  const to = currentFolder ? `${currentFolder}/${seg}` : seg;
  await moveFolderContents(from, to);
}

/** Exclui uma pasta e (opcionalmente) todo o seu conteúdo. */
async function deleteFolder(name) {
  const full = currentFolder ? `${currentFolder}/${name}` : name;
  const inside = allAssets.filter(
    (a) => (a.folder || "") === full || (a.folder || "").startsWith(`${full}/`),
  );
  const insidePages = allPages.filter(
    (p) => (p.folder || "") === full || (p.folder || "").startsWith(`${full}/`),
  );
  const total = inside.length + insidePages.length;
  const msg = total
    ? `A pasta "${name}" contém ${total} item(ns). Excluir a pasta e todo o conteúdo?`
    : `Excluir a pasta "${name}"?`;
  if (!confirm(msg)) return;
  try {
    for (const a of inside) await assets.remove(a.id);
    for (const p of insidePages) await pages.remove(p.id);
    for (const f of [...knownFolders]) {
      if (f === full || f.startsWith(`${full}/`)) knownFolders.delete(f);
    }
    saveFolders();
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

async function moveFolderContents(from, to) {
  const inside = allAssets.filter(
    (a) => (a.folder || "") === from || (a.folder || "").startsWith(`${from}/`),
  );
  const insidePages = allPages.filter(
    (p) => (p.folder || "") === from || (p.folder || "").startsWith(`${from}/`),
  );
  try {
    for (const a of inside) {
      const rest = (a.folder || "").slice(from.length);
      await assets.update(a.id, { folder: `${to}${rest}` });
    }
    for (const p of insidePages) {
      const rest = (p.folder || "").slice(from.length);
      await pages.update(p.id, { folder: `${to}${rest}` });
    }
    for (const f of [...knownFolders]) {
      if (f === from || f.startsWith(`${from}/`)) {
        knownFolders.delete(f);
        knownFolders.add(`${to}${f.slice(from.length)}`);
      }
    }
    registerFolder(to);
    saveFolders();
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

let allAssets = [];
let allPages = [];
let currentFolder = "";
let _dragItem = null; // arraste de item na biblioteca { type, id }

// Pastas conhecidas (persistem mesmo vazias, por campanha).
const FOLDERS_KEY = `neferus-folders-${identity.campaignId}`;
let knownFolders = new Set();
try {
  knownFolders = new Set(JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]"));
} catch {
  knownFolders = new Set();
}
function saveFolders() {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([...knownFolders]));
  } catch {
    /* ignora */
  }
}
// Pastas padrão sempre presentes na raiz da biblioteca.
const DEFAULT_FOLDERS = ["Mapas", "Tokens", "PDFs", "Audio"];
for (const f of DEFAULT_FOLDERS) knownFolders.add(f);
saveFolders();
/** Registra uma pasta e todas as suas ancestrais (a/b/c → a, a/b, a/b/c). */
function registerFolder(path) {
  if (!path) return;
  const parts = path.split("/");
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    knownFolders.add(acc);
  }
  saveFolders();
}
/** Subpastas diretas de `current`, a partir de um conjunto de caminhos. */
function subfoldersOf(folderPaths, current) {
  const prefix = current ? `${current}/` : "";
  const subs = new Set();
  for (const f of folderPaths) {
    if (!f || f === current) continue;
    if (current === "") {
      subs.add(f.split("/")[0]);
    } else if (f.startsWith(prefix)) {
      const seg = f.slice(prefix.length).split("/")[0];
      if (seg) subs.add(seg);
    }
  }
  return subs;
}

// --- Páginas (diário/notas editáveis criadas no app) ---

/** Abre uma página no painel lateral (visualização ou edição). */
function openPage(page, { edit = false } = {}) {
  if (!fileViewer || !fvBody) return;
  if (fvTitle) fvTitle.textContent = page.title;
  if (fvDownload) fvDownload.hidden = true;
  fvBody.innerHTML = "";
  fileViewer.hidden = false;
  mountPageEditor(page, {
    container: fvBody,
    titleEl: fvTitle,
    canEdit: identity.isGm,
    startInEdit: edit,
    onSave: async (patch) => {
      const updated = await pages.update(page.id, patch);
      const idx = allPages.findIndex((p) => p.id === page.id);
      if (idx >= 0) allPages[idx] = updated;
      renderLibrary();
      return updated;
    },
  });
}

async function createPage() {
  try {
    const page = await pages.create({ title: "Nova página", folder: currentFolder });
    allPages.unshift(page);
    renderLibrary();
    openPage(page, { edit: true });
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

async function renamePage(page) {
  const title = prompt("Título da página:", page.title);
  if (title == null) return;
  const trimmed = title.trim();
  if (!trimmed || trimmed === page.title) return;
  try {
    const updated = await pages.update(page.id, { title: trimmed });
    const idx = allPages.findIndex((p) => p.id === page.id);
    if (idx >= 0) allPages[idx] = updated;
    renderLibrary();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

async function movePage(page) {
  const folder = await pickFolder({ title: "Mover página para…", current: page.folder || "" });
  if (folder === null) return;
  try {
    const updated = await pages.update(page.id, { folder });
    if (folder) registerFolder(folder);
    const idx = allPages.findIndex((p) => p.id === page.id);
    if (idx >= 0) allPages[idx] = updated;
    renderLibrary();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

async function deletePageById(page) {
  if (!confirm(`Excluir a página "${page.title}"?`)) return;
  try {
    await pages.remove(page.id);
    allPages = allPages.filter((p) => p.id !== page.id);
    renderLibrary();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

function pageContextItems(page) {
  return [
    { label: "Abrir", icon: ICONS.open, onClick: () => openPage(page) },
    { label: "Editar", icon: ICONS.rename, onClick: () => openPage(page, { edit: true }) },
    { separator: true },
    { label: "Renomear", icon: ICONS.note, onClick: () => renamePage(page) },
    { label: "Mover para…", icon: ICONS.folder, onClick: () => movePage(page) },
    {
      label: "Compartilhar com…",
      icon: ICONS.share,
      onClick: () => openShareMenu({ type: "page", page_id: page.id, title: page.title }),
    },
    { separator: true },
    { label: "Excluir", icon: ICONS.remove, danger: true, onClick: () => deletePageById(page) },
  ];
}

const TYPE_LABEL = { map: "Mapa", token: "Token", pdf: "PDF", doc: "Documento", audio: "Áudio" };

/** Botão de menu (kebab) que abre o menu de contexto do item. */
function exKebab(getItems) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ex-menu";
  btn.title = "Ações";
  btn.innerHTML = svgMarkup(ICONS.dots, 18);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    _ctxX = e.clientX;
    _ctxY = e.clientY;
    openContextMenu(e.clientX, e.clientY, getItems());
  });
  return btn;
}

function pageRow(page) {
  const row = document.createElement("div");
  row.className = "ex-row clickable";
  const ico = document.createElement("span");
  ico.className = "ex-ico page";
  ico.innerHTML = svgMarkup(ICONS.note, 20);
  const name = document.createElement("span");
  name.className = "ex-name";
  name.title = page.title;
  name.textContent = page.title;
  const type = document.createElement("span");
  type.className = "ex-type";
  type.textContent = "Página";
  row.append(ico, name, type, exKebab(() => pageContextItems(page)));
  row.addEventListener("click", () => openPage(page));
  makeDraggable(row, { type: "page", id: page.id });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, pageContextItems(page));
  });
  return row;
}

// --- Explorer: arraste para mover e criação de pastas ---
function makeDraggable(el, item) {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    _dragItem = item;
    el.classList.add("dragging-card");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  el.addEventListener("dragend", () => {
    _dragItem = null;
    el.classList.remove("dragging-card");
    document.querySelectorAll(".drop-target").forEach((t) => t.classList.remove("drop-target"));
  });
}

async function moveDraggedTo(destFolder) {
  const d = _dragItem;
  _dragItem = null;
  if (!d) return;
  // Não faz nada se já está na pasta de destino.
  try {
    if (d.type === "asset") await assets.update(d.id, { folder: destFolder });
    else if (d.type === "page") await pages.update(d.id, { folder: destFolder });
    if (destFolder) registerFolder(destFolder);
    await refreshAssets();
  } catch (err) {
    log(`[erro] ${err.message}`);
  }
}

/** Cria uma subpasta na pasta atual (aparece na mesma visualização). */
function createFolderPrompt() {
  const name = prompt("Nome da nova pasta:");
  if (!name) return;
  const seg = name.trim().replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!seg) return;
  const path = currentFolder ? `${currentFolder}/${seg}` : seg;
  registerFolder(path);
  renderLibrary();
}

/**
 * Abre um modal para escolher a pasta de destino. Resolve com o caminho
 * escolhido (string, "" = raiz) ou null se cancelado.
 */
function pickFolder({ title = "Escolher pasta", current = "" } = {}) {
  return new Promise((resolve) => {
    const folderSet = new Set(knownFolders);
    for (const a of allAssets) if (a.folder) folderSet.add(a.folder);
    for (const p of allPages) if (p.folder) folderSet.add(p.folder);
    const list = ["", ...[...folderSet].filter(Boolean).sort()];
    let selected = list.includes(current) ? current : "";

    const body = document.createElement("div");
    body.className = "folder-picker";

    const listEl = document.createElement("div");
    listEl.className = "fp-list";
    const rows = [];
    for (const f of list) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "fp-row" + (f === selected ? " active" : "");
      row.innerHTML = svgMarkup(f === "" ? ICONS.map : ICONS.folder, 18);
      const span = document.createElement("span");
      span.textContent = f === "" ? "Biblioteca (raiz)" : f;
      row.append(span);
      row.addEventListener("click", () => {
        selected = f;
        newInput.value = "";
        rows.forEach((r) => r.classList.remove("active"));
        row.classList.add("active");
      });
      rows.push(row);
      listEl.append(row);
    }

    const newWrap = document.createElement("label");
    newWrap.className = "fp-new";
    const cap = document.createElement("span");
    cap.textContent = "Ou crie uma nova subpasta (dentro da selecionada)";
    const newInput = document.createElement("input");
    newInput.type = "text";
    newInput.placeholder = "ex.: masmorra/sala1";
    newWrap.append(cap, newInput);

    body.append(listEl, newWrap);

    let resolved = false;
    openModal({
      title,
      bodyEl: body,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      },
      actions: [
        { label: "Cancelar", onClick: (close) => close() },
        {
          label: "Confirmar",
          primary: true,
          onClick: (close) => {
            let folder = selected;
            const extra = sanitizeFolderPath(newInput.value);
            if (extra) folder = selected ? `${selected}/${extra}` : extra;
            resolved = true;
            resolve(folder);
            close();
          },
        },
      ],
    });
  });
}

// --- Compartilhamento de itens com jogadores ---
const sharedListEl = document.getElementById("shared-list");
let sharedItems = [];
let _ctxX = 0;
let _ctxY = 0;
document.addEventListener(
  "contextmenu",
  (e) => {
    _ctxX = e.clientX;
    _ctxY = e.clientY;
  },
  true,
);

function shareItemTo(to, item) {
  ws.send(MESSAGE_TYPES.LIBRARY_SHARE, { to, item });
  const who = to === "*" ? "todos os jogadores" : to;
  log(`[biblioteca] compartilhado com ${who}: ${item.name || item.title || "item"}`);
}

/** Abre um submenu com os jogadores conectados para compartilhar o item. */
function openShareMenu(item) {
  const players = roster.filter((u) => !u.is_gm && u.user_id !== identity.userId);
  const items = [];
  if (!players.length) {
    items.push({ label: "Nenhum jogador conectado", onClick: () => {} });
  } else {
    for (const u of players) {
      items.push({ label: u.user_id, icon: ICONS.token, onClick: () => shareItemTo(u.user_id, item) });
    }
    items.push({ separator: true });
    items.push({ label: "Todos os jogadores", icon: ICONS.share, onClick: () => shareItemTo("*", item) });
  }
  openContextMenu(_ctxX, _ctxY, items);
}

/** Abre um item que foi compartilhado com este cliente. */
async function openSharedItem(item) {
  if (item.type === "asset") {
    openFileViewer({ kind: item.kind, url: item.url, original_name: item.name });
  } else if (item.type === "page") {
    try {
      const page = await pages.get(item.page_id);
      openPage(page);
    } catch (err) {
      log(`[erro] ${err.message}`);
    }
  }
}

function renderShared() {
  if (!sharedListEl) return;
  sharedListEl.innerHTML = "";
  if (!sharedItems.length) {
    sharedListEl.innerHTML = '<div class="asset-empty">Nada compartilhado ainda.</div>';
    return;
  }
  for (const it of sharedItems) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "shared-item";
    const icon = it.type === "page" ? ICONS.note : KIND_SVG[it.kind] || ICONS.open;
    row.innerHTML = svgMarkup(icon, 20);
    const span = document.createElement("span");
    span.className = "shared-name";
    span.textContent = it.name || it.title || "item";
    row.append(span);
    row.title = "Abrir";
    row.addEventListener("click", () => openSharedItem(it));
    sharedListEl.append(row);
  }
}

function addSharedItem(item, from) {
  const key = item.type === "page" ? `page:${item.page_id}` : `asset:${item.url}`;
  sharedItems = sharedItems.filter((s) => s._key !== key);
  sharedItems.unshift({ ...item, _key: key, from });
  renderShared();
  const label = item.name || item.title || "item";
  log(`[compartilhado] ${from || "Mestre"} enviou: ${label}`);
}

function assetRow(a) {
  const row = document.createElement("div");
  row.className = "ex-row";
  const ico = document.createElement("span");
  ico.className = "ex-ico";
  if (a.kind === "map" || a.kind === "token") {
    ico.classList.add("ex-thumb");
    ico.style.backgroundImage = `url("${a.url}")`;
  } else {
    ico.innerHTML = svgMarkup(KIND_SVG[a.kind] || ICONS.map, 20);
  }
  const name = document.createElement("span");
  name.className = "ex-name";
  name.title = a.original_name;
  name.textContent = a.original_name;
  const type = document.createElement("span");
  type.className = "ex-type";
  type.textContent = TYPE_LABEL[a.kind] || a.kind;
  row.append(ico, name, type, exKebab(() => assetContextItems(a)));
  if (isViewable(a)) {
    row.classList.add("clickable");
    row.addEventListener("click", () => openFileViewer(a));
  }
  makeDraggable(row, { type: "asset", id: a.id });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, assetContextItems(a));
  });
  return row;
}

function folderRow(name) {
  const row = document.createElement("div");
  row.className = "ex-row folder clickable";
  const ico = document.createElement("span");
  ico.className = "ex-ico folder";
  ico.innerHTML = svgMarkup(ICONS.folder, 20);
  const nm = document.createElement("span");
  nm.className = "ex-name";
  nm.title = name;
  nm.textContent = name;
  const type = document.createElement("span");
  type.className = "ex-type";
  type.textContent = "Pasta";

  const enter = () => {
    currentFolder = currentFolder ? `${currentFolder}/${name}` : name;
    renderLibrary();
  };
  const folderItems = () => [
    { label: "Abrir", icon: ICONS.folder, onClick: enter },
    { separator: true },
    { label: "Renomear", icon: ICONS.rename, onClick: () => renameFolder(name) },
    { label: "Excluir", icon: ICONS.remove, danger: true, onClick: () => deleteFolder(name) },
  ];

  row.append(ico, nm, type, exKebab(folderItems));
  row.addEventListener("click", enter);
  // Alvo de soltar: mover o item arrastado para dentro desta pasta.
  const dest = () => (currentFolder ? `${currentFolder}/${name}` : name);
  row.addEventListener("dragover", (e) => {
    if (!_dragItem) return;
    e.preventDefault();
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drop-target");
    moveDraggedTo(dest());
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, folderItems());
  });
  return row;
}

function renderBreadcrumb() {
  if (!libPath) return;
  libPath.innerHTML = "";
  if (libUpBtn) libUpBtn.disabled = !currentFolder;
  const crumb = (label, path, isCurrent) => {
    const b = document.createElement("button");
    b.className = "crumb" + (isCurrent ? " current" : "");
    b.textContent = label;
    if (!isCurrent) {
      b.addEventListener("click", () => {
        currentFolder = path;
        renderLibrary();
      });
    }
    return b;
  };
  const parts = currentFolder ? currentFolder.split("/") : [];
  libPath.append(crumb("Biblioteca", "", parts.length === 0));
  let acc = "";
  parts.forEach((p, i) => {
    const sep = document.createElement("span");
    sep.className = "crumb-sep";
    sep.textContent = "/";
    libPath.append(sep);
    acc = acc ? `${acc}/${p}` : p;
    libPath.append(crumb(p, acc, i === parts.length - 1));
  });
}

function renderLibrary() {
  if (!assetGrid) return;
  assetGrid.className = "explorer-list";
  renderBreadcrumb();
  // Combina pastas conhecidas (mesmo vazias) com as pastas de assets e páginas.
  const folderPaths = new Set(knownFolders);
  for (const a of allAssets) if (a.folder) folderPaths.add(a.folder);
  for (const p of allPages) if (p.folder) folderPaths.add(p.folder);
  const subs = subfoldersOf(folderPaths, currentFolder);
  const items = allAssets.filter((a) => (a.folder || "") === currentFolder);
  const pageItems = allPages.filter((p) => (p.folder || "") === currentFolder);

  assetGrid.innerHTML = "";
  if (!subs.size && !items.length && !pageItems.length) {
    assetGrid.innerHTML = '<div class="asset-empty">Pasta vazia.</div>';
    return;
  }
  for (const s of [...subs].sort()) assetGrid.append(folderRow(s));
  for (const p of pageItems) assetGrid.append(pageRow(p));
  for (const a of items) assetGrid.append(assetRow(a));
}

function renderTokenPicker(tokenAssets) {
  if (!tokenPickerGrid) return;
  tokenPickerGrid.innerHTML = "";
  if (!tokenAssets.length) {
    tokenPickerGrid.innerHTML =
      '<div class="picker-empty">Envie imagens de token na aba Biblioteca.</div>';
    return;
  }
  for (const a of tokenAssets) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "picker-token";
    el.title = a.original_name;
    el.style.backgroundImage = `url("${a.url}")`;
    el.addEventListener("click", () => {
      const nameField = document.getElementById("token-name");
      createTokenFromImage(a.url, {
        name: nameField?.value.trim() || a.original_name,
        owner_id: tokenOwnerSelect?.value || null,
        is_hidden: document.getElementById("token-hidden")?.checked || false,
      });
    });
    tokenPickerGrid.append(el);
  }
}

async function refreshAssets() {
  if (!identity.isGm) return;
  try {
    const [assetList, pageList] = await Promise.all([assets.list(), pages.list()]);
    allAssets = assetList;
    allPages = pageList;
    renderLibrary();
    // O picker sempre lista TODOS os tokens (independe da pasta atual).
    const tokens = allAssets.filter((a) => a.kind === "token");
    renderTokenPicker(tokens);
  } catch (err) {
    log(`[erro] biblioteca: ${err.message}`);
  }
}

if (identity.isGm) {
  // Dropzone: nome do arquivo + arrastar/soltar.
  uploadInput?.addEventListener("change", () => {
    if (uploadFileName && uploadInput.files[0]) {
      uploadFileName.textContent = uploadInput.files[0].name;
    }
  });
  ["dragover", "dragenter"].forEach((ev) =>
    dropzone?.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone?.addEventListener(ev, () => dropzone.classList.remove("dragover")),
  );
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) {
      uploadInput.files = e.dataTransfer.files;
      if (uploadFileName) uploadFileName.textContent = e.dataTransfer.files[0].name;
    }
  });

  uploadForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const file = uploadInput?.files?.[0];
    if (!file) {
      log("[biblioteca] selecione um arquivo primeiro.");
      return;
    }
    // Popup para escolher a pasta de destino. Sugere a pasta padrão do tipo
    // quando estamos na raiz; caso contrário, a pasta atual.
    const KIND_FOLDER = { map: "Mapas", token: "Tokens", pdf: "PDFs", doc: "PDFs", audio: "Audio" };
    const suggested = currentFolder || KIND_FOLDER[uploadKind.value] || "";
    const folder = await pickFolder({
      title: "Enviar para qual pasta?",
      current: suggested,
    });
    if (folder === null) return; // cancelado
    try {
      const asset = await assets.upload(uploadKind.value, file, folder);
      if (folder) registerFolder(folder);
      currentFolder = folder; // navega para onde o arquivo foi enviado
      log(`[biblioteca] enviado: ${asset.original_name}`);
      uploadForm.reset();
      if (uploadFileName) uploadFileName.textContent = "Imagens, PDF ou áudio";
      await refreshAssets();
    } catch (err) {
      log(`[erro] upload: ${err.message}`);
    }
  });

  // Criar nova pasta (subpasta na pasta atual).
  newFolderBtn?.addEventListener("click", () => createFolderPrompt());

  // Criar nova página (abre já no editor).
  newPageBtn?.addEventListener("click", () => createPage());

  // Voltar uma pasta (subir nível), com suporte a soltar itens para movê-los.
  libUpBtn?.addEventListener("click", () => {
    if (!currentFolder) return;
    const parts = currentFolder.split("/");
    parts.pop();
    currentFolder = parts.join("/");
    renderLibrary();
  });
  libUpBtn?.addEventListener("dragover", (e) => {
    if (!_dragItem || !currentFolder) return;
    e.preventDefault();
    libUpBtn.classList.add("drop-target");
  });
  libUpBtn?.addEventListener("dragleave", () => libUpBtn.classList.remove("drop-target"));
  libUpBtn?.addEventListener("drop", (e) => {
    e.preventDefault();
    libUpBtn.classList.remove("drop-target");
    if (!currentFolder) return;
    const parts = currentFolder.split("/");
    parts.pop();
    moveDraggedTo(parts.join("/"));
  });

  // Menu de contexto na área vazia da grade: nova página / nova pasta.
  assetGrid?.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".ex-row")) return; // linha tem menu próprio
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: "Nova página", icon: ICONS.note, onClick: () => createPage() },
      { label: "Nova pasta", icon: ICONS.folder, onClick: () => createFolderPrompt() },
    ]);
  });
}

async function boot() {
  // Listeners de rede registrados ANTES de conectar.
  ws.on("open", () => {
    setStatus(true);
    log(`WS conectado como ${identity.userId}${identity.isGm ? " (GM)" : ""}.`);
    table.requestScene();
  });
  ws.on("close", () => {
    setStatus(false);
    log("WS desconectado. Reconectando...");
  });
  ws.on(MESSAGE_TYPES.CHAT, (p) => {
    const who = p.is_gm ? "GM" : p.user_id || "?";
    log(`[chat] ${who}: ${p.text}`);
  });
  ws.on(MESSAGE_TYPES.PRESENCE_LIST, (p) => {
    roster = p?.users || [];
    renderOwnerOptions();
  });
  ws.on(MESSAGE_TYPES.ERROR, (p) => log(`[erro] ${p?.reason ?? "?"}`));
  ws.on(MESSAGE_TYPES.SCENE_STATE, (scene) => {
    if (sceneNameEl) sceneNameEl.textContent = scene.name;
    if (gridToggle) gridToggle.checked = scene.grid.enabled;
    if (metersInput) metersInput.value = scene.grid.meters_per_square;
    // Tamanho do mapa em metros = px / (px por metro).
    const pxPerMeter = scene.grid.size_px / scene.grid.meters_per_square;
    if (mapWidthM) mapWidthM.value = Math.round(scene.width / pxPerMeter);
    if (mapHeightM) mapHeightM.value = Math.round(scene.height / pxPerMeter);
    log(`Cena "${scene.name}" carregada (${scene.tokens.length} tokens).`);
  });

  // Áudio compartilhado (trilha do Mestre).
  ws.on(MESSAGE_TYPES.AUDIO_PLAY, (p) => {
    if (!bgAudio || !p?.url) return;
    bgAudio.loop = p.loop !== false;
    if (bgAudio.src !== location.origin + p.url) bgAudio.src = p.url;
    bgAudio.play().catch(() => log("Toque na tela para permitir o áudio."));
    log("[trilha] iniciada pelo Mestre.");
  });
  ws.on(MESSAGE_TYPES.AUDIO_STOP, () => {
    if (bgAudio) bgAudio.pause();
    log("[trilha] parada.");
  });

  // PDF compartilhado pelo Mestre.
  ws.on(MESSAGE_TYPES.PDF_SHARE, (p) => {
    if (!p?.url) return;
    logLink("Documento compartilhado:", p.url, p.name || "Abrir PDF");
  });

  // Item da biblioteca compartilhado diretamente com este cliente.
  ws.on(MESSAGE_TYPES.LIBRARY_SHARE, (p) => {
    if (!p?.item) return;
    addSharedItem(p.item, p.from);
  });

  // 1) Conecta o WebSocket PRIMEIRO — independente do Pixi.
  table.start();
  dice.start();
  tools.start();
  ws.connect({
    campaign_id: identity.campaignId,
    user_id: identity.userId,
    is_gm: identity.isGm,
  });

  // Carrega a biblioteca de assets (GM).
  refreshAssets();

  // 2) Inicializa a Mesa (PixiJS) de forma isolada; falha aqui não derruba a conexão.
  try {
    await view.init();
    inputCtl = new InputController(view);
    inputCtl.attach();
  } catch (err) {
    console.error("[Mesa] Falha ao iniciar o PixiJS:", err);
    log("Erro ao carregar a Mesa (PixiJS). Verifique a internet (CDN).");
  }

  // 3) Inicializa os dados 3D (Three.js), também isolado.
  try {
    await diceView.init();
  } catch (err) {
    console.error("[Dados] Falha ao iniciar o Three.js:", err);
    log("Erro ao carregar os dados 3D (Three.js). Verifique a internet (CDN).");
  }

  // 4) Fundo Aurora (WebGL) — puramente estético, nunca bloqueia nada.
  try {
    const auroraCanvas = document.getElementById("aurora");
    if (auroraCanvas) new AuroraBackground(auroraCanvas).init();
  } catch (err) {
    console.warn("[Aurora] não iniciada:", err);
  }
}

boot();

// Exposto para depuração no console do navegador.
window.__neferus = { ws, state, view, table, dice, diceView, identity, MESSAGE_TYPES };
