import { signal } from "@preact/signals";
import type { TokenCatalogItem } from "@/net/types";

export const tokenCatalog = signal<TokenCatalogItem[]>([]);

export function replaceTokenCatalog(items: TokenCatalogItem[]): void {
  tokenCatalog.value = [...items];
}

export function upsertCatalogToken(item: TokenCatalogItem): void {
  const index = tokenCatalog.value.findIndex((token) => token.id === item.id);
  if (index < 0) tokenCatalog.value = [...tokenCatalog.value, item];
  else tokenCatalog.value = tokenCatalog.value.map((token, i) => (i === index ? item : token));
}

export function removeCatalogToken(id: number): void {
  tokenCatalog.value = tokenCatalog.value.filter((token) => token.id !== id);
}
