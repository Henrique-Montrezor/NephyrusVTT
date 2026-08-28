import { useEffect } from "preact/hooks";
import { Topbar } from "@/components/Topbar";
import { Workspace } from "@/components/Workspace";
import { ModalHost } from "@/ui/modal";
import { ContextMenuHost } from "@/ui/context-menu";
import { theme } from "@/state/ui-store";
import { authState, validateSavedIdentity } from "@/state/identity";
import { SessionGate } from "@/components/SessionGate";

export function App() {
  // Aplica o tema salvo ao <html> no primeiro render.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme.value);
    void validateSavedIdentity();
  }, []);

  if (authState.value === "checking") {
    return <main class="session-loading" aria-live="polite">Preparando sua mesa...</main>;
  }

  if (authState.value === "guest") return <SessionGate />;

  return (
    <>
      <Topbar />
      <Workspace />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
