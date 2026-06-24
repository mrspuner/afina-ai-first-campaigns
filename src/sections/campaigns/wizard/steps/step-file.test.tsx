import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepFile, fileCopy } from "./step-file";
import { initialStepData, type StepData } from "@/types/campaign";
import { SIGNAL_TYPES } from "@/state/app-state";

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
  return render(
    <StepFile data={{ ...ownData, ...data }} onNext={onNext} onBack={vi.fn()} />
  );
}

describe("StepFile — own-source signal-type dropdown", () => {
  afterEach(cleanup);

  it("exposes exactly the 6 signal types", () => {
    expect(SIGNAL_TYPES).toHaveLength(6);
    expect(SIGNAL_TYPES).toEqual([
      "Регистрация",
      "Первая сделка",
      "Апсейл",
      "Реактивация",
      "Возврат",
      "Удержание",
    ]);
  });

  it("keeps the file dropzone present", () => {
    renderOwn();
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it("renders the «Тип сигнала» dropdown with its placeholder for own source", () => {
    renderOwn();
    expect(screen.getByText("Тип сигнала")).toBeInTheDocument();
    expect(screen.getByText("Выберите тип сигнала")).toBeInTheDocument();
    // The trigger is reachable by its accessible name.
    expect(
      screen.getByRole("combobox", { name: "Тип сигнала" })
    ).toBeInTheDocument();
  });

  it("does NOT render the signal-type dropdown for non-own sources", () => {
    render(
      <StepFile
        data={{ ...initialStepData, sourceType: "new" }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByText("Тип сигнала")).not.toBeInTheDocument();
    expect(screen.queryByText("Выберите тип сигнала")).not.toBeInTheDocument();
  });

  it("does not call the step-advancing onNext on mount/seed", () => {
    const onNext = vi.fn();
    renderOwn(onNext, { ownSignalType: "Апсейл" });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("flushes the chosen ownSignalType into the «Далее» payload — never on `scenario`", () => {
    const onNext = vi.fn();
    // Seed an already-uploaded file (file === data.files[0]) so «Далее» skips
    // the hashing branch and emits synchronously, plus a pre-chosen signal type.
    const file = new File(["a,b\n1,2"], "list.csv", { type: "text/csv" });
    renderOwn(onNext, { files: [file], fileRowCount: 4242, ownSignalType: "Реактивация" });

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    const payload = onNext.mock.calls[0][0];
    expect(payload).toMatchObject({
      files: [file],
      fileRowCount: 4242,
      ownSignalType: "Реактивация",
    });
    // Dedicated field only — `scenario` is never touched, so handleNext's
    // scenarioChanged reset cannot fire and wipe the upload.
    expect(payload).not.toHaveProperty("scenario");
  });

  it("omits ownSignalType from the payload when none was chosen", () => {
    const onNext = vi.fn();
    const file = new File(["a"], "list.csv", { type: "text/csv" });
    renderOwn(onNext, { files: [file], fileRowCount: 10 });

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0]).not.toHaveProperty("ownSignalType");
  });
});

describe("StepFile — multiple bases (group B #4)", () => {
  afterEach(cleanup);

  it("«Загрузить ещё одну базу» reveals an extra empty upload slot", () => {
    const file = new File(["a"], "base-1.csv", { type: "text/csv" });
    render(
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
    const file = new File(["a"], "base-1.csv", { type: "text/csv" });
    render(
      <StepFile
        data={{ ...initialStepData, sourceType: "new", files: [file], fileRowCount: 100 }}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Удалить базу" })).toBeTruthy();
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
