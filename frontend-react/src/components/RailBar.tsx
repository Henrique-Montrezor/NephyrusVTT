import {
  Books,
  ChatCircleDots,
  DiceFive,
  FileText,
  MapTrifold,
  SlidersHorizontal,
  UploadSimple,
  UsersThree,
} from "@phosphor-icons/react";
import { activeTab, dockOpen, type DockTab } from "@/state/ui-store";
import { identity } from "@/state/identity";

interface TabDef {
  id: DockTab;
  label: string;
  gmOnly?: boolean;
  playerOnly?: boolean;
  icon: typeof ChatCircleDots;
}

const TABS: TabDef[] = [
  { id: "chat", label: "Chat", icon: ChatCircleDots },
  { id: "dice", label: "Dados", icon: DiceFive },
  { id: "sheet", label: "Ficha", icon: FileText },
  { id: "tokens", label: "Tokens", icon: UsersThree },
  { id: "scene", label: "Cena", icon: MapTrifold },
  { id: "shared", label: "Compart.", icon: UploadSimple },
  { id: "library", label: "Biblioteca", gmOnly: true, icon: Books },
  { id: "system", label: "Sistema", gmOnly: true, icon: SlidersHorizontal },
];

export function RailBar() {
  const isGm = identity.value.isGm;
  const activateTab = (tab: DockTab) => {
    if (activeTab.value === tab) {
      dockOpen.value = !dockOpen.value;
      return;
    }
    activeTab.value = tab;
    dockOpen.value = true;
  };

  return (
    <nav class="railbar" role="tablist" aria-label="Painéis da mesa">
      {TABS.filter((tab) => (!tab.gmOnly || isGm)
        && (!tab.playerOnly || !isGm)
        && (isGm || ["chat", "dice", "sheet", "tokens"].includes(tab.id)))
        .map((tab) => {
          const TabIcon = tab.icon;
          const selected = activeTab.value === tab.id;
          return (
            <button
              key={tab.id}
              class={`tab-btn${selected ? " active" : ""}`}
              title={tab.label}
              aria-label={tab.label}
              aria-selected={selected}
              aria-controls="dock"
              onClick={() => activateTab(tab.id)}
            >
              <TabIcon size={23} weight={selected ? "bold" : "regular"} />
              <span>{tab.label}</span>
            </button>
          );
        })}
    </nav>
  );
}
