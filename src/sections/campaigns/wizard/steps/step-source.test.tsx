import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromSource, StepSource } from "./step-source";
import { canContinueFromFile } from "./step-file";
import { initialStepData } from "@/types/campaign";
import { SCENARIOS } from "@/data/scenarios";

// StepContent runs a typewriter animation and only mounts its children once it
// finishes. Stub it to render the step body synchronously so the source UI is
// in the DOM under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("canContinueFromSource (StepSource continue-gate)", () => {
  it("allows continue once a source is selected (all three are valid)", () => {
    expect(canContinueFromSource("new")).toBe(true);
    expect(canContinueFromSource("own")).toBe(true);
    expect(canContinueFromSource("stream")).toBe(true);
  });
});

describe("canContinueFromFile (StepFile continue-gate)", () => {
  it("requires a file before continue", () => {
    expect(canContinueFromFile(null)).toBe(false);
    expect(canContinueFromFile(new File(["x"], "base.csv"))).toBe(true);
  });
});

describe("StepSource — scenario-based recommendation", () => {
  afterEach(cleanup);

  // "base-first-deal" is category "Привлечение" → recommendedSourceType "new"
  const scenarioId = "base-first-deal";
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  it("resolves the expected scenario", () => {
    expect(scenario).toBeDefined();
    expect(scenario.category).toBe("Привлечение");
    expect(scenario.recommendedSourceType).toBe("new");
  });

  function renderWithScenario(id: string) {
    return render(
      <StepSource
        data={{ ...initialStepData, scenario: id }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
  }

  it("shows «Рекомендуется» badge on the recommended card only", () => {
    renderWithScenario(scenarioId);

    // Only one badge should appear
    const badges = screen.getAllByText("Рекомендуется");
    expect(badges).toHaveLength(1);

    // The badge is inside the «Новая база номеров» card (value="new")
    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toContainElement(badges[0]);
  });

  it("does NOT show «Рекомендуется» on non-recommended cards", () => {
    renderWithScenario(scenarioId);

    const streamCard = screen.getByRole("button", { name: /Поток/i });
    const ownCard = screen.getByRole("button", { name: /Свои сигналы/i });

    const badges = screen.getAllByText("Рекомендуется");
    // Neither stream nor own contains the badge
    expect(badges.every((b) => !streamCard.contains(b))).toBe(true);
    expect(badges.every((b) => !ownCard.contains(b))).toBe(true);
  });

  it("preselects the recommended source (aria-pressed=true on the recommended card)", () => {
    renderWithScenario(scenarioId);

    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toHaveAttribute("aria-pressed", "true");

    const streamCard = screen.getByRole("button", { name: /Поток/i });
    const ownCard = screen.getByRole("button", { name: /Свои сигналы/i });
    expect(streamCard).toHaveAttribute("aria-pressed", "false");
    expect(ownCard).toHaveAttribute("aria-pressed", "false");
  });

  it("user can override the preselected recommendation by clicking another card", () => {
    renderWithScenario(scenarioId);

    const streamCard = screen.getByRole("button", { name: /Поток/i });
    fireEvent.click(streamCard);

    expect(streamCard).toHaveAttribute("aria-pressed", "true");
    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toHaveAttribute("aria-pressed", "false");
  });

  it("when no scenario is provided, falls back to data.sourceType default (new)", () => {
    render(
      <StepSource
        data={{ ...initialStepData }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Default sourceType from initialStepData is "new"
    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toHaveAttribute("aria-pressed", "true");

    // No badge at all when there is no scenario
    expect(screen.queryByText("Рекомендуется")).not.toBeInTheDocument();

    cleanup();
  });

  it("correctly preselects «own» for an Апсейл scenario", () => {
    // "base-upsell" is category "Апсейл" → recommendedSourceType "own"
    const upsellScenario = SCENARIOS.find((s) => s.id === "base-upsell")!;
    expect(upsellScenario.recommendedSourceType).toBe("own");

    render(
      <StepSource
        data={{ ...initialStepData, scenario: "base-upsell" }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const ownCard = screen.getByRole("button", { name: /Свои сигналы/i });
    expect(ownCard).toHaveAttribute("aria-pressed", "true");

    const badges = screen.getAllByText("Рекомендуется");
    expect(badges).toHaveLength(1);
    expect(ownCard).toContainElement(badges[0]);

    cleanup();
  });

  it("correctly preselects «stream» for a Возврат scenario", () => {
    // "base-return" is category "Возврат" → recommendedSourceType "stream"
    const returnScenario = SCENARIOS.find((s) => s.id === "base-return")!;
    expect(returnScenario.recommendedSourceType).toBe("stream");

    render(
      <StepSource
        data={{ ...initialStepData, scenario: "base-return" }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const streamCard = screen.getByRole("button", { name: /Поток/i });
    expect(streamCard).toHaveAttribute("aria-pressed", "true");

    const badges = screen.getAllByText("Рекомендуется");
    expect(badges).toHaveLength(1);
    expect(streamCard).toContainElement(badges[0]);

    cleanup();
  });
});
