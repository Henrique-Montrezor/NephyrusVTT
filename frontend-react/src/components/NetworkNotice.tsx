import { WarningCircle, X } from "@phosphor-icons/react";
import { useEffect } from "preact/hooks";
import { uiNotice } from "@/state/ui-store";

export function NetworkNotice() {
  const notice = uiNotice.value;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      if (uiNotice.value?.id === notice.id) uiNotice.value = null;
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [notice?.id]);

  if (!notice) return null;
  return (
    <aside class="network-notice" role="alert" aria-live="assertive">
      <WarningCircle size={20} weight="duotone" aria-hidden="true" />
      <div>
        <strong>{notice.title}</strong>
        <span>{notice.message}</span>
      </div>
      <button type="button" onClick={() => { uiNotice.value = null; }} aria-label="Fechar aviso">
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  );
}
