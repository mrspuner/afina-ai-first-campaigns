import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArtifactScreenView } from "./artifact-screen";
import type { Artifact } from "@/state/app-state";

const artifact: Artifact = {
  id: "art_1",
  campaignId: "cmp_1",
  kind: "signals_conversions",
  count: 54321,
  createdAt: "2026-06-18T00:00:00.000Z",
};

function renderScreen(overrides?: Partial<Parameters<typeof ArtifactScreenView>[0]>) {
  return render(
    <ArtifactScreenView
      artifact={artifact}
      campaignName="Лето 2026"
      onBack={vi.fn()}
      onOpenCampaign={vi.fn()}
      onDownload={vi.fn()}
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
});
