import { sharedItems } from "@/state/ui-store";

export function SharedPane() {
  const items = sharedItems.value;
  return (
    <section class="tab-pane active">
      <div class="card">
        <h2 class="card-title">Compartilhados comigo</h2>
        <div class="shared-list">
          {items.length === 0 ? (
            <div class="asset-empty">Nada compartilhado ainda.</div>
          ) : (
            items.map((item) => (
              <a key={item.id} class="shared-row" href={item.url} target="_blank" rel="noopener noreferrer">
                <span class="shared-name">{item.name}</span>
                <span class="shared-meta">{item.kind} · {item.from}</span>
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
