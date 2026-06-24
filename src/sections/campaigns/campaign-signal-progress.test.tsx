import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  CampaignSignalProgress,
  processedFraction,
  streamSignalCount,
} from "./campaign-signal-progress";
import type { Campaign } from "@/state/app-state";

const base = {
  id: "cmp_1",
  name: "C",
  status: "draft",
  createdAt: "",
} as unknown as Campaign;

describe("processedFraction", () => {
  it("derives a stable processed % from campaign id + phase", () => {
    const f = processedFraction("cmp_1", "scoring");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
  it("is deterministic for the same inputs", () => {
    expect(processedFraction("cmp_1", "scoring")).toBe(
      processedFraction("cmp_1", "scoring")
    );
  });
  it("communicating phase is fully processed", () => {
    expect(processedFraction("cmp_1", "communicating")).toBe(1);
  });
});

describe("streamSignalCount", () => {
  it("is deterministic and within a plausible range", () => {
    const n = streamSignalCount("cmp_1");
    expect(n).toBe(streamSignalCount("cmp_1"));
    expect(n).toBeGreaterThanOrEqual(1_200);
    expect(n).toBeLessThanOrEqual(48_000);
  });
});

describe("CampaignSignalProgress — open campaign, no stages (group C #9)", () => {
  afterEach(cleanup);

  it("stream → «файл сигнала пишется в реальном времени» + signal stat", () => {
    render(<CampaignSignalProgress campaign={{ ...base, sourceType: "stream" }} />);
    expect(
      screen.getByText("Файл сигнала пишется в реальном времени")
    ).toBeTruthy();
    expect(screen.getByText(/сигналов · обновляется/)).toBeTruthy();
  });

  it("new → non-staged «Идёт сбор аудитории», no numbered stage checklist", () => {
    render(<CampaignSignalProgress campaign={{ ...base, sourceType: "new" }} />);
    expect(screen.getByText("Идёт сбор аудитории")).toBeTruthy();
    // The removed staged checklist labels must be gone.
    expect(screen.queryByText("Отправлено провайдерам")).toBeNull();
    expect(screen.queryByText("Сигналы готовы")).toBeNull();
    // It is NOT the stream realtime variant.
    expect(screen.queryByText("Файл сигнала пишется в реальном времени")).toBeNull();
  });
});
