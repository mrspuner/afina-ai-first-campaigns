import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CampaignProgress,
  campaignProgressStages,
  currentStageLabel,
  stageStatus,
  providerSignalsPerDay,
  connectedSignalsPerDay,
  campaignStageList,
  campaignStageAt,
  communicatingThresholdMs,
  stageBoundariesMs,
} from "./campaign-progress";
import { PROVIDERS } from "@/data/providers";
import type { Campaign } from "@/state/app-state";

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "C",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    sourceType: "new",
    channels: ["sms", "email"],
    phase: "scoring",
    ...over,
  } as Campaign;
}

const labels = (c: Campaign) => campaignProgressStages(c).stages.map((s) => s.label);

describe("campaignProgressStages — stage sequences by type/comm", () => {
  it("non-streaming WITH communication → 5 stages ending «Кампания завершена»", () => {
    const c = campaign({ sourceType: "new", channels: ["sms", "email"] });
    expect(labels(c)).toEqual([
      "Отправка провайдерам",
      "Проверка провайдерами",
      "Обработка базы",
      "Коммуникация по сигналам",
      "Кампания завершена",
    ]);
  });

  it("non-streaming WITHOUT communication → 4 stages, no «Коммуникация по сигналам»", () => {
    const c = campaign({ sourceType: "new", channels: [] });
    expect(labels(c)).toEqual([
      "Отправка провайдерам",
      "Проверка провайдерами",
      "Обработка базы",
      "Кампания завершена",
    ]);
    expect(labels(c)).not.toContain("Коммуникация по сигналам");
  });

  it("own source is treated as non-streaming (uses the same sequences)", () => {
    expect(labels(campaign({ sourceType: "own", channels: ["sms"] }))).toEqual(
      labels(campaign({ sourceType: "new", channels: ["sms"] })),
    );
  });

  it("streaming → two combined stages", () => {
    const c = campaign({ sourceType: "stream", channels: ["sms"] });
    expect(labels(c)).toEqual([
      "Подключение к провайдерам",
      "Обработка и коммуникация",
    ]);
  });
});

describe("campaignProgressStages — current index derivation", () => {
  it("scoring phase (non-stream) → current is «Обработка базы»", () => {
    const c = campaign({ sourceType: "new", channels: ["sms"], phase: "scoring" });
    const { stages, currentIndex } = campaignProgressStages(c);
    expect(stages[currentIndex].label).toBe("Обработка базы");
    // earlier stages are done
    expect(stageStatus(campaignProgressStages(c), 0)).toBe("done");
    expect(stageStatus(campaignProgressStages(c), 1)).toBe("done");
  });

  it("communicating phase WITH comm → current is «Коммуникация по сигналам»", () => {
    const c = campaign({ sourceType: "new", channels: ["sms"], phase: "communicating" });
    const p = campaignProgressStages(c);
    expect(p.stages[p.currentIndex].label).toBe("Коммуникация по сигналам");
  });

  it("communicating phase WITHOUT comm → current is «Кампания завершена»", () => {
    const c = campaign({ sourceType: "new", channels: [], phase: "communicating" });
    const p = campaignProgressStages(c);
    expect(p.stages[p.currentIndex].label).toBe("Кампания завершена");
  });

  it("streaming, before communicating → current is «Подключение к провайдерам»", () => {
    const c = campaign({ sourceType: "stream", phase: "scoring" });
    const p = campaignProgressStages(c);
    expect(p.stages[p.currentIndex].label).toBe("Подключение к провайдерам");
  });

  it("streaming, communicating → current is «Обработка и коммуникация»", () => {
    const c = campaign({ sourceType: "stream", phase: "communicating" });
    const p = campaignProgressStages(c);
    expect(p.stages[p.currentIndex].label).toBe("Обработка и коммуникация");
  });

  it("completed status → every stage is done (current index past the end)", () => {
    const c = campaign({ sourceType: "new", channels: ["sms"], status: "completed" });
    const p = campaignProgressStages(c);
    expect(p.currentIndex).toBe(p.stages.length);
    for (let i = 0; i < p.stages.length; i++) {
      expect(stageStatus(p, i)).toBe("done");
    }
  });
});

describe("currentStageLabel — collapsed-row summary", () => {
  it("returns the current stage label while running", () => {
    const c = campaign({ sourceType: "new", channels: ["sms"], phase: "communicating" });
    expect(currentStageLabel(campaignProgressStages(c))).toBe("Коммуникация по сигналам");
  });
  it("returns «Кампания завершена» once everything is done", () => {
    const c = campaign({ sourceType: "stream", status: "completed" });
    expect(currentStageLabel(campaignProgressStages(c))).toBe("Кампания завершена");
  });
});

describe("providerSignalsPerDay / connectedSignalsPerDay — deterministic estimates", () => {
  it("is positive and deterministic per (campaign, provider)", () => {
    const a = providerSignalsPerDay("cmp_1", "beeline");
    expect(a).toBeGreaterThan(0);
    expect(providerSignalsPerDay("cmp_1", "beeline")).toBe(a);
  });

  it("differs across providers / campaigns", () => {
    expect(providerSignalsPerDay("cmp_1", "beeline")).not.toBe(
      providerSignalsPerDay("cmp_1", "megafon"),
    );
    expect(providerSignalsPerDay("cmp_1", "beeline")).not.toBe(
      providerSignalsPerDay("cmp_2", "beeline"),
    );
  });

  it("connectedSignalsPerDay sums the estimates of the connected providers", () => {
    const ids = PROVIDERS.slice(0, 2).map((p) => p.id);
    const expected =
      providerSignalsPerDay("cmp_1", ids[0]) + providerSignalsPerDay("cmp_1", ids[1]);
    expect(connectedSignalsPerDay("cmp_1", ids)).toBe(expected);
    expect(connectedSignalsPerDay("cmp_1", [])).toBe(0);
  });
});

describe("CampaignProgress — providers persist after the connection stage (#8)", () => {
  it("keeps provider names visible under the completed process stage", () => {
    // Streaming + completed ⇒ the «Обработка и коммуникация» (process) stage is
    // `done`; providers must remain visible (in the settled/collapsed form),
    // not vanish along with the live connection list.
    const c = campaign({ sourceType: "stream", status: "completed" });
    render(<CampaignProgress campaign={c} defaultExpanded />);
    for (const p of PROVIDERS) {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    }
  });
});

describe("CampaignProgress — time-driven current stage (fresh launch)", () => {
  const LAUNCH = "2026-06-01T00:00:00.000Z";
  const fresh = () =>
    campaign({
      id: "cmp_fresh",
      sourceType: "new",
      channels: ["sms"],
      phase: "scoring",
      status: "active",
      launchedAt: LAUNCH,
    });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("~4с после запуска → текущий «Отправка провайдерам», live-провайдеры ещё не показаны", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:04.000Z"));
    render(<CampaignProgress campaign={fresh()} defaultExpanded />);
    // «Отправка провайдерам» — текущий (в summary + в степпере).
    expect(screen.getAllByText("Отправка провайдерам").length).toBeGreaterThan(0);
    // «Обработка базы» ещё pending → live ProviderList не отрендерен.
    expect(screen.queryByText("Билайн")).not.toBeInTheDocument();
  });

  it("~20с после запуска → текущий «Обработка базы», live-провайдеры («Билайн») показаны", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z"));
    render(<CampaignProgress campaign={fresh()} defaultExpanded />);
    // «Обработка базы» — текущий этап (в summary + в степпере).
    expect(screen.getAllByText("Обработка базы").length).toBeGreaterThan(0);
    // Текущий process-этап → live ProviderList виден.
    expect(screen.getByText("Билайн")).toBeInTheDocument();
  });
});

describe("campaignStageAt — time-derived stage index", () => {
  const nonStream = campaignStageList({
    sourceType: "new", channels: ["sms"], phase: "scoring", status: "active",
  });

  it("walks send→verify→process→communicate by elapsed (non-stream)", () => {
    expect(campaignStageAt(nonStream, 0)).toBe(0); // Отправка
    expect(campaignStageAt(nonStream, 7999)).toBe(0);
    expect(campaignStageAt(nonStream, 8000)).toBe(1); // Проверка
    expect(campaignStageAt(nonStream, 15999)).toBe(1);
    expect(campaignStageAt(nonStream, 16000)).toBe(2); // Обработка базы
    expect(campaignStageAt(nonStream, 45999)).toBe(2);
    expect(campaignStageAt(nonStream, 46000)).toBe(3); // Коммуникация (терминальный ongoing)
    expect(campaignStageAt(nonStream, 999999)).toBe(3); // не доходит до «завершена»
  });

  it("completed (Infinity) → all stages done", () => {
    expect(campaignStageAt(nonStream, Infinity)).toBe(nonStream.length);
  });

  it("stream: connect→process(terminal) by elapsed", () => {
    const stream = campaignStageList({
      sourceType: "stream", channels: [], phase: "scoring", status: "active",
    });
    expect(campaignStageAt(stream, 0)).toBe(0); // Подключение
    expect(campaignStageAt(stream, 7999)).toBe(0);
    expect(campaignStageAt(stream, 8000)).toBe(1); // Обработка и коммуникация (terminal)
    expect(campaignStageAt(stream, 999999)).toBe(1);
  });
});

describe("communicatingThresholdMs", () => {
  it("non-stream = 46000, stream = 8000", () => {
    const nonStream = campaignStageList({ sourceType: "new", channels: ["sms"], phase: "scoring", status: "active" });
    const stream = campaignStageList({ sourceType: "stream", channels: [], phase: "scoring", status: "active" });
    expect(communicatingThresholdMs(nonStream)).toBe(46000);
    expect(communicatingThresholdMs(stream)).toBe(8000);
  });
});

describe("stageBoundariesMs", () => {
  it("non-stream boundaries = [8000, 16000, 46000]", () => {
    const nonStream = campaignStageList({ sourceType: "new", channels: ["sms"], phase: "scoring", status: "active" });
    expect(stageBoundariesMs(nonStream)).toEqual([8000, 16000, 46000]);
  });
});
