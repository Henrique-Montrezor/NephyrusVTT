import { describe, expect, it } from "vitest";
import { cleanAssetName, findSheetToken, libraryPlacement } from "./token-flow";

describe("token flow", () => {
  it("finds the token linked to the selected sheet", () => {
    const catalog = [
      { id: 7, sheet_id: "other" },
      { id: 9, sheet_id: "sheet-1" },
    ];
    expect(findSheetToken(catalog, "sheet-1")?.id).toBe(9);
  });

  it("routes only maps and token images to the table", () => {
    expect(libraryPlacement("token")).toBe("token");
    expect(libraryPlacement("map")).toBe("map");
    expect(libraryPlacement("pdf")).toBeNull();
  });

  it.each(["hero.png", "hero.JPG", "hero.jpeg", "hero.webp", "hero.gif", "hero.avif"])(
    "removes the image extension from %s",
    (name) => expect(cleanAssetName(name)).toBe("hero"),
  );
});
