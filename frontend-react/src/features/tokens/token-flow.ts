export function findSheetToken<T extends { sheet_id?: string | null }>(
  tokens: T[],
  sheetId: string,
): T | undefined {
  return tokens.find((token) => token.sheet_id === sheetId);
}

export function libraryPlacement(kind: string): "map" | "token" | null {
  return kind === "map" || kind === "token" ? kind : null;
}
