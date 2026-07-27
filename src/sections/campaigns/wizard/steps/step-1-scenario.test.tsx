import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Step1Scenario, groupScenariosByCategory } from "./step-1-scenario";
import { SCENARIO_CATEGORIES, SCENARIOS } from "@/data/scenarios";
import { initialStepData } from "@/types/campaign";
import { AppStateProvider } from "@/state/app-state-context";

// StepContent runs a typewriter animation and only mounts its children once it
// finishes. Stub it to render the step body synchronously so the catalog UI is
// in the DOM under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// The curated/all collapse uses `motion/react` (AnimatePresence + motion.*).
// In jsdom there is no layout/RAF, so AnimatePresence's exit deferral never
// resolves: the outgoing block lingers mounted while the incoming one appears,
// producing duplicate/missing nodes for synchronous fireEvent assertions.
// Stub it to a pass-through that renders the CURRENT children immediately and
// drops animation-only props — the toggle's conditional render then behaves
// like the original bare ternary, so assertions stay exactly as strict.
vi.mock("motion/react", () => {
  const MOTION_PROPS = ["initial", "animate", "exit", "transition"];
  const passthrough = (Tag: "section" | "div") => {
    const Comp = ({
      children,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => {
      // strip motion-only props so they don't hit the real DOM element
      const rest = Object.fromEntries(
        Object.entries(props).filter(([key]) => !MOTION_PROPS.includes(key))
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

describe("Step1Scenario — фильтры всегда сверху + «Показать все» добавляет каталог", () => {
  afterEach(cleanup);

  const curated = SCENARIOS.filter((s) => s.isCurated);

  function renderStep(onNext = vi.fn()) {
    // Step1Scenario publishes its hints via useScreenHints → needs the provider.
    return render(
      <AppStateProvider>
        <Step1Scenario data={initialStepData} onNext={onNext} />
      </AppStateProvider>
    );
  }

  it("дефолт: блок подборки, поиск и чипсы видны, «Показать все», без чипа источника", () => {
    renderStep();
    const region = screen.getByRole("region", { name: "Подобрали для вас" });
    for (const s of curated) {
      expect(within(region).getByRole("button", { name: s.name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    for (const category of SCENARIO_CATEGORIES) {
      expect(screen.getByRole("button", { name: category })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Все сценарии" })).not.toBeInTheDocument();
    expect(screen.queryByText("Новая база номеров")).not.toBeInTheDocument();
    expect(screen.queryByText("Поток")).not.toBeInTheDocument();
    expect(screen.queryByText("Свои сигналы")).not.toBeInTheDocument();
  });

  it("«Показать все» добавляет каталог ниже подборки (подборка остаётся)", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    expect(screen.getByRole("region", { name: "Подобрали для вас" })).toBeInTheDocument();
    const catalog = screen.getByRole("region", { name: "Все сценарии" });
    const nonBase = SCENARIOS.filter((s) => !s.isBase);
    for (const s of nonBase) {
      expect(within(catalog).getByRole("button", { name: s.name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать все" })).not.toBeInTheDocument();
  });

  it("«Свернуть» убирает каталог, но подборка и фильтры остаются", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.queryByRole("region", { name: "Все сценарии" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Подобрали для вас" })).toBeInTheDocument();
    expect(screen.getByLabelText("Поиск по сценариям")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать все" })).toBeInTheDocument();
  });

  it("выбор карточки из подборки вызывает onNext с id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    const region = screen.getByRole("region", { name: "Подобрали для вас" });
    fireEvent.click(within(region).getByRole("button", { name: curated[0].name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: curated[0].id });
  });

  it("выбор карточки из каталога вызывает onNext с id", () => {
    const onNext = vi.fn();
    renderStep(onNext);
    fireEvent.click(screen.getByRole("button", { name: "Показать все" }));
    const catalog = screen.getByRole("region", { name: "Все сценарии" });
    const target = SCENARIOS.find((s) => !s.isBase && !s.isCurated)!;
    fireEvent.click(within(catalog).getByRole("button", { name: target.name }));
    expect(onNext).toHaveBeenCalledWith({ scenario: target.id });
  });
});

describe("Step1Scenario — подтверждение смены сценария в режиме правки (Task 13)", () => {
  afterEach(cleanup);

  // Реальные, видимые по умолчанию сценарии (подборка) — базовые (isBase) в
  // UI не рендерятся вовсе, а плейсхолдеры брифа ("s1"/"Другой сценарий"/
  // "Текущий сценарий") не существуют в SCENARIO_NAMES.
  const [current, other] = SCENARIOS.filter((s) => s.isCurated);
  const stepData = initialStepData;

  function renderStep({
    editing,
    data = stepData,
    onNext = vi.fn(),
  }: {
    editing?: boolean;
    data?: typeof stepData;
    onNext?: (partial: Partial<typeof stepData>) => void;
  } = {}) {
    return render(
      <AppStateProvider>
        <Step1Scenario data={data} onNext={onNext} editing={editing} />
      </AppStateProvider>
    );
  }

  it("в режиме правки смена сценария сначала спрашивает подтверждение", () => {
    renderStep({ editing: true, data: { ...stepData, scenario: current.id } });
    fireEvent.click(screen.getByRole("button", { name: other.name }));
    expect(
      screen.getByText(
        "Смена сценария пересоберёт цепочку кампании. Правки логики, сделанные вручную и через ИИ, будут потеряны.",
      ),
    ).toBeInTheDocument();
  });

  it("подтверждение применяет смену", () => {
    const onNext = vi.fn();
    renderStep({ editing: true, data: { ...stepData, scenario: current.id }, onNext });
    fireEvent.click(screen.getByRole("button", { name: other.name }));
    fireEvent.click(screen.getByRole("button", { name: "Сменить сценарий" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("отмена оставляет на шаге и сценарий не меняет", () => {
    const onNext = vi.fn();
    renderStep({ editing: true, data: { ...stepData, scenario: current.id }, onNext });
    fireEvent.click(screen.getByRole("button", { name: other.name }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("клик по уже выбранному сценарию диалога не поднимает", () => {
    renderStep({ editing: true, data: { ...stepData, scenario: current.id } });
    fireEvent.click(screen.getByRole("button", { name: current.name }));
    expect(screen.queryByText(/пересоберёт цепочку/)).toBeNull();
  });

  it("в обычном проходе визарда диалога нет", () => {
    const onNext = vi.fn();
    renderStep({ editing: false, data: stepData, onNext });
    fireEvent.click(screen.getByRole("button", { name: other.name }));
    expect(onNext).toHaveBeenCalled();
  });
});
