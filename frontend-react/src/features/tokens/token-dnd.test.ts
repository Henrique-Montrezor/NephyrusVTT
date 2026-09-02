import { describe, expect, it } from "vitest";
import { readTokenDrag, writeTokenDrag } from "./token-dnd";

describe("token drag payload", () => {
  it("round-trips the token id with the Nephyrus mime type", () => {
    const values = new Map<string, string>();
    const transfer = {
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
      effectAllowed: "none",
    } as unknown as DataTransfer;
    writeTokenDrag(transfer, 42);
    expect(readTokenDrag(transfer)).toBe(42);
  });

  it("rejects invalid values", () => {
    const transfer = { getData: () => "not-a-token" } as unknown as DataTransfer;
    expect(readTokenDrag(transfer)).toBeNull();
  });
});
