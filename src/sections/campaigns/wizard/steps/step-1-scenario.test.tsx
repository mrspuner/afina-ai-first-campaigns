import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Step1Scenario, groupScenariosByCategory, sourceTypeLabel } from "./step-1-scenario";
import { SCENARIO_CATEGORIES, SCENARIOS } from "@/data/scenarios";
import { initialStepData } from "@/types/campaign";

// StepContent runs a typewriter animation and only mounts its children once it
// finishes. Stub it to render the step body synchronously so the catalog UI is
// in the DOM under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("groupScenariosByCategory (ЖЦК grouping)", () => {
  it("groups scenarios under all six ЖЦК categories with counts", () => {
    const groups = groupScenariosByCategory();
    expect(groups.map((g) => g.category)).toEqual([...SCENARIO_CATEGORIES]);
    expect(groups.every((g) => g.scenarios.length === g.count)).toBe(true);
  });
  it("every grouped scenario excludes base scenarios", () => {
    const groups = groupScenariosByCategory();
    expect(groups.every((g) => g.scenarios.every((s) => !s.isBase))).toBe(true);
  });
});

describe("sourceTypeLabel", () => {
  it("maps the three source types to Russian labels", () => {
    expect(sourceTypeLabel("new")).toMatch(/нов/i);
    expect(sourceTypeLabel("stream")).toMatch(/поток/i);
    expect(sourceTypeLabel("own")).toMatch(/сво/i);
  });
});

describe("Step1Scenario — curated default + «Показать все» catalog", () => {
  afterEach(cleanup);

  const curated = SCENARIOS.filter((s) => s.isCurated);

  function renderStep(onNext = vi.fn()) {
    return render(<Step1Scenario data={initialStepData} onNext={onNext} />);
  }

  it("default view shows curated scenarios under «Подобрали для вас» plus a «Показать все» control, and hides search/category chips", () => {
    renderStep();

    // Curated header + every curated scenario card present.
    expect(screen.getByText("Подобрали для вас")).toBeInTheDocument();
    for (const s of curated) {
      expect(screen.getByRole("button", { name: s.name })).toBeInTheDocument();
    }
    // «Показать все» control.
    expect(
      screen.getByRole("button", { name: "Показать все" })
    ).toBeInTheDocument();

    // No search input and no category filter chips in the default view.
    expect(
      screen.queryByLabelText("Поиск по сценариям")
    ).not.toBeInTheDocument();
    for (const category of SCENARIO_CATEGORIES) {
      expect(
        screen.queryByRole("button", { name: category })
      ).not.toBeInTheDocument();
    }
  });

  it("after «Показать все» renders search, category chips, and category sections with ALL cards (no «Показать ещё»)", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));

    // Search + chips now visible.
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    for (const category of SCENARIO_CATEGORIES) {
      expect(
        screen.getByRole("button", { name: category })
      ).toBeInTheDocument();
    }

    // No collapse/expand affordances remain.
    expect(screen.queryByText(/Показать ещё/)).not.toBeInTheDocument();
    expect(screen.queryByText("Свернуть")).not.toBeInTheDocument();

    // Every non-base scenario renders as a card across the category sections.
    const nonBase = SCENARIOS.filter((s) => !s.isBase);
    for (const s of nonBase) {
      expect(
        screen.getByRole("button", { name: s.name })
      ).toBeInTheDocument();
    }

    // Heading counts reflect the full per-category counts (no slicing).
    const groups = groupScenariosByCategory().filter((g) => g.count > 0);
    const headings = screen.getAllByRole("heading", { level: 2 });
    for (const g of groups) {
      const heading = headings.find((h) =>
        h.textContent?.startsWith(g.category)
      );
      expect(heading).toBeDefined();
      expect(
        within(heading as HTMLElement).getByText(`(${g.count})`)
      ).toBeInTheDocument();
    }
  });

  it("selecting a card in the default view calls onNext with the scenario id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    fireEvent.click(screen.getByRole("button", { name: curated[0].name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: curated[0].id });
  });

  it("selecting a card in the expanded catalog calls onNext with the scenario id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    const target = SCENARIOS.find((s) => !s.isBase && !s.isCurated)!;
    fireEvent.click(screen.getByRole("button", { name: target.name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: target.id });
  });
});
