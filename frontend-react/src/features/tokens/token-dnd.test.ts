import { describe, expect, it } from "vitest";
import { readTokenDrag, writeTokenDrag } from "./token-dnd";

describe("token drag payload", () => {
  it("round-trips an asset payload", () => {
    const values = new Map<string, string>();
    const transfer = {
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
      effectAllowed: "none",
    } as unknown as DataTransfer;
    writeTokenDrag(transfer, {
      source: "asset",
      name: "Hero",
      imageUrl: "/storage/hero.png",
    });
    expect(readTokenDrag(transfer)).toEqual({
      source: "asset",
      name: "Hero",
      imageUrl: "/storage/hero.png",
    });
  });

  it("rejects malformed payloads", () => {
    const transfer = { getData: () => "not-json" } as unknown as DataTransfer;
    expect(readTokenDrag(transfer)).toBeNull();
  });
});
