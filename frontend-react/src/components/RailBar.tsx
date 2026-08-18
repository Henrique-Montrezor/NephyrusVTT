import { activeTab, type DockTab } from "@/state/ui-store";
import { identity } from "@/state/identity";
import type { VNode } from "preact";

interface TabDef {
  id: DockTab;
  label: string;
  gmOnly?: boolean;
  icon: VNode;
}

const TABS: TabDef[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 5 h16 a1.5 1.5 0 0 1 1.5 1.5 v9 A1.5 1.5 0 0 1 20 17 H9 l-4 3.5 V17 A1.5 1.5 0 0 1 3.5 15.5 v-9 A1.5 1.5 0 0 1 5 5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M8 10 h8 M8 13 h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    ),
  },
  {
    id: "dice",
    label: "Dados",
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2 L20.5 7 V17 L12 22 L3.5 17 V7 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M12 2 V8 M3.6 7 L12 8 L20.4 7 M6 15.5 L12 8 L18 15.5 M6 15.5 L12 22 L18 15.5" stroke="currentColor" stroke-width="1" opacity=".65" />
      </svg>
    ),
  },
  {
    id: "tokens",
    label: "Tokens",
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6" />
        <path d="M3.5 19 a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <path d="M16 6.2 a3 3 0 0 1 0 5.6 M17.2 19 a5.2 5.2 0 0 0-2.4-4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    ),
  },
  {
    id: "scene",
    label: "Cena",
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 4 L3 6 V20 L9 18 L15 20 L21 18 V4 L15 6 L9 4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M9 4 V18 M15 6 V20" stroke="currentColor" stroke-width="1.3" />
      </svg>
    ),
  },
  {
    id: "shared",
    label: "Compart.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <path d="M12 3v11M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    ),
  },
  {
    id: "library",
    label: "Biblioteca",
    gmOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M6 4 h11 a1.5 1.5 0 0 1 1.5 1.5 V20 H7.5 A1.5 1.5 0 0 1 6 18.5 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M6 18.5 A1.5 1.5 0 0 1 7.5 17 H18.5" stroke="currentColor" stroke-width="1.5" />
      </svg>
    ),
  },
];

export function RailBar() {
  const isGm = identity.value.isGm;
  return (
    <nav class="railbar" role="tablist">
      {TABS.filter((t) => !t.gmOnly || isGm).map((t) => (
        <button
          key={t.id}
          class={`tab-btn${activeTab.value === t.id ? " active" : ""}`}
          title={t.label}
          aria-label={t.label}
          onClick={() => (activeTab.value = t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
