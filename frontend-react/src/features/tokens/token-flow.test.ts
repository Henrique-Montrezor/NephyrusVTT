import { describe, expect, it } from "vitest";
import { cleanAssetName, findSheetToken, libraryPlacement, partitionPdfFields, reorderTokens, sheetCards, sortInitiative } from "./token-flow";

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

  it("sorts initiative from highest to lowest and keeps queue order on ties", () => {
    const tokens = [
      { id: 1, initiative: 12, sortOrder: 2 },
      { id: 2, initiative: 18, sortOrder: 4 },
      { id: 3, initiative: 12, sortOrder: 1 },
    ];
    expect(sortInitiative(tokens).map((token) => token.id)).toEqual([2, 3, 1]);
  });

  it("moves one token within the queue without mutating the source", () => {
    const tokens = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(reorderTokens(tokens, 3, 1).map((token) => token.id)).toEqual([3, 1, 2]);
    expect(tokens.map((token) => token.id)).toEqual([1, 2, 3]);
  });

  it("separates positioned PDF fields from noisy unmapped fields", () => {
    const fields = [
      { key: "forca", label: "Força", rect: [10, 10, 20, 5] as [number, number, number, number] },
      { key: "untitled1", label: "untitled1", rect: [0, 0, 10, 4] as [number, number, number, number] },
      { key: "sem_area", label: "Vigor", rect: [0, 0, 0, 0] as [number, number, number, number] },
    ];
    const result = partitionPdfFields(fields);
    expect(result.mapped.map((field) => field.key)).toEqual(["forca"]);
    expect(result.unmapped.map((field) => field.key)).toEqual(["untitled1", "sem_area"]);
  });
});
