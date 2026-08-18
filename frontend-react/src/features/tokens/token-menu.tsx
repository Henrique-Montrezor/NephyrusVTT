/**
 * Menu de contexto do token (botão direito na mesa) e modal de condições.
 * Porta openTokenMenu/openConditionsMenu do main.js para os hosts de UI novos.
 */
import { openContextMenu, type ContextMenuItem } from "@/ui/context-menu";
import { openModal } from "@/ui/modal";
import { ICONS, CONDITION_DEFS } from "@/lib/token-icons";
import { tokens } from "@/state/game-store";
import { identity } from "@/state/identity";
import { session } from "@/session";
import type { TokenLayer } from "@/net/types";
import { useState } from "preact/hooks";

const LAYER_DEFS: { key: TokenLayer; label: string; icon: string }[] = [
  { key: "map", label: "Mapa", icon: ICONS.map },
  { key: "object", label: "Tokens", icon: ICONS.token },
  { key: "gm", label: "GM", icon: ICONS.conditions },
];

export function openTokenMenu(tokenId: number, clientX: number, clientY: number): void {
  const table = session.value?.table;
  const engine = session.value?.input.view;
  const token = tokens.value.get(tokenId);
  if (!table || !engine || !token || !table.canControlToken(token)) return;

  const isGm = identity.value.isGm;
  const items: ContextMenuItem[] = [
    {
      label: "Renomear",
      icon: ICONS.rename,
      onClick: () => {
        const name = prompt("Novo nome do token:", token.name);
        if (name && name.trim()) table.updateToken(tokenId, { name: name.trim() });
      },
    },
    { label: "Redimensionar", icon: ICONS.resize, onClick: () => engine.selectToken(tokenId) },
    {
      label: token.isLocked ? "Destravar" : "Travar",
      icon: token.isLocked ? ICONS.unlock : ICONS.lock,
      onClick: () => table.setTokenLock(tokenId, !token.isLocked),
    },
    {
      label: token.lightRadius > 0 ? "Luz (editar)" : "Ponto de luz",
      icon: ICONS.light,
      onClick: () => {
        const cur = token.lightRadius > 0 ? String(token.lightRadius) : "6";
        const val = prompt("Raio de luz em metros (0 remove):", cur);
        if (val === null) return;
        const m = parseFloat(val.replace(",", "."));
        table.setTokenLight(tokenId, Number.isFinite(m) ? m : 0);
      },
    },
    {
      label: `Condições${token.conditions.length ? ` (${token.conditions.length})` : ""}`,
      icon: ICONS.conditions,
      onClick: () => openConditionsModal(tokenId),
    },
  ];

  if (isGm) {
    items.push({
      label: `Camada: ${LAYER_DEFS.find((l) => l.key === token.layer)?.label ?? "Tokens"}`,
      icon: ICONS.map,
      onClick: () => openLayerMenu(tokenId, clientX, clientY),
    });
    items.push({
      label: token.isHidden ? "Revelar" : "Esconder",
      icon: token.isHidden ? ICONS.reveal : ICONS.hide,
      onClick: () => table.toggleTokenVisibility(tokenId),
    });
    items.push({ separator: true });
    items.push({ label: "Remover da cena", icon: ICONS.remove, danger: true, onClick: () => table.removeToken(tokenId) });
  }

  openContextMenu(clientX, clientY, items);
}

function openLayerMenu(tokenId: number, x: number, y: number): void {
  const table = session.value?.table;
  const token = tokens.value.get(tokenId);
  if (!table || !token) return;
  const items: ContextMenuItem[] = [
    { label: "‹ Voltar", onClick: () => openTokenMenu(tokenId, x, y) },
    ...LAYER_DEFS.map((def) => ({
      label: `${def.label}${token.layer === def.key ? " ✓" : ""}`,
      icon: def.icon,
      onClick: () => table.setTokenLayer(tokenId, def.key),
    })),
  ];
  openContextMenu(x, y, items);
}

function ConditionsBody({ tokenId }: { tokenId: number }) {
  const token = tokens.value.get(tokenId);
  const [active, setActive] = useState<Set<string>>(new Set(token?.conditions ?? []));

  const toggle = (key: string) => {
    const next = new Set(active);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setActive(next);
    session.value?.table.setTokenConditions(tokenId, [...next]);
  };

  return (
    <div class="conditions-grid">
      {CONDITION_DEFS.map((c) => (
        <button
          key={c.key}
          type="button"
          class={`cond-item${active.has(c.key) ? " on" : ""}`}
          onClick={() => toggle(c.key)}
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" style={{ color: c.color }} dangerouslySetInnerHTML={{ __html: c.svg }} />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function openConditionsModal(tokenId: number): void {
  openModal({
    title: "Condições",
    body: <ConditionsBody tokenId={tokenId} />,
    actions: [{ label: "Fechar", primary: true }],
  });
}
