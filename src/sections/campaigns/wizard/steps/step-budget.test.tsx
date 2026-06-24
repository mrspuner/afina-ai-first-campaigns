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

  // aim #23: the «Коммуникация» breakdown is split into «Первичные» /
  // «Повторные» groups (each channel once), replacing the old single
  // "Повторные коммуникации (+30% буфер)" buffer line.
  it("shows «Первичные» and «Повторные» group headers when a scenario yields a graph cost", () => {
    renderStep(
      <StepBudget
        data={makeData({
          scenario: "base-first-deal",
          sourceType: "new",
          channels: ["sms"],
          fileRowCount: 10_000,
        })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText("Первичные")).toBeTruthy();
    expect(screen.getByText("Повторные")).toBeTruthy();
    cleanup();
  });

  it("does NOT show the «Повторные» group when there is no graph cost", () => {
    renderStep(
      <StepBudget
        data={makeData({ channels: [] })}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByText("Повторные")).toBeNull();
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

describe("StepBudget — footer button is «Далее» and always advances (group B #6)", () => {
  const SCENARIO = "base-first-deal"; // signalType "Первая сделка", cost > 0

  it("footer button label is «Далее» regardless of balance", () => {
    // Default app-state balance is 0; cost > 0 — but button must still read «Далее».
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
    expect(screen.getByRole("button", { name: "Далее" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /пополнить/i })).toBeNull();
    cleanup();
  });

  it("clicking «Далее» calls onNext (does NOT open a top-up modal)", () => {
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
    const button = screen.getByRole("button", { name: "Далее" });
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

  // aim #23: the breakdown is grouped into «Первичные» / «Повторные», each
  // channel deduped + summed and shown ONCE per group, labelled by channel name
  // only (no per-node «· label» rows).
  it("renders the «Первичные» group with a single SMS row summing the primary cost", () => {
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
    // base-first-deal/new over 10 000 contacts: primary SMS = 50 000 roubles.
    const primaryHeader = screen.getByText("Первичные");
    const group = primaryHeader.parentElement!;
    // Exactly one SMS row in the primary group (dedup), summing to 50 000.
    const smsRows = Array.from(group.querySelectorAll("div")).filter(
      (el) => el.querySelector("span")?.textContent === "SMS"
    );
    expect(smsRows.length).toBe(1);
    expect(group.textContent).toMatch(/₽\s*50[\s ]?000/);
    // The simple "Каналы: …" fallback must NOT show when graph lines exist.
    expect(screen.queryByText(/^Каналы:/)).toBeNull();
    cleanup();
  });

  it("renders the «Повторные» group with the summed repeat cost (15 000)", () => {
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
    const repeatHeader = screen.getByText("Повторные");
    const group = repeatHeader.parentElement!;
    // Repeat (post-condition) SMS for base-first-deal/new over 10 000 = 15 000.
    expect(group.textContent).toMatch(/₽\s*15\D?000/);
    // The channel appears once in the repeat group too (dedup).
    const smsRows = Array.from(group.querySelectorAll("div")).filter(
      (el) => el.querySelector("span")?.textContent === "SMS"
    );
    expect(smsRows.length).toBe(1);
    cleanup();
  });
});
