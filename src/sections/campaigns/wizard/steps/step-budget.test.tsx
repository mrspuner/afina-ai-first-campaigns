import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildBudgetRows, StepBudget } from "./step-budget";
import type { StepData } from "@/types/campaign";

// StepContent runs a typewriter animation and only mounts children once it
// finishes. Stub it to render children synchronously so the step body is in
// the DOM immediately.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

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

// Minimal StepData factory for StepBudget render tests
function makeData(overrides: Partial<StepData> = {}): StepData {
  return {
    scenario: null,
    interests: [],
    triggers: [],
    triggerConfig: {},
    sourceType: "new",
    channels: [],
    budget: null,
    file: null,
    ...overrides,
  };
}

describe("StepBudget — channel list + repeat-buffer UI", () => {
  it("shows channel names when channels are selected", () => {
    render(
      <StepBudget
        data={makeData({ channels: ["sms", "email"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText(/Каналы: SMS, Email/)).toBeTruthy();
    cleanup();
  });

  it("shows 'Каналы: —' when no channels selected", () => {
    render(
      <StepBudget
        data={makeData({ channels: [] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText(/Каналы: —/)).toBeTruthy();
    cleanup();
  });

  it("shows repeat-buffer line when channels are present", () => {
    render(
      <StepBudget
        data={makeData({ channels: ["push"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText(/Повторные коммуникации \(\+30% буфер\)/)).toBeTruthy();
    cleanup();
  });

  it("does NOT show repeat-buffer line when no channels", () => {
    render(
      <StepBudget
        data={makeData({ channels: [] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByText(/Повторные коммуникации/)).toBeNull();
    cleanup();
  });

  it("shows updated recommended card caption", () => {
    render(
      <StepBudget
        data={makeData({ channels: ["sms"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText(/Рассчитали на основе источников и каналов/)).toBeTruthy();
    cleanup();
  });
});
