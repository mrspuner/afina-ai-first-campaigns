import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepFile } from "./step-file";
import { initialStepData, type StepData } from "@/types/campaign";
import { SCENARIOS, SCENARIO_CATEGORIES } from "@/data/scenarios";

// StepContent gates its children behind a typewriter animation that only mounts
// them once the title/subtitle finish typing. Stub it so the upload body +
// scenario selector render synchronously under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// The grouped scenario list reuses step-1's category chips. No motion is needed
// here, but keep a pass-through stub in case the selector reaches for it.
vi.mock("motion/react", () => {
  const passthrough = (Tag: "section" | "div") => {
    const Comp = ({
      children,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => {
      const drop = ["initial", "animate", "exit", "transition"];
      const rest = Object.fromEntries(
        Object.entries(props).filter(([k]) => !drop.includes(k))
      );
      return <Tag {...(rest as React.HTMLAttributes<HTMLElement>)}>{children}</Tag>;
    };
    Comp.displayName = `motion.${Tag}`;
    return Comp;
  };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: { section: passthrough("section"), div: passthrough("div") },
  };
});

const ownData: StepData = { ...initialStepData, sourceType: "own", scenario: null };

function renderOwn(onNext = vi.fn(), data: Partial<StepData> = {}) {
  return render(
    <StepFile data={{ ...ownData, ...data }} onNext={onNext} onBack={vi.fn()} />
  );
}

describe("StepFile — own-source scenario (signal-type) selector", () => {
  afterEach(cleanup);

  const nonBase = SCENARIOS.filter((s) => !s.isBase);

  it("keeps the file dropzone present", () => {
    renderOwn();
    // DropZone renders a file input the user can drop/select into.
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it("renders a scenario-group selector: category chips + scenario cards", () => {
    renderOwn();
    // Category chips (same source as step-1's grouping).
    for (const category of SCENARIO_CATEGORIES) {
      expect(
        screen.getByRole("button", { name: category })
      ).toBeInTheDocument();
    }
    // Scenario cards rendered for the (non-base) scenarios.
    const sample = nonBase[0];
    expect(
      screen.getByRole("button", { name: sample.name })
    ).toBeInTheDocument();
  });

  it("selecting a scenario card persists the choice via onNext({ scenario })", () => {
    const onNext = vi.fn();
    renderOwn(onNext);
    const target = nonBase[0];
    fireEvent.click(screen.getByRole("button", { name: target.name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: target.id });
  });

  it("marks the already-selected scenario (from data.scenario) as pressed", () => {
    const selected = SCENARIOS.find((s) => !s.isBase)!;
    renderOwn(vi.fn(), { scenario: selected.id });
    const card = screen.getByRole("button", { name: selected.name });
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("surfaces the signal type of the selected scenario", () => {
    const selected = SCENARIOS.find((s) => !s.isBase)!;
    renderOwn(vi.fn(), { scenario: selected.id });
    // The chosen scenario's signalType is shown somewhere in the step.
    expect(
      screen.getAllByText((_, node) =>
        (node?.textContent ?? "").includes(selected.signalType)
      ).length
    ).toBeGreaterThan(0);
  });

  it("clicking a category chip filters the visible scenario cards", () => {
    renderOwn();
    // Pick a category and assert a scenario from a DIFFERENT category disappears.
    const cat = SCENARIO_CATEGORIES[0];
    const inCat = SCENARIOS.find((s) => !s.isBase && s.category === cat)!;
    const outOfCat = SCENARIOS.find((s) => !s.isBase && s.category !== cat)!;
    fireEvent.click(screen.getByRole("button", { name: cat }));
    expect(screen.getByRole("button", { name: inCat.name })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: outOfCat.name })
    ).not.toBeInTheDocument();
  });
});
