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
        onOpen={vi.fn()}
        onOpenCampaign={onOpenCampaign}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Сигналы и конверсии")).toBeInTheDocument();
    // Count renders inline next to the kind label.
    expect(screen.getByText(/12\s?345/)).toBeInTheDocument();
    // date renders under the title
    expect(screen.getByText(/18\.06\.2026/)).toBeInTheDocument();
    // The campaign link is a <button> inside the card; use getAllByRole and find the one
    // that is NOT the card itself (card is role=button but contains "Лето 2026" in its subtree).
    const campaignBtn = screen
      .getAllByRole("button", { name: /Лето 2026/ })
      .find((el) => el.tagName === "BUTTON");
    expect(campaignBtn).toBeInTheDocument();
    fireEvent.click(campaignBtn!);
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
  });

  it("fires onDownload with the artifact id", () => {
    const onDownload = vi.fn();
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="X"
        onOpen={vi.fn()}
        onOpenCampaign={vi.fn()}
        onDownload={onDownload}
        onDelete={vi.fn()}
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
        onOpen={vi.fn()}
        onOpenCampaign={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Макс/)).not.toBeInTheDocument();
  });

  it("fires onOpen when the card body is clicked", () => {
    const onOpen = vi.fn();
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="X"
        onOpen={onOpen}
        onOpenCampaign={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Сигналы и конверсии"));
    expect(onOpen).toHaveBeenCalledWith("art_1");
  });
});
