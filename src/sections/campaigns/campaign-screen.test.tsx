import { beforeAll, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignScreen } from "./campaign-screen";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
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
      <Harness campaign={campaign} />
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
  it("shows a collapsed «Прогресс» row whose summary is the current stage; providers are hidden until expanded", () => {
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
    // …its collapsed summary is the current stage (comms started)…
    expect(screen.getByText("Коммуникация по сигналам")).toBeInTheDocument();
    // …the retired ad-hoc «Провайдеры данных» section is gone…
    expect(screen.queryByText("Провайдеры данных")).not.toBeInTheDocument();
    // …and providers are not rendered while collapsed.
    expect(screen.queryByText("Билайн")).not.toBeInTheDocument();
  });

  it("streaming: current stage «Обработка и коммуникация» reveals providers + a Суммарно line when expanded", () => {
    renderCampaign(
      baseCampaign({
        id: "cmp_stream",
        status: "active",
        sourceType: "stream",
        phase: "communicating",
        launchedAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    expect(screen.getByText("Обработка и коммуникация")).toBeInTheDocument();
    // Expand the progress stepper.
    fireEvent.click(screen.getByRole("button", { name: /Прогресс/ }));
    // Providers render under the current processing stage, initially pending…
    expect(screen.getByText("Билайн")).toBeInTheDocument();
    expect(screen.getAllByText("ожидание подключения").length).toBeGreaterThan(0);
    // …and streaming shows the running per-day summary line.
    expect(screen.getByText("Суммарно")).toBeInTheDocument();
  });

  it("no-comm non-streaming: the stepper omits «Коммуникация по сигналам»", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Прогресс/ }));
    // «Кампания завершена» is the terminal stage (also echoed in the summary).
    expect(screen.getAllByText("Кампания завершена").length).toBeGreaterThan(0);
    expect(screen.queryByText("Коммуникация по сигналам")).not.toBeInTheDocument();
  });
});
