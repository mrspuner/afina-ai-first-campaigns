import { describe, it, expect } from "vitest";
import {
  buildAccountInterestSeed,
  buildInterestDirectory,
  moveSuggestionToActive,
} from "./account-interests";
import type { AccountSettings } from "@/types/account-settings";
import { EMPTY_ACCOUNT_SETTINGS } from "@/types/account-settings";

describe("buildAccountInterestSeed", () => {
  it("maps a known direction to its interests with resolved labels", () => {
    const seed = buildAccountInterestSeed("banking");
    expect(seed.length).toBeGreaterThan(0);
    // every entry has a non-empty id and label
    for (const i of seed) {
      expect(i.id).toBeTruthy();
      expect(i.label).toBeTruthy();
    }
    // contains a known banking interest id
    expect(seed.map((i) => i.id)).toContain("credit");
  });

  it("returns an empty array for an unknown direction", () => {
    expect(buildAccountInterestSeed("not-a-direction")).toEqual([]);
  });

  it("returns an empty array for null direction", () => {
    expect(buildAccountInterestSeed(null)).toEqual([]);
  });

  it("drops interest ids missing from the library", () => {
    // every id returned must resolve to a label — no placeholder labels
    const seed = buildAccountInterestSeed("banking");
    expect(seed.every((i) => i.label.length > 0)).toBe(true);
  });
});

describe("moveSuggestionToActive", () => {
  function settingsWith(
    over: Partial<AccountSettings> = {}
  ): AccountSettings {
    return { ...EMPTY_ACCOUNT_SETTINGS, ...over };
  }

  it("moves the matching suggestion into the active interests", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [
        { id: "mortgage", label: "Ипотека" },
        { id: "investments", label: "Инвестиции" },
      ],
    });
    const next = moveSuggestionToActive(settings, "mortgage");
    expect(next.interests.map((i) => i.id)).toEqual(["credit", "mortgage"]);
    expect(next.suggestedInterests.map((i) => i.id)).toEqual(["investments"]);
  });

  it("is a no-op when the id is not a suggestion", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [{ id: "mortgage", label: "Ипотека" }],
    });
    const next = moveSuggestionToActive(settings, "unknown");
    expect(next).toEqual(settings);
  });

  it("does not duplicate an interest already active", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [{ id: "credit", label: "Кредиты" }],
    });
    const next = moveSuggestionToActive(settings, "credit");
    expect(next.interests.map((i) => i.id)).toEqual(["credit"]);
    expect(next.suggestedInterests).toEqual([]);
  });

  it("returns a patch object that only changes the two interest arrays", () => {
    const settings = settingsWith({
      companyName: "Acme",
      interests: [],
      suggestedInterests: [{ id: "mortgage", label: "Ипотека" }],
    });
    const next = moveSuggestionToActive(settings, "mortgage");
    expect(next.companyName).toBe("Acme");
  });
});

describe("buildInterestDirectory", () => {
  it("returns direction interests as {id,label}, excluding already-active ids", () => {
    const dir = buildInterestDirectory("banking", ["credit"]);
    const ids = dir.map((d) => d.id);
    expect(ids).not.toContain("credit"); // активный исключён
    expect(ids).toContain("mortgage"); // из banking-набора
    expect(
      dir.every((d) => typeof d.label === "string" && d.label.length > 0),
    ).toBe(true);
  });

  it("returns empty list for null direction", () => {
    expect(buildInterestDirectory(null, [])).toEqual([]);
  });
});
