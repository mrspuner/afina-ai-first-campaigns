// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepBudget } from "./step-budget";
import { initialStepData } from "@/types/campaign";

// StepContent прячет детей за печатающейся анимацией — стабим, как в других
// тестах шагов, чтобы тело шага рендерилось синхронно.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Шагу нужен только рендер тела: подсказки экрана к бюджету отношения не имеют.
vi.mock("@/hooks/use-screen-hints", () => ({ useScreenHints: () => {} }));

afterEach(cleanup);

const streamData = {
  ...initialStepData,
  scenario: "base-registration",
  sourceType: "stream" as const,
  channels: ["sms" as const],
  fileRowCount: 10_000,
};

function renderStep(over: Partial<typeof streamData> = {}) {
  const onNext = vi.fn();
  render(
    <StepBudget data={{ ...streamData, ...over }} onNext={onNext} onBack={vi.fn()} active />,
  );
  return onNext;
}

describe("StepBudget — финальная развилка визарда", () => {
  // Абзац-развилка снят: его работу делают заголовок «Проверьте кампанию» и
  // подпись карточки прогноза про настройку бюджета при запуске.
  it("вместо абзаца-развилки обещает настройку бюджета при запуске", () => {
    renderStep();
    expect(screen.queryByText(/Вот прогноз бюджета/)).toBeNull();
    expect(
      screen.getByText(/Вы сможете настроить подходящий бюджет при запуске/),
    ).toBeInTheDocument();
  });

  it("основная кнопка называет действие — «Создать кампанию», а не «Далее»", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: "Создать кампанию" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Далее" })).toBeNull();
  });

  // Точечная правка с карточки ничего не создаёт: там свой лейбл футера.
  // Карточка прогноза при этом остаётся — цифры и есть смысл захода на шаг,
  // и обещание про настройку бюджета при запуске там тоже верно.
  it("в режиме правки лейбл берётся из footerOverride, прогноз остаётся", () => {
    render(
      <StepBudget
        data={streamData}
        onNext={vi.fn()}
        onBack={vi.fn()}
        active
        footerOverride={{ continueLabel: "Применить и вернуться", backLabel: "Отмена" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Вы сможете настроить подходящий бюджет при запуске/),
    ).toBeInTheDocument();
  });

  it("показывает сводку заполненного визарда над прогнозом", () => {
    renderStep();
    expect(screen.getByText("Сценарий")).toBeInTheDocument();
    // Сводка стоит ВЫШЕ прогноза — порядок в документе, а не только наличие.
    const summary = screen.getByText("Сценарий");
    const forecast = screen.getByText("Прогноз кампании");
    expect(
      summary.compareDocumentPosition(forecast) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // В изолированной правке правится ОДИН шаг: соседние значения не при делах,
  // и возвращаться из сводки некуда.
  it("в режиме правки сводки нет", () => {
    render(
      <StepBudget
        data={streamData}
        onNext={vi.fn()}
        onBack={vi.fn()}
        active
        footerOverride={{ continueLabel: "Применить и вернуться", backLabel: "Отмена" }}
      />,
    );
    expect(screen.queryByText("Сценарий")).toBeNull();
  });
});
