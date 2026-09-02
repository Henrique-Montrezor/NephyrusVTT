import { beforeEach, describe, expect, it } from "vitest";
import { tokenCatalog, replaceTokenCatalog, upsertCatalogToken } from "./token-catalog-store";

describe("token catalog store", () => {
  beforeEach(() => replaceTokenCatalog([]));

  it("replaces and updates catalog entries", () => {
    replaceTokenCatalog([{ id: 1, name: "Luna" } as never]);
    upsertCatalogToken({ id: 1, name: "Luna ferida" } as never);
    expect(tokenCatalog.value).toHaveLength(1);
    expect(tokenCatalog.value[0].name).toBe("Luna ferida");
  });
});
