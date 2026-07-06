import { describe, it, expect } from "vitest";
import { directoryOptions } from "./directory-options";

const dir = [
  { id: "msk", label: "Москва" },
  { id: "spb", label: "Санкт-Петербург" },
];

describe("directoryOptions", () => {
  it("hides entries whose id is already among items", () => {
    const { available } = directoryOptions(
      [{ id: "msk", label: "Москва" }],
      dir,
      "",
      false,
    );
    expect(available.map((d) => d.id)).toEqual(["spb"]);
  });

  it("offers a custom entry when allowCustom and query is not in directory", () => {
    const { custom } = directoryOptions([], dir, "Тула", true);
    expect(custom).toBe("Тула");
  });

  it("no custom entry when allowCustom is false", () => {
    const { custom } = directoryOptions([], dir, "Тула", false);
    expect(custom).toBeNull();
  });

  it("no custom entry when query matches an existing directory label (case-insensitive)", () => {
    const { custom } = directoryOptions([], dir, "москва", true);
    expect(custom).toBeNull();
  });

  it("no custom entry for empty/whitespace query", () => {
    expect(directoryOptions([], dir, "   ", true).custom).toBeNull();
  });
});
