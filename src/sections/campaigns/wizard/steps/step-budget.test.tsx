import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { buildBudgetRows, StepBudget } from "./step-budget";
import type { StepData } from "@/types/campaign";
import { AppStateProvider } from "@/state/app-state-context";

// StepBudget reads `balance` via useAppState (aim #19), so renders must be
// wrapped in the app-state provider. The default balance (0) is fine here —
// these tests don't assert the launch-button label.
function renderStep(ui: React.ReactElement) {
  return render(<AppStateProvider>{ui}</AppStateProvider>);
}

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
  it("always has a Итого row = Сигналы + Коммуникации (grand total)", () => {
    const rows = buildBudgetRows({
      scenarioId: SCENARIO,
      sourceType: "new",
      channels: ["sms"],
      baseSize: 10_000,
    });
    const total = rows.find((r) => r.key === "total")!;
    const comm = rows.find((r) => r.key === "communication")!;
    const signals = rows.find((r) => r.key === "signals")!;
    expect(total).toBeTruthy();
    // new source → signals are charged, so «Итого» is strictly greater than the
    // communication portion and equals signals + communications.
    expect(signals.amount).toBeGreaterThan(0);
    expect(total.amount).toBe(signals.amount + comm.amount);
    expect(total.amount).toBeGreaterThan(comm.amount);
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
    files: [],
    ...overrides,
  };
}

describe("StepBudget — «Коммуникации» collapsible table (v8)", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка"

  it("renders a collapsed «Коммуникации» row (table hidden) when a scenario yields a graph cost", () => {
    renderStep(
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
    expect(screen.getByRole("button", { name: /Коммуникации/ })).toBeTruthy();
    // Collapsed by default: the per-channel table is not mounted yet.
    expect(screen.queryByText("Канал")).toBeNull();
    expect(screen.queryByText("Первичные")).toBeNull();
    cleanup();
  });

  // aim #23 lives on now as table columns: expanding «Коммуникации» reveals a
  // Канал | Первичные | Повторные | Итого table, one row per channel.
  it("clicking «Коммуникации» reveals the table with a single SMS row (primary 50 000 / repeat 15 000)", () => {
    renderStep(
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
    fireEvent.click(screen.getByRole("button", { name: /Коммуникации/ }));
    expect(screen.getByText("Канал")).toBeTruthy();
    expect(screen.getByText("Первичные")).toBeTruthy();
    expect(screen.getByText("Повторные")).toBeTruthy();
    const table = screen.getByRole("table");
    // Single channel → the SAME table, exactly one channel row.
    expect(table.querySelectorAll("tbody tr").length).toBe(1);
    const smsRow = within(table).getByText("SMS").closest("tr")!;
    expect(smsRow.textContent).toMatch(/₽\s*50[\s ]?000/); // primary
    expect(smsRow.textContent).toMatch(/₽\s*15[\s ]?000/); // repeat
    cleanup();
  });

  it("shows «Сигналы» + «Итого» (= Сигналы) but NO «Коммуникации» row when there is no graph cost", () => {
    renderStep(
      <StepBudget
        data={makeData({ channels: [] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText("Сигналы")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Коммуникации/ })).toBeNull();
    // With no communication the grand total collapses to signals, so «Итого»
    // still renders (equal to «Сигналы»).
    expect(screen.getByText("Итого")).toBeTruthy();
    cleanup();
  });

  it("shows updated recommended card caption", () => {
    renderStep(
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

describe("StepBudget — footer button is «Создать кампанию» and always advances (group B #6)", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка", cost > 0

  it("footer button label is «Создать кампанию» regardless of balance", () => {
    // Default app-state balance is 0; cost > 0 — but button must still read «Создать кампанию».
    renderStep(
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
    expect(screen.getByRole("button", { name: "Создать кампанию" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /пополнить/i })).toBeNull();
    cleanup();
  });

  it("clicking «Создать кампанию» calls onNext (does NOT open a top-up modal)", () => {
    const onNext = vi.fn();
    renderStep(
      <StepBudget
        data={makeData({
          scenario: SCENARIO,
          sourceType: "new",
          channels: ["sms"],
          fileRowCount: 10_000,
        })}
        onNext={onNext}
        onBack={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "Создать кампанию" });
    fireEvent.click(button);
    // Wizard advances — no top-up gate.
    expect(onNext).toHaveBeenCalledTimes(1);
    // No TopUpModal dialog.
    expect(screen.queryByText("Пополнить баланс")).toBeNull();
    cleanup();
  });
});

describe("StepBudget — max daily budget field (aim #21, stream-only)", () => {
  it("shows the «Максимальный дневной бюджет» field for stream source", () => {
    renderStep(
      <StepBudget
        data={makeData({ sourceType: "stream", channels: ["sms"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Максимальный дневной бюджет \(необязательно\)/)
    ).toBeTruthy();
    cleanup();
  });

  it("hides the «Максимальный дневной бюджет» field for new source", () => {
    renderStep(
      <StepBudget
        data={makeData({ sourceType: "new", channels: ["sms"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.queryByText(/Максимальный дневной бюджет \(необязательно\)/)
    ).toBeNull();
    cleanup();
  });

  it("hides the «Максимальный дневной бюджет» field for own source", () => {
    renderStep(
      <StepBudget
        data={makeData({ sourceType: "own", channels: ["sms"] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.queryByText(/Максимальный дневной бюджет \(необязательно\)/)
    ).toBeNull();
    cleanup();
  });
});
