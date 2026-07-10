import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { CampaignScreen } from "./campaign-screen";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
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
          mirror the real app tree, where PromptChipsProvider wraps the screen. */}
      <PromptChipsProvider>
        <Harness campaign={campaign} />
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

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
