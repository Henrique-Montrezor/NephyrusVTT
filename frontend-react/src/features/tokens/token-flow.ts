export function findSheetToken<T extends { sheet_id?: string | null }>(
  tokens: T[],
  sheetId: string,
): T | undefined {
  return tokens.find((token) => token.sheet_id === sheetId);
}

export function libraryPlacement(kind: string): "map" | "token" | null {
  return kind === "map" || kind === "token" ? kind : null;
}

export const cleanAssetName = (name: string): string =>
  name.replace(/\.(png|jpe?g|webp|gif|avif)$/i, "");

export function sheetCards<
  S extends { id: string },
  T extends { sheet_id?: string | null },
>(sheets: S[], tokenCatalog: T[]): { sheet: S; token?: T }[] {
  return sheets.map((sheet) => ({
    sheet,
    token: tokenCatalog.find((token) => token.sheet_id === sheet.id),
  }));
}

export function sortInitiative<T extends { initiative: number; sortOrder: number }>(tokens: T[]): T[] {
  return [...tokens].sort((left, right) => right.initiative - left.initiative || left.sortOrder - right.sortOrder);
}

export function reorderTokens<T extends { id: number }>(tokens: T[], tokenId: number, beforeId: number): T[] {
  const next = tokens.filter((token) => token.id !== tokenId);
  const moved = tokens.find((token) => token.id === tokenId);
  if (!moved) return next;
  const target = next.findIndex((token) => token.id === beforeId);
  next.splice(target < 0 ? next.length : target, 0, moved);
  return next;
}
