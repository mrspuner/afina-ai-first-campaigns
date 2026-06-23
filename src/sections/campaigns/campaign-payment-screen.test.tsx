import { describe, it, expect } from "vitest";
import { scoringLineDisplay } from "./campaign-payment-screen";

describe("scoringLineDisplay (aim #4 label, #5 already-paid amount)", () => {
  it("own source: scoring is free → «бесплатно»", () => {
    expect(scoringLineDisplay({ sourceType: "own", scoring: 0 })).toBe("бесплатно");
  });

  it("new source: scoring already paid → the rouble amount (not «уже оплачено»)", () => {
    // 2500 ₽ scoring already paid during signal scoring.
    expect(scoringLineDisplay({ sourceType: "new", scoring: 2500 })).toBe("2 500 ₽");
  });

  it("stream source: scoring already paid → the rouble amount", () => {
    expect(scoringLineDisplay({ sourceType: "stream", scoring: 1234 })).toBe("1 234 ₽");
  });

  it("non-own with zero scoring still reads «бесплатно» (degenerate)", () => {
    expect(scoringLineDisplay({ sourceType: "new", scoring: 0 })).toBe("бесплатно");
  });
});
