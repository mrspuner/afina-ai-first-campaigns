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
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка", source "new"
  it("own source shows the signals line as free (бесплатно)", () => {
    const rows = buildBudgetRows({
      scenarioId: SCENARIO,
      sourceType: "own",
      channels: ["sms"],
      baseSize: 10_000,
    });
    const signalsRow = rows.find((r) => r.key === "signals")!;
    expect(signalsRow.display).toMatch(/бесплатно/i);
  });
  it("new source charges the signals line", () => {
    const rows = buildBudgetRows({
      scenarioId: SCENARIO,
      sourceType: "new",
      channels: ["sms"],
      baseSize: 10_000,
    });
    const signalsRow = rows.find((r) => r.key === "signals")!;
    expect(signalsRow.display).not.toMatch(/бесплатно/i);
  });
  it("always has a Итого row, and it equals the graph communication total", () => {
    const rows = buildBudgetRows({
      scenarioId: SCENARIO,
      sourceType: "new",
      channels: ["sms"],
      baseSize: 10_000,
    });
    const total = rows.find((r) => r.key === "total")!;
    const comm = rows.find((r) => r.key === "communication")!;
    expect(total).toBeTruthy();
    // Итого mirrors the payment screen: it is the comms-only graph total.
    expect(total.amount).toBe(comm.amount);
    expect(total.amount).toBeGreaterThan(0);
  });
  it("no scenario falls back to the flat estimate (no channels → communication 0)", () => {
    const rows = buildBudgetRows({
      scenarioId: null,
      sourceType: "new",
      channels: [],
      baseSize: 5_000,
    });
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

describe("StepBudget — contacts sub-line + graph cost breakdown", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка"

  it("renders the ~…контактов figure as a sub-line under the Сигналы row (not on the row)", () => {
    render(
      <StepBudget
        data={makeData({
          scenario: SCENARIO,
          sourceType: "own",
          channels: ["sms"],
          fileRowCount: 10_000,
        })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    const signalsLabel = screen.getByText("Сигналы");
    const contacts = screen.getByText(/контактов/);
    // The contacts figure sits in its own sub-line directly after the Сигналы
    // row, not inside the row that holds the «Сигналы» label/amount.
    const signalsRow = signalsLabel.closest("div");
    expect(signalsRow).toBeTruthy();
    expect(signalsRow?.contains(contacts)).toBe(false);
    cleanup();
  });

  it("renders a per-channel line (channel label + rouble amount) from the graph cost", () => {
    render(
      <StepBudget
        data={makeData({
          scenario: SCENARIO,
          sourceType: "new",
          channels: ["sms"],
          fileRowCount: 10_000,
        })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    // Graph cost for base-first-deal/new yields an SMS line of ₽50 000.
    const line = screen.getByText(/^SMS · /);
    expect(line).toBeTruthy();
    const row = line.parentElement;
    expect(row?.textContent).toMatch(/₽\s*50[\s ]?000/);
    // The simple "Каналы: …" fallback must NOT be shown when graph lines exist.
    expect(screen.queryByText(/^Каналы:/)).toBeNull();
    cleanup();
  });

  it("appends the buffer rouble amount to the repeat-communications line", () => {
    render(
      <StepBudget
        data={makeData({
          scenario: SCENARIO,
          sourceType: "new",
          channels: ["sms"],
          fileRowCount: 10_000,
        })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    const buffer = screen.getByText(/Повторные коммуникации \(\+30% буфер\)/);
    const row = buffer.parentElement;
    expect(row?.textContent).toMatch(/₽\s*1[\s ]?500/);
    cleanup();
  });
});
