export const TOKEN_DRAG_MIME = "application/x-nephyrus-token";

export type TokenDragPayload =
  | { source: "catalog"; id: number }
  | { source: "asset"; name: string; imageUrl: string };

export function writeTokenDrag(transfer: DataTransfer, payload: TokenDragPayload): void {
  transfer.effectAllowed = payload.source === "asset" ? "copy" : "move";
  transfer.setData(TOKEN_DRAG_MIME, JSON.stringify(payload));
}

export function readTokenDrag(transfer: DataTransfer): TokenDragPayload | null {
  try {
    const value = JSON.parse(transfer.getData(TOKEN_DRAG_MIME)) as Partial<TokenDragPayload>;
    if (value.source === "catalog" && Number.isInteger(value.id) && Number(value.id) > 0) {
      return { source: "catalog", id: Number(value.id) };
    }
    if (value.source === "asset" && typeof value.name === "string" && typeof value.imageUrl === "string") {
      return { source: "asset", name: value.name, imageUrl: value.imageUrl };
    }
  } catch {
    // Dados externos ou de outro tipo de arraste não pertencem ao Nephyrus.
  }
  return null;
}
