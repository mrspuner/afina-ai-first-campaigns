import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CampaignCard } from "./campaign-card";
import type { Campaign } from "@/state/app-state";

const base: Campaign = {
  id: "c1",
  name: "Кампания",
  status: "draft",
  createdAt: "2026-06-01T00:00:00.000Z",
  sourceType: "stream",
  channels: ["sms"],
  scenario: { id: "base-registration", name: "Регистрация" },
};

describe("CampaignCard — чип каденса", () => {
  afterEach(cleanup);

  it("stream → «Потоковая», без чипа источника", () => {
    render(<CampaignCard campaign={base} onOpen={vi.fn()} />);
    expect(screen.getByText("Потоковая")).toBeInTheDocument();
    expect(screen.queryByText("Поток")).not.toBeInTheDocument();
    expect(screen.queryByText("Новая база номеров")).not.toBeInTheDocument();
  });

  it("new → «Разовая»", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: "new" }} onOpen={vi.fn()} />);
    expect(screen.getByText("Разовая")).toBeInTheDocument();
  });

  it("own → «Разовая»", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: "own" }} onOpen={vi.fn()} />);
    expect(screen.getByText("Разовая")).toBeInTheDocument();
  });

  it("без sourceType → чипа каденса нет", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: undefined }} onOpen={vi.fn()} />);
    expect(screen.queryByText("Разовая")).not.toBeInTheDocument();
    expect(screen.queryByText("Потоковая")).not.toBeInTheDocument();
  });
});
