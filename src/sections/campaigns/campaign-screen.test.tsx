import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { CampaignScreen } from "./campaign-screen";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import { TemplatePreviewDrawer } from "./template-preview-drawer";
import { EmailEditorPanel } from "./email-editor-panel";
import { PRESET_TEMPLATES } from "@/state/app-state";
import type { Campaign, Preset } from "@/state/app-state";
import { createTemplate } from "@/state/workflow-templates";
import { setCachedGraph } from "./workflow-graph-cache";
import type { Channel } from "@/types/campaign";

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
          ChatProvider — потому что карточка ведёт правку через ИИ-дровер
          (useCampaignEditFlow), как и в page.tsx. */}
      <PromptChipsProvider>
        <ChatProvider>
          <Harness campaign={campaign} />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

/** Same tree as `renderCampaign` plus `TemplatePreviewDrawer` (the drawer ALL
 *  comm node-blocks open post-fix) and `EmailEditorPanel` (mirrors page.tsx's
 *  composition; kept mounted so tests can assert it stays CLOSED — proof the
 *  email block no longer routes there) — needed to assert the click actually
 *  opens the EXISTING drawer, not just flips chat-context state. */
function renderCampaignWithDrawers(campaign: Campaign) {
  return render(
    <AppStateProvider>
      <PromptChipsProvider>
        <ChatProvider>
          <Harness campaign={campaign} />
          <TemplatePreviewDrawer />
          <EmailEditorPanel />
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

  it("прячет «Изменить» у запущенной кампании", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_desc_active",
        status: "active",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    // Описание остаётся — read-only, как у скоринг-дровера launched-кампании.
    expect(screen.getByText("Сценарий кампании")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("прячет «Изменить» у остановленной и завершённой", () => {
    for (const status of ["paused", "completed"] as const) {
      const { unmount } = renderCampaign(
        baseCampaign({ id: `cmp_desc_${status}`, status }),
      );
      expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("ставит «Изменить» между текстом и мини-графом", () => {
    const { container } = renderCampaign(
      baseCampaign({ id: "cmp_desc_order", channels: ["sms"] }),
    );
    const section = screen.getByText("Сценарий кампании").closest("section")!;
    const edit = screen.getByRole("button", { name: "Изменить" });
    const graph = container.querySelector(".react-flow")!;

    expect(section.contains(edit)).toBe(true);
    expect(section.contains(graph)).toBe(true);
    // Порядок в документе: текст → «Изменить» → мини-граф.
    expect(
      edit.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("кампания без коммуникаций не выдумывает касаний", () => {
    renderCampaign(baseCampaign({ id: "cmp_desc_nocomm", channels: [] }));
    expect(screen.getByText("Старт.")).toBeInTheDocument();
    expect(screen.queryByText("Первое касание.")).not.toBeInTheDocument();
    expect(screen.getByText(/готовый сегмент/)).toBeInTheDocument();
  });

  it("ставит нодо-блок «Старта» под текстом «Старт.», ДО «Первого касания» — не хвостом после всего описания", () => {
    renderCampaign(
      baseCampaign({ id: "cmp_desc_slot", channels: ["sms"] }),
    );
    const start = screen.getByText("Старт.");
    const block = screen.getByTestId("scenario-node-block");
    const firstTouch = screen.getByText("Первое касание.");
    const edit = screen.getByRole("button", { name: "Изменить" });

    // Порядок в документе: «Старт.» → нодо-блок → «Первое касание.» → … → «Изменить».
    expect(
      start.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      block.compareDocumentPosition(firstTouch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      firstTouch.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("CampaignScreen — нодо-блок «Старт» (A2.1 — скоринг/сигнал)", () => {
  it("new/stream (черновик): нодо-блок скоринга — «База» с файлами, «Добавить файл» и сводка интересов/триггеров", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_node_scoring",
        sourceType: "new",
        files: [{ name: "base-1.csv", rowCount: 1200 }],
        interests: ["Кредитование"],
        triggers: ["Заявка на кредит"],
      }),
    );
    // Scoped to the node-block: the mini-preview graph below ALSO renders a
    // «Скоринг»/«Сигнал» node label (aria-hidden, but text queries still see
    // it), so an unscoped getByText would match twice.
    const block = within(screen.getByTestId("scenario-node-block"));
    expect(block.getByText("Скоринг")).toBeInTheDocument();
    expect(block.getByText("base-1.csv")).toBeInTheDocument();
    expect(block.getByRole("button", { name: "Добавить файл" })).toBeInTheDocument();
    expect(block.getByText("1 интерес, 1 триггер")).toBeInTheDocument();
  });

  it("own (черновик): нодо-блок сигнала — файл, без строки «Интересы и триггеры»", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_node_signal",
        sourceType: "own",
        files: [{ name: "crm-export.csv", rowCount: 500 }],
      }),
    );
    const block = within(screen.getByTestId("scenario-node-block"));
    expect(block.getByText("Сигнал")).toBeInTheDocument();
    expect(block.getByText("crm-export.csv")).toBeInTheDocument();
    expect(block.queryByText("Интересы и триггеры")).not.toBeInTheDocument();
    expect(block.queryByText("Скоринг")).not.toBeInTheDocument();
  });

  it("запущенная кампания: нодо-блок скоринга read-only — файлы видны, «Добавить файл» и удаление нет", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_node_readonly",
        sourceType: "new",
        status: "active",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
        files: [{ name: "base-1.csv", rowCount: 1200 }],
      }),
    );
    const block = within(screen.getByTestId("scenario-node-block"));
    expect(block.getByText("base-1.csv")).toBeInTheDocument();
    expect(
      block.queryByRole("button", { name: "Добавить файл" }),
    ).not.toBeInTheDocument();
    expect(
      block.queryByRole("button", { name: /Удалить файл/ }),
    ).not.toBeInTheDocument();
    expect(
      block.getByRole("button", { name: "Показать интересы и триггеры" }),
    ).toBeInTheDocument();
  });
});

describe("CampaignScreen — нодо-блоки коммуникаций под «Первым касанием» (A2.1)", () => {
  // «Возврат» — линейный (не сегментированный) шаблон: ровно одна нода на
  // канал, без дублей от сегментов (в отличие от дефолтного «Апсейл» в
  // baseCampaign, который сегментирован — см. graph-description.test.ts).
  const RETURN_SCENARIO = { id: "base-return", name: "Возврат" };

  /**
   * `channelTemplateParams("email")` (channel-nodes.ts) не совпадает ни с одним
   * пресетом библиотеки (см. graph-description.test.ts — «шаблон не
   * резолвится»), в отличие от sms/push, которые нарочно совпадают со своим
   * пресетом. Чтобы протестировать «резолвнутый шаблон» путь для email — ровно
   * так же, как sms/push, — патчим email-ноду свежепостроенного графа content'ом
   * реального пресета и кладём граф в durable-кэш кампании (тот же кэш, что несёт
   * ручные правки пользователя — CampaignScreen читает именно его).
   */
  function seedMatchedEmailGraph(campaignId: string, channels: Channel[]) {
    const graph = createTemplate("Возврат", "new", channels);
    const emailTemplate = PRESET_TEMPLATES.find(
      (t) =>
        t.channel === "email" &&
        t.content.kind === "email" &&
        t.content.emailId === "eml_offer",
    )!;
    const nodes = graph.nodes.map((n) =>
      n.data.nodeType === "email"
        ? { ...n, data: { ...n.data, params: { ...emailTemplate.content } } }
        : n,
    );
    setCachedGraph(campaignId, { nodes, edges: graph.edges });
    return emailTemplate;
  }

  it("рендерит по одному нодо-блоку на каждую первую коммуникацию (sms+email) с текущим шаблоном", () => {
    const campaignId = "cmp_comm_blocks";
    const emailTemplate = seedMatchedEmailGraph(campaignId, ["sms", "email"]);
    renderCampaign(
      baseCampaign({
        id: campaignId,
        scenario: RETURN_SCENARIO,
        channels: ["sms", "email"],
      }),
    );
    expect(
      screen.getByRole("button", { name: "Изменить шаблон: SMS — напоминание" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Изменить шаблон: ${emailTemplate.name}` }),
    ).toBeInTheDocument();
  });

  it("клик по блоку SMS открывает существующий дровер предпросмотра/редактора шаблона", () => {
    renderCampaignWithDrawers(
      baseCampaign({
        id: "cmp_comm_sms_click",
        scenario: RETURN_SCENARIO,
        channels: ["sms", "email"],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Изменить шаблон: SMS — напоминание" }),
    );
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(within(drawer).getByText("SMS — напоминание")).toBeInTheDocument();
  });

  // Fix: email раньше открывал EmailEditorPanel — другой дровер, чем графовая
  // нода (которая с #9bbf9fc резолвит «Шаблон» через control:"template" →
  // TemplatePreviewDrawer, как sms/push). Теперь блок открывает ТОТ ЖЕ дровер.
  it("клик по блоку Email открывает TemplatePreviewDrawer — тот же дровер, что и sms/push/граф", () => {
    const campaignId = "cmp_comm_email_click";
    const emailTemplate = seedMatchedEmailGraph(campaignId, ["sms", "email"]);
    renderCampaignWithDrawers(
      baseCampaign({
        id: campaignId,
        scenario: RETURN_SCENARIO,
        channels: ["sms", "email"],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Изменить шаблон: ${emailTemplate.name}` }),
    );
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(within(drawer).getByText(emailTemplate.name)).toBeInTheDocument();
    expect(screen.queryByTestId("email-editor-panel")).not.toBeInTheDocument();
  });

  it("показывает нодо-блок IVR (сценарий звонка) и открывает предпросмотр по клику", () => {
    renderCampaignWithDrawers(
      baseCampaign({
        id: "cmp_comm_ivr",
        scenario: RETURN_SCENARIO,
        channels: ["ivr"],
      }),
    );
    const trigger = screen.getByRole("button", {
      name: "Изменить шаблон: Персональное предложение",
    });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(within(drawer).getByText("Персональное предложение")).toBeInTheDocument();
  });

  it("запущенная кампания: нодо-блоки коммуникаций read-only («Показать шаблон» вместо «Изменить»)", () => {
    const campaignId = "cmp_comm_readonly";
    const emailTemplate = seedMatchedEmailGraph(campaignId, ["sms", "email"]);
    renderCampaign(
      baseCampaign({
        id: campaignId,
        scenario: RETURN_SCENARIO,
        channels: ["sms", "email"],
        status: "active",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Показать шаблон: SMS — напоминание" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Показать шаблон: ${emailTemplate.name}` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Изменить шаблон/ }),
    ).not.toBeInTheDocument();
  });

  // Fix: read-only меняет только аффорданс блока (Eye/«Показать») — клик
  // по-прежнему открывает ТОТ ЖЕ TemplatePreviewDrawer, что и до запуска
  // (правка внутри дровера ограничивается его собственным usedInCampaigns,
  // не статусом кампании — см. doc-comment CampaignCommunicationNodeBlock).
  it("запущенная кампания: клик по блоку Email открывает тот же TemplatePreviewDrawer (не EmailEditorPanel)", () => {
    const campaignId = "cmp_comm_email_readonly";
    const emailTemplate = seedMatchedEmailGraph(campaignId, ["sms", "email"]);
    renderCampaignWithDrawers(
      baseCampaign({
        id: campaignId,
        scenario: RETURN_SCENARIO,
        channels: ["sms", "email"],
        status: "active",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Показать шаблон: ${emailTemplate.name}` }),
    );
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(within(drawer).getByText(emailTemplate.name)).toBeInTheDocument();
    expect(screen.queryByTestId("email-editor-panel")).not.toBeInTheDocument();
  });

  it("кампания без коммуникаций не рендерит нодо-блоков каналов", () => {
    renderCampaign(baseCampaign({ id: "cmp_comm_none", channels: [] }));
    expect(screen.queryByText(/^Изменить шаблон/)).not.toBeInTheDocument();
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
