export const TOKEN_DRAG_MIME = "application/x-nephyrus-token";

export function writeTokenDrag(transfer: DataTransfer, tokenId: number): void {
  transfer.effectAllowed = "move";
  transfer.setData(TOKEN_DRAG_MIME, String(tokenId));
}

export function readTokenDrag(transfer: DataTransfer): number | null {
  const id = Number(transfer.getData(TOKEN_DRAG_MIME));
  return Number.isInteger(id) && id > 0 ? id : null;
}
