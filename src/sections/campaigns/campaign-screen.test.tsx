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
import type { Campaign, MessageTemplate, Preset } from "@/state/app-state";
import { initialStepData } from "@/types/campaign";
import { getCachedGraph } from "./workflow-graph-cache";

// WorkflowMiniPreview pulls in @xyflow/react, which touches ResizeObserver on
// mount — absent in jsdom. Provide a minimal no-op shim so the screen renders.
// Тот же шим кормит cmdk (Command внутри поповера тега шаблона, Task 7) —
// jsdom не несёт ни ResizeObserver, ни scrollIntoView.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
  // @xyflow/system's updateNodeInternals reads `new DOMMatrixReadOnly(transform).m22`
  // (zoom) off a scheduled requestAnimationFrame callback — jsdom has neither.
  // Surfaces only when a test awaits past that rAF tick (Task 7's popover test
  // does, via findBy*) while WorkflowMiniPreview is mounted with a graph that
  // just got a cache write; a bare stub is enough since no test here asserts on
  // the mini-preview's computed zoom/transform.
  if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrixReadOnly = class {
      m22 = 1;
      constructor() {}
    };
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

/** Seeds the given campaign (+ optional extra library templates) into real
 *  app state and opens its card view. */
function Harness({
  campaign,
  extraTemplates,
}: {
  campaign: Campaign;
  extraTemplates?: MessageTemplate[];
}) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    for (const template of extraTemplates ?? []) {
      dispatch({ type: "template_added", template });
    }
    const preset: Preset = {
      key: "full",
      label: "test",
      campaigns: [campaign],
      artifacts: [],
    };
    dispatch({ type: "preset_applied", preset });
    dispatch({ type: "campaign_opened", id: campaign.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, dispatch]);
  return <CampaignScreen />;
}

function renderCampaign(campaign: Campaign, extraTemplates?: MessageTemplate[]) {
  return render(
    <AppStateProvider>
      {/* WorkflowNodeComponent reads usePromptChips() (spec B #2 close→cleanup);
          mirror the real app tree, where PromptChipsProvider wraps the screen.
          ChatProvider — WorkflowNodeComponent's expanded node card (graph
          canvas) reads useChat() too; mirrors the real app tree. */}
      <PromptChipsProvider>
        <ChatProvider>
          <Harness campaign={campaign} extraTemplates={extraTemplates} />
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
    // Поповерные цели (шаблон, пауза) тоже теряют клик после запуска (§2.12,
    // Critical fix round 1) — значение остаётся текстом пилюли, но она
    // больше не button. Раньше пилюля их не гейтила вовсе.
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SMS — напоминание" }),
    ).toBeNull();
    expect(screen.getByText("2 дня")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2 дня" })).toBeNull();
  });

  it("сидовый черновик без снапшота: шаблон и пауза остаются кликабельными — graphEditable не зависит от editableSteps", () => {
    // Регресс, который ловит этот тест: гейтить template/node-fields на
    // editableSteps (наивный фикс) сделало бы их read-only и для СИДОВЫХ
    // черновиков без wizardData — а граф там правится, ровно как разрешал
    // снятый нодо-блок через readOnly={status !== "draft"}.
    renderCampaign({ ...draftCampaign, id: "cmp_facts_seed_draft", wizardData: undefined });
    expect(
      screen.getByRole("button", { name: "SMS — напоминание" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 дня" })).toBeInTheDocument();
    // При этом шаговые теги (нет снапшота — некуда вести) кнопкой не станут:
    // это разные сигналы, а не один и тот же гейт.
    expect(screen.queryByRole("button", { name: /строк/ })).toBeNull();
  });

  it("черновик со снапшотом: база, шаблон и пауза — всё кликабельно", () => {
    renderCampaign(draftCampaign);
    expect(screen.getByRole("button", { name: /строк/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SMS — напоминание" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 дня" })).toBeInTheDocument();
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

describe("CampaignScreen — поповер выбора шаблона у тега названия (Task 7)", () => {
  const smsExtra: MessageTemplate = {
    id: "tpl_sms_extra",
    channel: "sms",
    name: "SMS — акция",
    content: {
      kind: "sms",
      text: "Специальное предложение только сегодня!",
      alphaName: "AFINA",
      scheduledAt: "immediate",
    },
    usedInCampaigns: 0,
  };

  it("выбор другого шаблона в поповере переписывает текст ноды — описание перерисовывается", async () => {
    // Доказательство того, что редрей реально происходит (а не только
    // предполагается): дефолтная sms-нода Апсейла резолвит «SMS —
    // напоминание» (единственный преcет-шаблон канала); дописываем ВТОРОЙ
    // sms-шаблон в библиотеку, выбираем его в поповере пилюли и проверяем,
    // что ИМЕННО ЭТА пилюля сама сменила имя — точный признак того, что
    // workflow_node_field_set дошёл до durable-кэша графа (через headless
    // useCampaignGraphApplier — mailbox-слот иначе некому обработать, раз
    // граф-канвас на карточке не смонтирован) и CampaignScreen перерисовал
    // описание с новой версией кэша.
    const id = "cmp_template_popover";
    renderCampaign(baseCampaign({ id, channels: ["sms"] }), [smsExtra]);

    fireEvent.click(screen.getByRole("button", { name: "SMS — напоминание" }));
    fireEvent.click(await screen.findByText("SMS — акция"));

    expect(await screen.findByRole("button", { name: "SMS — акция" })).toBeInTheDocument();
    // Кэш реально переписан (не только видимость): хотя бы один sms-узел
    // теперь несёт текст нового шаблона. Апсейл сегментирует коммуникацию на
    // несколько физически идентичных sms-узлов (max/high/mid × повтор) —
    // правка бьёт только по ОДНОМУ из них, поэтому «SMS — напоминание»
    // законно остаётся на месте у остальных дублей (дедуп описания корректно
    // показывает две разные группы, а не баг).
    const newText = (smsExtra.content as { text: string }).text;
    expect(
      getCachedGraph(id)!.nodes.some(
        (n) => n.data.params?.kind === "sms" && (n.data.params as { text: string }).text === newText,
      ),
    ).toBe(true);
  });
});

describe("CampaignScreen — поповер паузы у тега длительности (Task 8)", () => {
  it("правка длительности в поповере паузы переписывает params ноды — описание перерисовывается", async () => {
    // То же доказательство редрея, что и у поповера шаблона (Task 7) выше, но
    // для второй цели поповера (node-fields): дефолтная пауза повтора Апсейла
    // — «2 дня» (durationHours: 48). Меняем её через ВЛОЖЕННЫЙ поповер поля
    // «Длительность» внутри WaitFields (тот же компонент, что несёт нодо-блок
    // графа) и проверяем, что ИМЕННО пилюля «2 дня» сама сменила подпись на
    // «5 дней» — признак того, что workflow_node_field_set дошёл до
    // durable-кэша через headless useCampaignGraphApplier (граф-канвас на
    // карточке не смонтирован, иначе слот некому было бы обработать) и
    // CampaignScreen перерисовал описание с новой версией кэша.
    const id = "cmp_wait_popover";
    renderCampaign(baseCampaign({ id, channels: ["sms"] }));

    fireEvent.click(screen.getByRole("button", { name: "2 дня" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Изменить поле «Длительность»" }),
    );
    fireEvent.change(screen.getByLabelText("Число"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "дней" }));

    expect(await screen.findByRole("button", { name: "5 дней" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2 дня" })).toBeNull();
    // Кэш реально переписан (не только видимость).
    expect(
      getCachedGraph(id)!.nodes.some(
        (n) => n.data.params?.kind === "wait" && (n.data.params as { durationHours?: number }).durationHours === 120,
      ),
    ).toBe(true);
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
