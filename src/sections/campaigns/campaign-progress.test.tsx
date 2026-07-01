import { describe, it, expect } from "vitest";
import {
  campaignProgressStages,
  currentStageLabel,
  stageStatus,
  providerSignalsPerDay,
  connectedSignalsPerDay,
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
