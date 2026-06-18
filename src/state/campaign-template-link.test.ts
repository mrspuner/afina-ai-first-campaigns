import { describe, expect, it } from "vitest";
import type { Campaign } from "./app-state";

describe("Campaign → template linkage", () => {
  it("carries an optional templateIds list", () => {
    const c: Campaign = {
      id: "cmp_1",
      name: "Test",
      status: "draft",
      createdAt: "2026-06-18T00:00:00.000Z",
      sourceType: "new",
      channels: ["email"],
      templateIds: ["tpl_eml_offer"],
    };
    expect(c.templateIds).toEqual(["tpl_eml_offer"]);
  });
});
