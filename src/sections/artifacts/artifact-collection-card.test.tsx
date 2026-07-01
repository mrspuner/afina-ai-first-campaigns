import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArtifactCollectionCard } from "./artifact-collection-card";
import type { Artifact } from "@/state/app-state";

const cumulative: Artifact = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" };

describe("ArtifactCollectionCard", () => {
  afterEach(cleanup);
  function renderCard() {
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    render(<ArtifactCollectionCard campaignName="ЖК Заря" cumulative={cumulative} dailyCount={14} onOpen={onOpen} onDownload={onDownload} />);
    return { onOpen, onDownload };
  }
  it("shows «Поток · <кампания>», file count and total signals", () => {
    renderCard();
    expect(screen.getByText(/Поток · ЖК Заря/)).toBeVisible();
    expect(screen.getByText(/15 файлов/)).toBeVisible();  // 14 dailies + 1 cumulative
    expect(screen.getByText(/12\s?480/)).toBeVisible();
  });
  it("«Скачать общий» triggers onDownload with the cumulative id; card click opens", () => {
    const { onOpen, onDownload } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Скачать общий/i }));
    expect(onDownload).toHaveBeenCalledWith("str-c");
    fireEvent.click(screen.getByRole("button", { name: /Поток · ЖК Заря/ }));
    expect(onOpen).toHaveBeenCalledWith("str-c");
  });
});
