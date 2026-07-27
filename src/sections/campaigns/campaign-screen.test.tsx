import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignScreen } from "./campaign-screen";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import type { Campaign, Preset } from "@/state/app-state";
import { initialStepData } from "@/types/campaign";

// WorkflowMiniPreview pulls in @xyflow/react, which touches ResizeObserver on
// mount — absent in jsdom. Provide a minimal no-op shim so the screen renders.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function baseCampaign(partial: Partial<Campaign>): Campaign {
  return {
    id: "cmp_test",
    name: "Тестовая кампания",
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    scenario: { id: "base-upsell", name: "Апсейл" },
    sourceType: "new",
    channels: ["sms"],
    budget: 50000,
    ...partial,
  };
}

/** Seeds the given campaign into real app state and opens its card view. */
function Harness({ campaign }: { campaign: Campaign }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const preset: Preset = {
      key: "full",
      label: "test",
      campaigns: [campaign],
      artifacts: [],
    };
    dispatch({ type: "preset_applied", preset });
    dispatch({ type: "campaign_opened", id: campaign.id });
  }, [campaign, dispatch]);
  return <CampaignScreen />;
}

function renderCampaign(campaign: Campaign) {
  return render(
    <AppStateProvider>
      {/* WorkflowNodeComponent reads usePromptChips() (spec B #2 close→cleanup);
          mirror the real app tree, where PromptChipsProvider wraps the screen.
          ChatProvider — WorkflowNodeComponent's expanded node card (graph
          canvas) reads useChat() too; mirrors the real app tree. */}
      <PromptChipsProvider>
        <ChatProvider>
          <Harness campaign={campaign} />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

describe("CampaignScreen — блок «Сценарий кампании»", () => {
  it("заменяет секцию «Workflow» на объединённый блок с описанием", () => {
    renderCampaign(baseCampaign({ id: "cmp_desc", channels: ["sms"] }));
    expect(screen.getByText("Сценарий кампании")).toBeInTheDocument();
    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();
  });

  it("описывает цепочку текстом по launchGraph", () => {
    renderCampaign(baseCampaign({ id: "cmp_desc_text", channels: ["sms"] }));
    expect(screen.getByText("Старт.")).toBeInTheDocument();
    expect(screen.getByText("Первое касание.")).toBeInTheDocument();
    // Текст SMS-ноды шаблона попадает в описание дословно.
    expect(
      screen.getByText(/Ваше предложение ждёт\. Подробности на сайте\./),
    ).toBeInTheDocument();
  });

  it("озаглавливает мини-граф «Граф кампании»", () => {
    renderCampaign(baseCampaign({ id: "cmp_desc_graph", channels: ["sms"] }));
    expect(screen.getByText("Граф кампании")).toBeInTheDocument();
  });

  it("не показывает инлайн-«Изменить» ни при каком статусе кампании — правка идёт через граф", () => {
    for (const status of ["draft", "active", "paused", "completed"] as const) {
      const { unmount } = renderCampaign(
        baseCampaign({
          id: `cmp_desc_${status}`,
          status,
          ...(status === "active" || status === "completed"
            ? { phase: "communicating" as const, launchedAt: "2026-06-02T00:00:00.000Z" }
            : {}),
        }),
      );
      // Описание остаётся видимым при любом статусе — только affordance правки снят.
      expect(screen.getByText("Сценарий кампании")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("ставит мини-граф сразу после текста описания в том же блоке", () => {
    const { container } = renderCampaign(
      baseCampaign({ id: "cmp_desc_order", channels: ["sms"] }),
    );
    const section = screen.getByText("Сценарий кампании").closest("section")!;
    const description = screen.getByText("Старт.");
    const graph = container.querySelector(".react-flow")!;

    expect(section.contains(description)).toBe(true);
    expect(section.contains(graph)).toBe(true);
    // Порядок в документе: текст описания → мини-граф.
    expect(
      description.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("кампания без коммуникаций не выдумывает касаний", () => {
    renderCampaign(baseCampaign({ id: "cmp_desc_nocomm", channels: [] }));
    expect(screen.getByText("Старт.")).toBeInTheDocument();
    expect(screen.queryByText("Первое касание.")).not.toBeInTheDocument();
    expect(screen.getByText(/готовый сегмент/)).toBeInTheDocument();
  });
});

describe("CampaignScreen — CampaignFacts на карточке, нодо-блоки сняты (Task 6)", () => {
  // Черновик с полными фактами: файлы (→ facts.baseRows), триггер (→
  // facts.triggers) и снапшот визарда (→ editableSteps непуст — единственное,
  // что решает кликабельность; значения сами читаются с полей кампании, а
  // НЕ из wizardData, поэтому снапшот ниже удаляется без потери текста).
  const draftCampaign = baseCampaign({
    id: "cmp_facts_draft",
    files: [{ name: "base-1.csv", rowCount: 1200 }],
    triggers: ["Ипотека"],
    wizardData: { ...initialStepData, intent: "signals-comms", sourceType: "new" },
  });

  it("описание черновика несёт кликабельные теги значений", () => {
    renderCampaign(draftCampaign);
    // Тег «база» (facts.baseRows → «1 200 строк») — сам тег несёт только
    // число, слово «база» стоит ПЕРЕД ним обычным текстом (см.
    // graph-description.ts baseTriggerSegments), поэтому имя кнопки — не
    // полная фраза, а собственный текст пилюли.
    expect(screen.getByRole("button", { name: /строк/ })).toBeInTheDocument();
  });

  it("режим анализа выводится из sourceType, а не из снапшота", () => {
    renderCampaign({
      ...draftCampaign,
      id: "cmp_facts_mode",
      sourceType: "stream",
      wizardData: undefined,
    });
    expect(screen.getByText("потоковый")).toBeInTheDocument();
  });

  it("у запущенной кампании теги показывают значения, но не кликаются", () => {
    renderCampaign({
      ...draftCampaign,
      id: "cmp_facts_readonly",
      status: "active",
      phase: "communicating",
      launchedAt: "2026-06-02T00:00:00.000Z",
      wizardData: undefined,
    });
    expect(screen.getByText(/строк/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /строк/ })).toBeNull();
  });

  // Брифовская заготовка утверждала queryByText("Скоринг") === null — неверно:
  // WorkflowMiniPreview рендерит ТОТ ЖЕ узел «Скоринг» в мини-графе (aria-hidden,
  // но getByText его всё равно видит — см. старый комментарий в удалённом
  // node-block-тесте), поэтому такая проверка ловит мини-граф, а не отсутствие
  // блока. Проверяем напрямую то, что было единственным для нодо-блоков —
  // их testid и аффорданс «Изменить шаблон».
  it("нодо-блоки «Старта» и «Первого касания» с карточки сняты", () => {
    renderCampaign(draftCampaign);
    expect(screen.queryByTestId("scenario-node-block")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Изменить шаблон/ })).toBeNull();
  });

  it("клик по кликабельному тегу диспатчит campaign_step_edit_requested и уводит с карточки", () => {
    renderCampaign(draftCampaign);
    fireEvent.click(screen.getByRole("button", { name: /строк/ }));
    // campaign_step_edit_requested меняет view на "guided-campaign" —
    // CampaignScreen перестаёт видеть кампанию как view.kind==="campaign" и
    // рендерит null (карточка снята, изолированный шаг визарда открыт).
    expect(screen.queryByText("Сценарий кампании")).not.toBeInTheDocument();
  });

  it("красит пилюлю шаблона под цвет sms-узла графа, а не оставляет её нейтральной", () => {
    renderCampaign(draftCampaign);
    // «SMS — напоминание» — резолвнутый шаблон дефолтной sms-ноды (Апсейл),
    // тег target:"template". Без лукапа nodeId→nodeType (Task 5 gap) пилюля
    // падала на нейтральный серый — Task 6 красит её под NODE_STYLES.sms.
    const pill = screen.getByRole("button", { name: "SMS — напоминание" });
    expect(pill.className).not.toContain("border-border");
  });
});

describe("CampaignScreen — #25 «Статус кампании» block removed", () => {
  it("does not render a «Статус кампании» section for an active campaign", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_active",
        status: "active",
        sourceType: "own",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    expect(screen.queryByText("Статус кампании")).not.toBeInTheDocument();
  });

  it("does not render a «Статус кампании» section for a completed campaign", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_done",
        status: "completed",
        sourceType: "new",
        phase: "communicating",
        completedAt: "2026-06-10T00:00:00.000Z",
      }),
    );
    expect(screen.queryByText("Статус кампании")).not.toBeInTheDocument();
  });
});

describe("CampaignScreen — «Прогресс кампании» canonical progress row", () => {
  it("shows the «Прогресс» stepper expanded by default with the current stage + providers", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_comm",
        status: "active",
        sourceType: "new",
        channels: ["sms"],
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    // The row is present…
    expect(screen.getByText("Прогресс")).toBeInTheDocument();
    // …its current stage (comms started) — в summary И в развёрнутом степпере…
    expect(screen.getAllByText("Коммуникация по сигналам").length).toBeGreaterThan(0);
    // …the retired ad-hoc «Провайдеры данных» section is gone…
    expect(screen.queryByText("Провайдеры данных")).not.toBeInTheDocument();
    // …и раскрыто по умолчанию — провайдеры («Обработка базы» done → settled) видны.
    expect(screen.getByText("Билайн")).toBeInTheDocument();
  });

  it("streaming: current «Обработка и коммуникация» reveals providers + Суммарно (expanded by default)", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_stream",
        status: "active",
        sourceType: "stream",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    // Лейбл этапа — в summary и в степпере.
    expect(screen.getAllByText("Обработка и коммуникация").length).toBeGreaterThan(0);
    // Раскрыто по умолчанию → live-провайдеры под текущим этапом, initially pending…
    expect(screen.getByText("Билайн")).toBeInTheDocument();
    expect(screen.getAllByText("ожидание подключения").length).toBeGreaterThan(0);
    // …и streaming показывает суммарную строку сигналов/день.
    expect(screen.getByText("Суммарно")).toBeInTheDocument();
  });

  it("no-comm non-streaming: the stepper omits «Коммуникация по сигналам» (expanded by default)", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_nocomm",
        status: "active",
        sourceType: "new",
        channels: [],
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    // «Кампания завершена» is the terminal stage (also echoed in the summary).
    expect(screen.getAllByText("Кампания завершена").length).toBeGreaterThan(0);
    expect(screen.queryByText("Коммуникация по сигналам")).not.toBeInTheDocument();
  });
});

describe("CampaignScreen — артефакт скрыт до порога коммуникации (пост-лонч)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("свеже-запущенная (phase scoring) — артефакт скрыт до порога коммуникации", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:10.000Z")); // +10с (< 46с)
    renderCampaign(
      baseCampaign({
        id: "cmp_fresh",
        status: "active",
        sourceType: "new",
        channels: ["sms"],
        phase: "scoring",
        launchedAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    expect(screen.queryByText("Артефакты")).not.toBeInTheDocument();
  });
});

describe("CampaignScreen — статистика пустая (—) до коммуникации", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("статистика пустая (—) до коммуникации", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:10.000Z")); // scoring, < 46с
    renderCampaign(baseCampaign({
      id: "cmp_stat", status: "active", sourceType: "new", channels: ["sms"],
      phase: "scoring", launchedAt: "2026-06-01T00:00:00.000Z",
    }));
    // "Статистика" matches both the secondary-action button and the
    // CardSection label — use getAllByText like the other multi-match
    // assertions in this file.
    expect(screen.getAllByText("Статистика").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
