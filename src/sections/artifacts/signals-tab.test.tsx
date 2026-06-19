import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SignalsTabView } from "./signals-tab";
import type { Artifact, Campaign } from "@/state/app-state";

const campaigns: Campaign[] = [
  {
    id: "cmp_1",
    name: "Лето 2026",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "cmp_2",
    name: "Осень 2026",
    status: "active",
    createdAt: "2026-06-10T00:00:00.000Z",
  },
];

const artifacts: Artifact[] = [
  {
    id: "art_1",
    campaignId: "cmp_1",
    kind: "signals",
    count: 100,
    createdAt: "2026-06-05T00:00:00.000Z",
  },
  {
    id: "art_2",
    campaignId: "cmp_2",
    kind: "signals_conversions",
    count: 200,
    createdAt: "2026-06-12T00:00:00.000Z",
  },
];

describe("SignalsTabView", () => {
  it("renders the empty state when there are no artifacts", () => {
    render(
      <SignalsTabView
        artifacts={[]}
        campaigns={campaigns}
        onOpen={vi.fn()}
        onOpenCampaign={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Пока нет артефактов/i)).toBeInTheDocument();
  });

  it("renders one card per artifact with resolved campaign names", () => {
    render(
      <SignalsTabView
        artifacts={artifacts}
        campaigns={campaigns}
        onOpen={vi.fn()}
        onOpenCampaign={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Сигналы и конверсии")).toBeInTheDocument();
  });

  it("calls onOpenCampaign with the campaign id when the campaign link button is clicked", () => {
    const onOpenCampaign = vi.fn();
    render(
      <SignalsTabView
        artifacts={artifacts}
        campaigns={campaigns}
        onOpen={vi.fn()}
        onOpenCampaign={onOpenCampaign}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // The campaign link is a native <button> whose accessible name includes the campaign name.
    // Disambiguate from the card (role="button" div) by selecting only native <button> elements.
    const campaignBtn = screen
      .getAllByRole("button", { name: /Лето 2026/ })
      .find((el) => el.tagName === "BUTTON");
    expect(campaignBtn).toBeTruthy();
    fireEvent.click(campaignBtn!);
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
  });
});
