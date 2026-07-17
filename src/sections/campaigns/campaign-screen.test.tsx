import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import { CampaignScreen } from "./campaign-screen";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import type { Campaign, Preset } from "@/state/app-state";

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
