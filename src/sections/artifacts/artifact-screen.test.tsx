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
  it("shows count and kind label", () => {
    renderScreen();
    expect(screen.getByText(/54\s?321/)).toBeInTheDocument();
    expect(screen.getAllByText(/Сигналы и конверсии/).length).toBeGreaterThan(0);
  });

  it("секция «Об артефакте» удалена", () => {
    renderScreen({ campaign, campaignName: campaign.name });
    expect(screen.queryByText("Об артефакте")).not.toBeInTheDocument();
    expect(screen.queryByText("Тип файла")).not.toBeInTheDocument();
  });

  it("разовый артефакт → статус «Артефакт собран»", () => {
    renderScreen();
    expect(screen.getByText(/Артефакт собран/)).toBeInTheDocument();
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

  it("ссылка на кампанию — в секции «Настройки кампании-источника»", () => {
    const onOpenCampaign = vi.fn();
    renderScreen({ campaign, campaignName: campaign.name, onOpenCampaign });
    expect(screen.getByText(/Настройки кампании-источника/)).toBeInTheDocument();
    const link = screen.getByRole("button", { name: /Лето 2026/ });
    link.click();
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
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

  const cumulative = {
    id: "cum", campaignId: "str", kind: "signals_conversions", count: 9999,
    createdAt: "2026-06-30T09:00:00.000Z", variant: "cumulative",
  } as Artifact;

  function daily(i: number): Artifact {
    return {
      id: `d${i}`, campaignId: "str", kind: "signals_conversions", count: 100 + i,
      createdAt: `2026-06-${10 + i}T09:00:00.000Z`, variant: "daily", periodDate: `2026-06-${10 + i}`,
    } as Artifact;
  }

  it("активная потоковая коллекция → статус «собирается, обновляется каждый день в 00:00»", () => {
    render(
      <ArtifactScreenView
        artifact={cumulative} dailies={[]} campaign={{ id: "str", name: "Поток", status: "active", createdAt: "x" } as Campaign} campaignName="Поток"
        onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Артефакт собирается, обновляется каждый день в 00:00/)).toBeInTheDocument();
    expect(screen.queryByText(/Артефакт собран/)).not.toBeInTheDocument();
  });

  it("завершённая коллекция → «Артефакт собран»", () => {
    render(
      <ArtifactScreenView
        artifact={cumulative} dailies={[]} campaign={{ id: "str", name: "Поток", status: "completed", createdAt: "x" } as Campaign} campaignName="Поток"
        onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Артефакт собран/)).toBeInTheDocument();
  });

  it("выжимок >5 → показаны 5 и кнопка «Показать все (7)», клик разворачивает", () => {
    const dailies = Array.from({ length: 7 }, (_, i) => daily(i));
    render(
      <ArtifactScreenView
        artifact={cumulative} dailies={dailies} campaign={{ id: "str", name: "Поток", status: "active", createdAt: "x" } as Campaign} campaignName="Поток"
        onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Показать все (7)" }));
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
  });

  it("выжимок ≤5 → кнопки «Показать все» нет", () => {
    const dailies = Array.from({ length: 4 }, (_, i) => daily(i));
    render(
      <ArtifactScreenView
        artifact={cumulative} dailies={dailies} campaign={{ id: "str", name: "Поток", status: "active", createdAt: "x" } as Campaign} campaignName="Поток"
        onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Показать все/ })).not.toBeInTheDocument();
  });
});

describe("ArtifactScreenView — back label", () => {
  it("defaults the back button to «К артефактам»", () => {
    renderScreen();
    expect(
      screen.getByRole("button", { name: "К артефактам" }),
    ).toBeInTheDocument();
  });

  it("renders a supplied backLabel («К кампании»)", () => {
    renderScreen({ backLabel: "К кампании" });
    expect(
      screen.getByRole("button", { name: "К кампании" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "К артефактам" }),
    ).not.toBeInTheDocument();
  });
});
