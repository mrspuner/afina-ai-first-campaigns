import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtifactCard } from "./artifact-card";
import type { Artifact } from "@/state/app-state";

const artifact: Artifact = {
  id: "art_1",
  campaignId: "cmp_1",
  kind: "signals_conversions",
  count: 12345,
  createdAt: "2026-06-18T00:00:00.000Z",
};

describe("ArtifactCard", () => {
  it("shows kind label, count and campaign name, and links to the campaign", () => {
    const onOpenCampaign = vi.fn();
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="Лето 2026"
        onOpenCampaign={onOpenCampaign}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByText("Сигналы и конверсии")).toBeInTheDocument();
    expect(screen.getByText(/12\s?345/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Лето 2026/ }));
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
  });

  it("fires onDownload with the artifact id", () => {
    const onDownload = vi.fn();
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="X"
        onOpenCampaign={vi.fn()}
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Скачать/i }));
    expect(onDownload).toHaveBeenCalledWith("art_1");
  });

  it("does not render a segments breakdown", () => {
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="X"
        onOpenCampaign={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Макс/)).not.toBeInTheDocument();
  });
});
