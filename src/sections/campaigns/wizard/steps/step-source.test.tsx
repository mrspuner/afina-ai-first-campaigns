import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { canContinueFromSource, StepSource } from "./step-source";
import { canContinueFromFiles } from "./step-file";
import { initialStepData, type StepData } from "@/types/campaign";

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

describe("canContinueFromFiles (StepFile continue-gate)", () => {
  it("requires at least one file before continue", () => {
    expect(canContinueFromFiles([])).toBe(false);
    expect(canContinueFromFiles([new File(["x"], "base.csv")])).toBe(true);
    expect(
      canContinueFromFiles([new File(["x"], "a.csv"), new File(["y"], "b.csv")]),
    ).toBe(true);
  });
});

describe("StepSource — default «Новая база», no recommendation badge (group B #4)", () => {
  afterEach(cleanup);

  function renderWithScenario(id: string | null) {
    const data: StepData = { ...initialStepData, scenario: id };
    return render(
      <StepSource data={data} onNext={vi.fn()} onBack={vi.fn()} />
    );
  }

  // "base-upsell" recommends "own", "base-return" recommends "stream" — under the
  // old behavior these drove the default selection AND a badge. Both are gone now.
  it("never renders a «Рекомендуется» badge, whatever the scenario recommends", () => {
    for (const id of ["base-first-deal", "base-upsell", "base-return", null]) {
      renderWithScenario(id);
      expect(screen.queryByText("Рекомендуется")).toBeNull();
      cleanup();
    }
  });

  it("defaults to «Новая база номеров» regardless of the scenario recommendation", () => {
    renderWithScenario("base-upsell"); // would have preselected «Свои сигналы» before
    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toHaveAttribute("aria-pressed", "true");
    const ownCard = screen.getByRole("button", { name: /Свои сигналы/i });
    const streamCard = screen.getByRole("button", { name: /Поток/i });
    expect(ownCard).toHaveAttribute("aria-pressed", "false");
    expect(streamCard).toHaveAttribute("aria-pressed", "false");
  });

  it("user can still switch the source by clicking another card", () => {
    renderWithScenario(null);
    const streamCard = screen.getByRole("button", { name: /Поток/i });
    fireEvent.click(streamCard);
    expect(streamCard).toHaveAttribute("aria-pressed", "true");
    const newCard = screen.getByRole("button", { name: /Новая база номеров/i });
    expect(newCard).toHaveAttribute("aria-pressed", "false");
  });
});
