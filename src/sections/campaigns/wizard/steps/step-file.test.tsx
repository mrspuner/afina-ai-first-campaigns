import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepFile, fileCopy, sameFileSet } from "./step-file";
import { initialStepData, type StepData } from "@/types/campaign";
import { AppStateProvider } from "@/state/app-state-context";

// StepFile publishes its PromptBar hints via useScreenHints, which needs the
// app-state dispatch context — wrap every render in the provider.
function renderWithState(ui: React.ReactElement) {
  return render(<AppStateProvider>{ui}</AppStateProvider>);
}

// StepContent gates its children behind a typewriter animation that only mounts
// them once the title/subtitle finish typing. Stub it so the upload body +
// signal-type dropdown render synchronously under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const ownData: StepData = { ...initialStepData, sourceType: "own", scenario: null };

function renderOwn(onNext = vi.fn(), data: Partial<StepData> = {}) {
  return renderWithState(
    <StepFile data={{ ...ownData, ...data }} onNext={onNext} onBack={vi.fn()} />
  );
}

describe("StepFile — own-source scenario-match notice", () => {
  afterEach(cleanup);

  it("keeps the file dropzone present", () => {
    renderOwn();
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it("shows the yellow scenario notice with the selected scenario's category for own source", () => {
    // scenario id «base-registration» → категория «Онбординг»
    renderOwn(vi.fn(), { scenario: "base-registration" });
    expect(
      screen.getByText(/Выбран сценарий категории «Онбординг»/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/иначе кампания может показать низкие результаты/)
    ).toBeInTheDocument();
  });

  it("falls back to a generic notice when the scenario has no resolvable category", () => {
    renderOwn(vi.fn(), { scenario: null });
    expect(
      screen.getByText(/соответствует выбранному сценарию/)
    ).toBeInTheDocument();
  });

  it("does NOT render the scenario notice for non-own sources", () => {
    renderWithState(
      <StepFile
        data={{ ...initialStepData, sourceType: "new", scenario: "base-registration" }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.queryByText(/соответствует этому сценарию/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/соответствует выбранному сценарию/)
    ).not.toBeInTheDocument();
  });

  it("does not call the step-advancing onNext on mount/seed", () => {
    const onNext = vi.fn();
    renderOwn(onNext, { scenario: "base-registration" });
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("StepFile — multiple bases (group B #4)", () => {
  afterEach(cleanup);

  it("«Загрузить ещё одну базу» reveals an extra empty upload slot", () => {
    const file = { name: "base-1.csv", rowCount: 1000 };
    renderWithState(
      <StepFile
        data={{ ...initialStepData, sourceType: "new", files: [file], fileRowCount: 100 }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    // One uploaded base → one file input, plus the add button (no empty slot yet).
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Загрузить ещё одну базу/i }));

    // The empty slot is revealed → a second file input appears.
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(2);
    // The add button collapses while the empty slot is open.
    expect(screen.queryByRole("button", { name: /Загрузить ещё одну базу/i })).toBeNull();
  });

  it("each uploaded base carries a remove control", () => {
    const file = { name: "base-1.csv", rowCount: 1000 };
    renderWithState(
      <StepFile
        data={{ ...initialStepData, sourceType: "new", files: [file], fileRowCount: 100 }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Удалить базу" })).toBeTruthy();
  });
});

describe("sameFileSet", () => {
  it("равные по имени и числу строк наборы считаются неизменными", () => {
    const a = [{ name: "base.csv", rowCount: 1000 }];
    const b = [{ name: "base.csv", rowCount: 1000 }];
    expect(sameFileSet(a, b)).toBe(true);
  });

  it("разное число строк — набор изменился", () => {
    expect(
      sameFileSet(
        [{ name: "base.csv", rowCount: 1000 }],
        [{ name: "base.csv", rowCount: 2000 }],
      ),
    ).toBe(false);
  });

  it("разная длина — набор изменился", () => {
    expect(sameFileSet([{ name: "a.csv", rowCount: 1 }], [])).toBe(false);
  });

  it("порядок значим — перестановка считается изменением", () => {
    const a = [{ name: "a.csv", rowCount: 1 }, { name: "b.csv", rowCount: 2 }];
    const b = [{ name: "b.csv", rowCount: 2 }, { name: "a.csv", rowCount: 1 }];
    expect(sameFileSet(a, b)).toBe(false);
  });
});

describe("fileCopy — per-source upload copy", () => {
  it("stream → numbers base for monitoring", () => {
    const { title, subtitle } = fileCopy("stream");
    expect(title).toBe("Загрузите базу номеров");
    expect(subtitle).toMatch(/мониторинг/i);
  });
  it("own → ready signal list", () => {
    expect(fileCopy("own").title).toBe("Загрузите ваш список сигналов");
  });
  it("new → audience base", () => {
    expect(fileCopy("new").title).toBe("Загрузите вашу базу");
  });
});
