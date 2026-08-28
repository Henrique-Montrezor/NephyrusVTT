import { useEffect } from "preact/hooks";
import { Topbar } from "@/components/Topbar";
import { Workspace } from "@/components/Workspace";
import { ModalHost } from "@/ui/modal";
import { ContextMenuHost } from "@/ui/context-menu";
import { theme } from "@/state/ui-store";

export function App() {
  // Aplica o tema salvo ao <html> no primeiro render.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme.value);
  }, []);

  return (
    <>
      <Topbar />
      <Workspace />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
