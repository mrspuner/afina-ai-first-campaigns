import { describe, it, expect, afterEach, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";
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

// Fix round 2 (coordinator review): the ORDINARY (non-isolated) wizard's own
// launch handoff dropped the Budget step's submitted partial —
// `onNext={() => handleLaunchFromBudget()}` discarded whatever `StepBudget`
// passed, so `LaunchRequest.cost`/`stepData` were built from stale
// pre-submission state. Every campaign created through the normal wizard
// therefore snapshot a `budget`/`wizardData.budget` that never carried the
// user's actual choice — which starves `graph-description.ts`'s
// `facts?.budget !== undefined` gate, so the budget tag never renders at all.
// Jump straight to the last (Бюджет) step via `initialStepDataOverride` +
// `initialStep` (the same mechanism the dev-seed harness and "Открыть и
// редактировать" already use) — intent "comms-own" keeps the step list short
// (scenario, intent, file, channels, budget — budget is step 5) so the test
// doesn't have to walk scenario/interests/analysis/file UI it isn't testing.
//
// Module-scoped (Task 3): originally declared inside the describe below, but
// the new «Создаём кампанию» describe at the bottom of this file needs both
// helpers too — hoisted here, bodies unchanged, so both describes share them.
function renderAtBudgetStep(onLaunchRequested: (req: unknown) => void) {
  return render(
    <AppStateProvider>
      <PromptChipsProvider>
        <ChatProvider>
          <CampaignWorkspace
            onLaunchRequested={onLaunchRequested}
            initialStepDataOverride={{
              ...initialStepData,
              intent: "comms-own",
              sourceType: "own",
              scenario: "base-registration",
              channels: ["sms"],
              fileRowCount: 5000,
            }}
            initialStep={5}
          />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

// WorkspaceInner mounts every reached step (1..maxStep) at once, and every
// step's footer reuses the same "Далее" label — scope every query to the
// Бюджет step's own StepContent root (same pattern wizard-buttons.spec.ts
// uses) so a click never lands on some other mounted step's button.
function budgetStepScope() {
  return within(screen.getByText("Проверьте кампанию").closest("div")!);
}

describe("CampaignWorkspace — изолированный режим правки шага (Task 12)", () => {
  afterEach(cleanup);

  it("изолированный режим показывает только запрошенный шаг", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    expect(screen.getByText("Как будем общаться с аудиторией?")).toBeInTheDocument();
    expect(screen.queryByText("Проверьте кампанию")).toBeNull();
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
    expect(screen.getByText("Проверьте кампанию")).toBeInTheDocument();
  });

  // Item 2 (финальная полировка): степпер должен отличать «значение не
  // меняется» (галочка) от «в колонке правки, но ещё не пройдено» (номер).
  /** Кружок шага в степпере по подписи — тот же приём, что campaign-stepper.test.tsx. */
  function stepCircle(label: string): HTMLElement {
    const labelButton = screen.getByRole("button", { name: label });
    const row = labelButton.closest("div.flex.items-center") as HTMLElement;
    const circle = row.querySelector('[class*="rounded-full"]') as HTMLElement;
    if (!circle) throw new Error(`circle not found for ${label}`);
    return circle;
  }
  function hasCheckmark(label: string): boolean {
    return stepCircle(label).querySelector("svg") !== null;
  }

  it("«Бюджет», обнулённый сменой канала, несёт номер (не галочку) — остальные шаги вне колонки несут галочку", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    // «Каналы» — активный шаг сессии, «Бюджет» попал в колонку правки, но
    // пользователь его ещё не открывал в ЭТОЙ сессии.
    expect(hasCheckmark("Проверка настроек")).toBe(false);
    expect(screen.getByText("7")).toBeInTheDocument();
    // Всё остальное — вне колонки, значение снапшота не тронуто правкой.
    for (const label of ["Сценарий", "Цель", "Интересы", "Режим", "Файл"]) {
      expect(hasCheckmark(label)).toBe(true);
    }
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
    expect(screen.queryByText("Проверьте кампанию")).toBeNull();
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

    // Ввода своей суммы на шаге больше нет — бюджет задаётся при запуске.
    // Инвариант тот же: пройденный шаг коммитит СВЕЖЕ ПОСЧИТАННЫЙ бюджет под
    // новый набор каналов, а не застрявшее снапшотное значение.
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.budget).toBeGreaterThan(0);
    expect(committed.budget).not.toBe(snapshot.budget);
  });

  it("восстановление каналов, затем повторное изменение — бюджет снова маскируется, а не застревает восстановленным", () => {
    renderWorkspace({ editing: { campaignId: "cmp_1", step: "channels" }, snapshot });
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(screen.getByRole("button", { name: "Каналы" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Push/ })); // восстановили снапшот
    expect(screen.queryByText("Проверьте кампанию")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();

    // Меняем каналы снова (по-другому) — маска обязана вернуться.
    fireEvent.click(screen.getByRole("checkbox", { name: /Звонок/ }));
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
    expect(screen.getByText("Проверьте кампанию")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Применить и вернуться" }),
    ).toBeNull();
  });
});

// Final-review fix (Item 2): `Step1Scenario.applyScenario` calls
// `onValueChange` and `onNext` from the SAME synchronous click handler (the
// confirm button in the change-scenario dialog) — unlike channels/file/
// analysis, which fire `onValueChange` on live interaction and `onNext` on a
// LATER, separate footer click. `handleIsolatedNext` used to read the
// `pendingResets` STATE set by that `onValueChange` call, but React hadn't
// re-rendered yet, so it still held the value from the PREVIOUS render —
// empty on a fresh session. That made `STEP_INVALIDATES.scenario = ["budget"]`
// dead in the isolated flow: the scenario committed immediately, budget
// untouched, and the card showed a stale budget pill next to a payment-screen
// total that had already moved on.
describe("CampaignWorkspace — изолированная «Сценарий»: смена каскадирует на «Бюджет», не коммитит сразу", () => {
  afterEach(cleanup);

  const scenarioSnapshot: StepData = {
    ...initialStepData,
    scenario: "cur-abandoned-cart",
    channels: ["sms", "email"],
    fileRowCount: 5000,
    budget: 42000,
    budgetMode: "recommended",
  };

  it("подтверждение смены сценария растит колонку до «Бюджета» и НЕ коммитит", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "scenario" },
      snapshot: scenarioSnapshot,
      onCommit,
    });

    // Выбрать ДРУГОЙ сценарий — поднимает диалог подтверждения (editing=true).
    fireEvent.click(screen.getByRole("button", { name: "Спящий клиент" }));
    fireEvent.click(screen.getByRole("button", { name: "Сменить сценарий" }));

    // Коммита ещё не было — сценарий применился в СЕССИЮ, а не наружу.
    expect(onCommit).not.toHaveBeenCalled();
    // Колонка выросла до «Бюджета» — ровно то, что делает каскад канала.
    expect(screen.getByText("Проверьте кампанию")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    ).toBeInTheDocument();
  });

  it("после смены сценария коммит несёт НОВЫЙ сценарий и пересчитанный бюджет", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "scenario" },
      snapshot: scenarioSnapshot,
      onCommit,
    });

    fireEvent.click(screen.getByRole("button", { name: "Спящий клиент" }));
    fireEvent.click(screen.getByRole("button", { name: "Сменить сценарий" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.scenario).toBe("cur-sleeping");
    // Бюджет пересчитан под новый сценарий, а не взят из снапшота.
    expect(committed.budget).toBeGreaterThan(0);
    expect(committed.budget).not.toBe(scenarioSnapshot.budget);
  });

  it("клик по УЖЕ выбранному сценарию не поднимает диалог и коммитит сразу, бюджет не трогая", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "scenario" },
      snapshot: scenarioSnapshot,
      onCommit,
    });

    fireEvent.click(screen.getByRole("button", { name: "Брошенная корзина" }));

    expect(screen.queryByText("Сменить сценарий?")).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.scenario).toBe("cur-abandoned-cart");
    expect(committed.budget).toBe(scenarioSnapshot.budget);
  });
});

// Track-14 fix (final-review Critical finding): the isolated «Интересы» step
// hydrated the shared editor with `StepData.interests`/`triggers` LABEL
// arrays where it expects internal ids (`resolveSelectionIds` was missing —
// the scoring drawer's `ScoringInterestsPanel` performs that resolution
// correctly, `Step2Interests` did not). A campaign edited through this path
// showed ZERO pre-existing selections, and applying anything silently
// replaced the campaign's real targeting instead of merging into it.
describe("CampaignWorkspace — изолированная «Интересы»: гидрация из снапшота кампании", () => {
  afterEach(cleanup);

  const interestsSnapshot: StepData = {
    ...initialStepData,
    scenario: "base-registration",
    interests: ["Кредитование"],
    triggers: ["Посещение сайтов банков с предложениями кредитов"],
    triggerConfig: {
      "credit-banks": { added: ["example.ru"], excluded: [] },
    },
  };

  it("показывает сохранённые интерес и триггер кампании выбранными, а не пустыми", () => {
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "interests" },
      snapshot: interestsSnapshot,
    });

    expect(
      screen.getByRole("button", { name: "Кредитование" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("checkbox", { name: "Снять выбор триггера" }),
    ).toBeInTheDocument();
  });

  it("выбор ДОПОЛНИТЕЛЬНОГО интереса сохраняет исходные интерес/триггер/triggerConfig — мёрдж, а не замена", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "interests" },
      snapshot: interestsSnapshot,
      onCommit,
    });

    // Добавляем ВТОРОЙ интерес того же направления, не трогая уже выбранный.
    fireEvent.click(screen.getByRole("button", { name: "Рассрочка и BNPL" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as StepData;
    expect(committed.interests).toEqual(
      expect.arrayContaining(["Кредитование", "Рассрочка и BNPL"]),
    );
    expect(committed.triggers).toEqual(
      expect.arrayContaining(["Посещение сайтов банков с предложениями кредитов"]),
    );
    expect(committed.triggerConfig["credit-banks"]).toEqual({
      added: ["example.ru"],
      excluded: [],
    });
  });
});

describe("CampaignWorkspace — обычный визард: явный бюджет доходит до LaunchRequest", () => {
  // Task 3: клик по «Создать кампанию» больше не создаёт кампанию сразу — он
  // взводит четырёхсекундный экран ожидания (SurveyAwaiting), и только его
  // onDone (durationMs + 200мс) вызывает onLaunchRequested. Фейковые таймеры
  // нужны, чтобы прокрутить это ожидание в тесте.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("рекомендованная сумма (без ручного ввода) тоже доходит до LaunchRequest — не 0/null от устаревшего stepData", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    const budget = budgetStepScope();

    // Режим «Рекомендуемая» — активен по умолчанию, ничего вводить не нужно.
    fireEvent.click(budget.getByRole("button", { name: "Создать кампанию" }));

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    expect(onLaunchRequested).toHaveBeenCalledTimes(1);
    const req = onLaunchRequested.mock.calls[0][0] as {
      cost: number;
      stepData: StepData;
    };
    expect(req.cost).toBeGreaterThan(0);
    expect(req.stepData.budget).toBe(req.cost);
  });
});

describe("CampaignWorkspace — экран «Создаём кампанию» перед карточкой", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("клик по «Создать кампанию» поднимает экран ожидания и НЕ создаёт кампанию сразу", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );

    expect(screen.getByText("Создаём кампанию")).toBeInTheDocument();
    expect(onLaunchRequested).not.toHaveBeenCalled();
  });

  it("экран ожидания говорит, где лежат кампании", () => {
    renderAtBudgetStep(vi.fn());
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );
    expect(
      screen.getByText("Все кампании хранятся в разделе «Кампании»"),
    ).toBeInTheDocument();
  });

  it("на время ожидания колонка шагов и степпер убраны", () => {
    renderAtBudgetStep(vi.fn());
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );
    expect(screen.queryByText("Проверьте кампанию")).toBeNull();
    expect(screen.queryByRole("button", { name: "Проверка настроек" })).toBeNull();
  });

  it("кампания создаётся через 4 секунды, а не раньше", () => {
    const onLaunchRequested = vi.fn();
    renderAtBudgetStep(onLaunchRequested);
    fireEvent.click(
      budgetStepScope().getByRole("button", { name: "Создать кампанию" }),
    );

    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(onLaunchRequested).not.toHaveBeenCalled();

    // 4000 мс бара + 200 мс паузы SurveyAwaiting перед onDone.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onLaunchRequested).toHaveBeenCalledTimes(1);
  });

  // Точечная правка с карточки кампанию не создаёт — она коммитит правку
  // существующей. Экран «Создаём кампанию» там был бы прямой ложью.
  it("в режиме точечной правки экран ожидания не поднимается", () => {
    const onCommit = vi.fn();
    renderWorkspace({
      editing: { campaignId: "cmp_1", step: "budget" },
      snapshot,
      onCommit,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Применить и вернуться" }),
    );
    expect(screen.queryByText("Создаём кампанию")).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
