import { describe, it, expect } from "vitest";
import { createRightRail } from "./right-rail";

describe("createRightRail", () => {
  it("publishes max active width and never drops to 0 while one remains", () => {
    const rail = createRightRail();
    rail.reserve("a", 480);
    rail.reserve("b", 420);
    expect(rail.current()).toBe(480);
    rail.release("a");
    expect(rail.current()).toBe(420); // NOT 0 — chat-drawer stays reserved
    rail.release("b");
    expect(rail.current()).toBe(0);
  });

  it("treats a zero-width reservation as inactive without affecting the max", () => {
    const rail = createRightRail();
    rail.reserve("a", 480);
    rail.reserve("b", 0);
    expect(rail.current()).toBe(480);
    rail.release("a");
    expect(rail.current()).toBe(0);
  });

  it("re-reserving the same id updates its width instead of duplicating it", () => {
    const rail = createRightRail();
    rail.reserve("a", 480);
    rail.reserve("a", 600);
    expect(rail.current()).toBe(600);
    rail.release("a");
    expect(rail.current()).toBe(0);
  });
});
