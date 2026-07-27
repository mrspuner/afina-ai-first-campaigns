import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CampaignWorkspace } from "./campaign-workspace";
import { AppStateProvider } from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import { initialStepData, type StepData } from "@/types/campaign";
import type { WizardStepId } from "./wizard-steps";

// StepContent печатает заголовок/подзаголовок через setInterval (эффект
// печатной машинки) и монтирует детей только по завершении — по тому же
// паттерну, что и остальные тесты шагов (step-analysis.test.tsx,
// step-budget.test.tsx, ...), мокаем его для синхронного рендера. Заголовок
// оставляем (в отличие от тех тестов) — по нему тесты ниже отличают, какой
// именно шаг сейчас смонтирован в изолированной колонке.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// jsdom не несёт scrollIntoView (используется при переходе между шагами
// сессии) — тот же шим, что в campaign-screen.test.tsx и соседних файлах.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

// Реальный сценарий (a не выдуманный id) — чтобы StepBudget прошёл по
// нормальному пути graphCostFor, а не по фолбэку "сценарий не выбран".
// `budget` — настоящее ненулевое значение (не null из initialStepData): тест
// на отмену инвалидирующей правки должен различать «зафабрикованный null» от
// «честно восстановленного снапшотного значения», а два null неотличимы.
const snapshot: StepData = {
  ...initialStepData,
  scenario: "base-registration",
  channels: ["sms", "email"],
  fileRowCount: 5000,
  budget: 42000,
  budgetMode: "recommended",
};

function renderWorkspace({
  editing,
  snapshot,
  onCommit,
  onCancel,
}: {
  editing: { campaignId: string; step: WizardStepId };
  snapshot: StepData;
  onCommit?: (stepData: StepData) => void;
  onCancel?: () => void;
}) {
  return render(
    <AppStateProvider>
      <PromptChipsProvider>
        <ChatProvider>
          <CampaignWorkspace
            editing={editing}
            initialStepDataOverride={snapshot}
            onCommit={onCommit}
            onCancel={onCancel}
          />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

describe("CampaignWorkspace — изолированный режим правки шага (Task 12)", () => {
  afterEach(cleanup);

  it("изолированный режим показывает только запрошенный шаг", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByText("Как будем общаться с аудиторией?")).toBeInTheDocument();
    expect(screen.queryByText("Прогноз бюджета")).toBeNull();
  });

  it("без правки основная кнопка читается как «Применить и вернуться»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();
  });

  it("снятие канала обнуляет бюджет, шаг появляется в колонке, кнопка — «Далее»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
    // Шаг «Бюджет» реально появился в колонке — не только подпись поменялась.
    expect(screen.getByText("Прогноз бюджета")).toBeInTheDocument();
  });

  it("слева — «Отмена», а не «Назад»", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByRole("button", { name: "Отмена" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("«Отмена» ничего не применяет", () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "channels" },
      snapshot,
      onCommit,
      onCancel,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("коммит один — на последней основной кнопке, а не на каждом «Далее»", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "channels" },
      snapshot,
      onCommit,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onCommit).not.toHaveBeenCalled(); // прошли на бюджет — наружу ничего не ушло

    // Добить бюджет и нажать «Применить и вернуться» — тогда ровно один вызов,
    // с итоговым stepData (изменённые каналы + пересчитанный бюджет).
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.channels).toEqual(["sms"]);
    expect(committed.budget).not.toBeNull();
  });
});

// Fix round 1 (coordinator review): undoing an invalidating edit must
// un-mask the snapshot's real value, not leave a destructively-applied reset
// behind. See campaign-workspace.tsx's `deriveStepData` doc comment.
describe("CampaignWorkspace — отмена инвалидирующей правки не фабрикует бюджет", () => {
  afterEach(cleanup);

  it("смена каналов, «Далее», возврат на «Каналы» через степпер и восстановление исходного набора — коммит несёт снапшотный бюджет, а не null/undefined", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "channels" },
      snapshot,
      onCommit,
    });
    // Добавить Push — отличается от снапшота, инвалидирует бюджет.
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    // Вернуться на «Каналы» через степпер — доступен, он в колонке правки.
    fireEvent.click(screen.getByRole("button", { name: "Каналы" }));
    // Снять Push обратно — набор снова совпадает со снапшотом.
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));

    // Живой выбор снова совпал со снапшотом — обнулять уже нечего, «Бюджет»
    // выпадает из колонки, кнопка возвращается к «Применить и вернуться».
    expect(screen.queryByText("Прогноз бюджета")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.channels).toEqual(snapshot.channels);
    expect(committed.budget).toBe(snapshot.budget); // не null, не undefined — снапшотное значение
  });

  it("явная правка бюджета после смены каналов побеждает маску — коммитится новое значение, а не снапшотное", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "channels" },
      snapshot,
      onCommit,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    // На «Бюджете»: переключиться на «Своя сумма» и ввести своё значение.
    fireEvent.click(screen.getByRole("button", { name: /Своя сумма/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Своя сумма" }), {
      target: { value: "99999" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.budget).toBe(99999);
    expect(committed.budget).not.toBe(snapshot.budget);
  });

  it("восстановление каналов, затем повторное изменение — бюджет снова маскируется, а не застревает восстановленным", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(screen.getByRole("button", { name: "Каналы" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ })); // восстановили снапшот
    expect(screen.queryByText("Прогноз бюджета")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();

    // Меняем каналы снова (по-другому) — маска обязана вернуться.
    fireEvent.click(screen.getByRole("checkbox", { name: /Звонок/ }));
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
    expect(screen.getByText("Прогноз бюджета")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Применить и вернуться" }),
    ).toBeNull();
  });
});
