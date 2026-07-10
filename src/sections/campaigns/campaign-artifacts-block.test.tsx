import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { artifactKindLabel, CampaignArtifactsBlock } from "./campaign-artifacts-block";
import type { Artifact } from "@/state/app-state";

describe("artifactKindLabel", () => {
  it("maps signals → Сигналы", () => {
    expect(artifactKindLabel("signals")).toBe("Сигналы");
  });
  it("maps signals_conversions → Сигналы и конверсии", () => {
    expect(artifactKindLabel("signals_conversions")).toBe("Сигналы и конверсии");
  });
});

const cumulative: Artifact = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" };
const daily = (id: string, date: string, n: number): Artifact => ({ id, campaignId: "str", kind: "signals", count: n, createdAt: date, variant: "daily", periodDate: date });

describe("CampaignArtifactsBlock — streaming collection", () => {
  afterEach(cleanup);
  it("shows the cumulative («Все сигналы за период») and recent выжимки, opens on click", () => {
    const onOpen = vi.fn();
    render(
      <CampaignArtifactsBlock
        artifacts={[cumulative, daily("d1", "2026-06-30", 2140), daily("d2", "2026-06-29", 1980)]}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/Все сигналы за период/)).toBeVisible();
    expect(screen.getByText(/Выжимка · 30\.06/)).toBeVisible();
    fireEvent.click(screen.getByText(/Все сигналы за период/));
    expect(onOpen).toHaveBeenCalledWith("str-c");
  });

  it("≤5 выжимок → показаны все, без кнопки", () => {
    const dailies = [
      daily("d1", "2026-06-30", 2140),
      daily("d2", "2026-06-29", 1980),
      daily("d3", "2026-06-28", 1820),
      daily("d4", "2026-06-27", 1700),
      daily("d5", "2026-06-26", 1600),
    ];
    render(<CampaignArtifactsBlock artifacts={[cumulative, ...dailies]} onOpen={vi.fn()} />);
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Показать все/ })).not.toBeInTheDocument();
  });

  it(">5 выжимок → показаны 5 и «Показать все (7)»; клик разворачивает в «Свернуть»", () => {
    const dailies = Array.from({ length: 7 }, (_, i) =>
      daily(`d${i}`, `2026-06-${10 + i}`, 100 + i),
    );
    render(<CampaignArtifactsBlock artifacts={[cumulative, ...dailies]} onOpen={vi.fn()} />);
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Показать все (7)" }));
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
  });

  it("one-time campaign with a single artifact still renders «Сигналы · count» row", () => {
    const single: Artifact = { id: "a1", campaignId: "c1", kind: "signals", count: 340, createdAt: "2026-06-30", variant: "single" };
    render(<CampaignArtifactsBlock artifacts={[single]} onOpen={vi.fn()} />);
    expect(screen.getByText("Сигналы")).toBeVisible();
    expect(screen.getByText(/340 контактов/)).toBeVisible();
  });
});
