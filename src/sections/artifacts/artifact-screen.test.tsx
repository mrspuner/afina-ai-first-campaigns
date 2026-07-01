import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtifactScreenView } from "./artifact-screen";
import type { Artifact, Campaign } from "@/state/app-state";

const artifact: Artifact = {
  id: "art_1",
  campaignId: "cmp_1",
  kind: "signals_conversions",
  count: 54321,
  createdAt: "2026-06-18T00:00:00.000Z",
};

const campaign: Campaign = {
  id: "cmp_1",
  name: "Лето 2026",
  status: "active",
  createdAt: "2026-06-01T00:00:00.000Z",
  scenario: { id: "sc_1", name: "Ипотека" },
  sourceType: "new",
  interests: ["Недвижимость", "Ипотека"],
  channels: ["sms", "email"],
  budget: 150000,
};

function renderScreen(overrides?: Partial<Parameters<typeof ArtifactScreenView>[0]>) {
  return render(
    <ArtifactScreenView
      artifact={artifact}
      campaign={undefined}
      campaignName="Лето 2026"
      onBack={vi.fn()}
      onOpenCampaign={vi.fn()}
      onDownload={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ArtifactScreenView", () => {
  it("shows count, kind label and a CSV file-type indicator", () => {
    renderScreen();
    expect(screen.getByText(/54\s?321/)).toBeInTheDocument();
    expect(screen.getAllByText(/Сигналы и конверсии/).length).toBeGreaterThan(0);
    expect(screen.getByText(/CSV/)).toBeInTheDocument();
  });

  it("links to the campaign", () => {
    const onOpenCampaign = vi.fn();
    renderScreen({ onOpenCampaign });
    const link = screen.getByRole("button", { name: /Лето 2026/ });
    link.click();
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
  });

  it("has no segments row and no launch-campaign action", () => {
    renderScreen();
    expect(screen.queryByText(/Сегменты/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Запустить кампанию|Использовать в кампании/,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows campaign settings table when campaign is passed", () => {
    renderScreen({ campaign, campaignName: campaign.name });
    expect(screen.getByText(/Настройки кампании-источника/)).toBeInTheDocument();
    expect(screen.getByText("Ипотека")).toBeInTheDocument();
    expect(screen.getByText("Новая база номеров")).toBeInTheDocument();
    expect(screen.getByText(/Недвижимость.*Ипотека/)).toBeInTheDocument();
    expect(screen.getByText(/SMS.*Email/i)).toBeInTheDocument();
    expect(screen.getByText(/150\s?000/)).toBeInTheDocument();
  });

  it("does not show campaign settings section when campaign is undefined", () => {
    renderScreen({ campaign: undefined });
    expect(screen.queryByText(/Настройки кампании-источника/)).not.toBeInTheDocument();
  });

  it("cumulative artifact → collection detail: total, «Дневные выжимки» list, «Скачать общий»", () => {
    const cumulative = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" } as const;
    const dailies = [
      { id: "d2", campaignId: "str", kind: "signals", count: 2140, createdAt: "2026-06-30", variant: "daily", periodDate: "2026-06-30" },
      { id: "d1", campaignId: "str", kind: "signals", count: 1980, createdAt: "2026-06-29", variant: "daily", periodDate: "2026-06-29" },
    ] as const;
    const onDownloadDaily = vi.fn();
    render(
      <ArtifactScreenView
        artifact={cumulative} dailies={[...dailies]} campaign={undefined} campaignName="ЖК Заря"
        onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDownloadDaily={onDownloadDaily} onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Дневные выжимки/)).toBeVisible();
    expect(screen.getByText(/Выжимка · 30\.06/)).toBeVisible();
    expect(screen.getByText(/12\s?480/)).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: /Скачать выжимку/i })[0]);
    expect(onDownloadDaily).toHaveBeenCalledWith("d2");
  });
});
