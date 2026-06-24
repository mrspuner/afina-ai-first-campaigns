import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoringInsightsDrawer } from "./scoring-insights-drawer";

describe("ScoringInsightsDrawer", () => {
  it("lists interests and triggers when open", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={["Ипотека", "Авто"]}
        triggers={["Посещение сайтов застройщиков"]}
      />
    );
    expect(screen.getByText("Интересы и триггеры")).toBeInTheDocument();
    expect(screen.getByText("Ипотека")).toBeInTheDocument();
    expect(screen.getByText("Авто")).toBeInTheDocument();
    expect(
      screen.getByText("Посещение сайтов застройщиков")
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no interests or triggers", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={[]}
        triggers={[]}
      />
    );
    expect(
      screen.getByText(/пока не заданы интересы и триггеры/i)
    ).toBeInTheDocument();
  });

  it("renders no content when closed", () => {
    render(
      <ScoringInsightsDrawer
        open={false}
        onOpenChange={() => {}}
        interests={["Ипотека"]}
        triggers={[]}
      />
    );
    expect(screen.queryByText("Ипотека")).not.toBeInTheDocument();
  });
});
