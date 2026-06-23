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

  it("does NOT render the scenario selector for non-own sources", () => {
    render(
      <StepFile
        data={{ ...initialStepData, sourceType: "new" }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    // No category chips, no scenario cards for the "new" base flow.
    for (const category of SCENARIO_CATEGORIES) {
      expect(
        screen.queryByRole("button", { name: category })
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: nonBase[0].name })
    ).not.toBeInTheDocument();
  });

  it("selecting a scenario records it locally WITHOUT calling the step-advancing onNext", () => {
    const onNext = vi.fn();
    renderOwn(onNext);
    const target = nonBase[0];
    fireEvent.click(screen.getByRole("button", { name: target.name }));
    // Critical: selecting must NOT advance the step / trigger any reset. The
    // wizard only persists+advances via onNext, so onNext must NOT be called
    // on selection.
    expect(onNext).not.toHaveBeenCalled();
  });

  it("marks the just-selected scenario as pressed (local state reflects the choice)", () => {
    renderOwn();
    const target = nonBase[0];
    const card = screen.getByRole("button", { name: target.name });
    expect(card).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(card);
    expect(
      screen.getByRole("button", { name: target.name })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("seeds the selection from data.ownSignalScenario on mount", () => {
    const selected = nonBase[0];
    renderOwn(vi.fn(), { ownSignalScenario: selected.id });
    expect(
      screen.getByRole("button", { name: selected.name })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("surfaces the signal type of the selected scenario", () => {
    const selected = nonBase[0];
    renderOwn(vi.fn(), { ownSignalScenario: selected.id });
    expect(
      screen.getAllByText((_, node) =>
        (node?.textContent ?? "").includes(selected.signalType)
      ).length
    ).toBeGreaterThan(0);
  });

  it("includes the chosen ownSignalScenario in the continue payload (persists on «Далее», no reset)", () => {
    const onNext = vi.fn();
    // Seed an already-uploaded file (file === data.file) so «Далее» skips the
    // hashing branch and emits synchronously with the existing row count.
    const file = new File(["a,b\n1,2"], "list.csv", { type: "text/csv" });
    renderOwn(onNext, { file, fileRowCount: 4242 });

    const target = nonBase[0];
    fireEvent.click(screen.getByRole("button", { name: target.name }));
    // Still no advance from the selection itself.
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    const payload = onNext.mock.calls[0][0];
    // The continue payload carries the file + row count AND the dedicated
    // own-signal field — and crucially NOT `scenario`, so handleNext's
    // scenarioChanged reset never fires.
    expect(payload).toMatchObject({
      file,
      fileRowCount: 4242,
      ownSignalScenario: target.id,
    });
    expect(payload).not.toHaveProperty("scenario");
  });

  it("clicking a category chip filters the visible scenario cards", () => {
    renderOwn();
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
