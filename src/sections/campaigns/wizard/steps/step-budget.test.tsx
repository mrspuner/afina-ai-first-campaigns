import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
    renderStep(
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
    renderStep(
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
    renderStep(
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
    renderStep(
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

describe("StepBudget — insufficient balance opens TopUpModal (aim #22)", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка", cost > 0

  it("clicking «Пополнить и запустить» opens the TopUpModal and does NOT advance", () => {
    // Default app-state balance is 0; with a scenario + channels the
    // recommended cost is > 0, so the footer button reads «Пополнить и
    // запустить» and the balance is insufficient.
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
    const button = screen.getByRole("button", { name: "Пополнить и запустить" });
    fireEvent.click(button);
    // TopUpModal is now open (its dialog title is rendered).
    expect(screen.getByText("Пополнить баланс")).toBeTruthy();
    // The wizard must NOT advance to the next step.
    expect(onNext).not.toHaveBeenCalled();
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

describe("StepBudget — contacts sub-line + graph cost breakdown", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка"

  it("renders the ~…контактов figure as a sub-line under the Сигналы row (not on the row)", () => {
    renderStep(
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
    // Graph cost for base-first-deal/new yields an SMS line of ₽50 000.
    // Channel-aware after aim #2: base-first-deal/new now produces a primary
    // SMS line (₽50 000) plus a post-condition (repeat) SMS line, so multiple
    // "SMS · …" rows exist. The first is the ₽50 000 primary line.
    const lines = screen.getAllByText(/^SMS · /);
    expect(lines.length).toBeGreaterThan(0);
    const row = lines[0].parentElement;
    expect(row?.textContent).toMatch(/₽\s*50[\s ]?000/);
    // The simple "Каналы: …" fallback must NOT be shown when graph lines exist.
    expect(screen.queryByText(/^Каналы:/)).toBeNull();
    cleanup();
  });

  it("appends the buffer rouble amount to the repeat-communications line", () => {
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
    const buffer = screen.getByText(/Повторные коммуникации \(\+30% буфер\)/);
    const row = buffer.parentElement;
    // Channel-aware after aim #2: the repeat (post-condition) SMS line for
    // base-first-deal/new over 10 000 contacts is ₽15 000 (was a stale ₽1 500
    // when the wizard graph dropped channels).
    expect(row?.textContent).toMatch(/₽\s*15\D?000/);
    cleanup();
  });
});
