import { describe, expect, it } from "vitest";
import { cleanAssetName, findSheetToken, libraryPlacement, sheetCards } from "./token-flow";

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

  it("keeps multiple sheets per owner and links tokens by sheet id", () => {
    const sheets = [
      { id: "a", owner_id: "player-1", title: "Heroína" },
      { id: "b", owner_id: "player-1", title: "Familiar" },
    ];
    const tokens = [{ id: 9, sheet_id: "b", name: "Corvo" }];
    expect(sheetCards(sheets, tokens).map(({ sheet, token }) => [sheet.id, token?.id])).toEqual([
      ["a", undefined],
      ["b", 9],
    ]);
  });
});
