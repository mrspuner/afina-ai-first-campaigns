import { describe, it, expect } from "vitest";
import { buildBudgetRows } from "./step-budget";

describe("buildBudgetRows (StepBudget forecast)", () => {
  it("own source shows the signals line as free (бесплатно)", () => {
    const rows = buildBudgetRows({ sourceType: "own", channels: ["sms"], baseSize: 10_000 });
    const signalsRow = rows.find((r) => r.key === "signals")!;
    expect(signalsRow.display).toMatch(/бесплатно/i);
  });
  it("new source charges the signals line", () => {
    const rows = buildBudgetRows({ sourceType: "new", channels: ["sms"], baseSize: 10_000 });
    const signalsRow = rows.find((r) => r.key === "signals")!;
    expect(signalsRow.display).not.toMatch(/бесплатно/i);
  });
  it("always has a Итого row matching the estimate total", () => {
    const rows = buildBudgetRows({ sourceType: "new", channels: ["sms"], baseSize: 10_000 });
    expect(rows.some((r) => r.key === "total")).toBe(true);
  });
  it("degenerate (no channels) shows communication as 0", () => {
    const rows = buildBudgetRows({ sourceType: "new", channels: [], baseSize: 5_000 });
    const comm = rows.find((r) => r.key === "communication")!;
    expect(comm.amount).toBe(0);
  });
});
