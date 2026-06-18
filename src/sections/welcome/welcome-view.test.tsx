import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FirstTimeHero } from "./welcome-view";

const HERO_PARAGRAPH =
  "В афине вы создаёте кампанию по готовому сценарию: афина находит, кому нужна коммуникация прямо сейчас, запускает сообщения в нужный момент и показывает результат в статистике.";

describe("FirstTimeHero — copy", () => {
  it("renders the campaign-first hero paragraph", () => {
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(screen.getByText(HERO_PARAGRAPH)).toBeInTheDocument();
  });

  it("before survey: shows the survey CTA wording", () => {
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(
      screen.getByText("Расскажите о вашей задаче — подберём сценарии"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подобрать сценарии" }),
    ).toBeInTheDocument();
  });

  it("after survey: shows the create-campaign CTA wording", () => {
    render(
      <FirstTimeHero
        surveyCompleted
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(
      screen.getByText(
        "Создайте кампанию по одному из них или выберите свой сценарий из каталога.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Создать кампанию" }),
    ).toBeInTheDocument();
  });
});

describe("FirstTimeHero — wiring", () => {
  it("post-survey button calls onCreateScenario", () => {
    const onCreateScenario = vi.fn();
    render(
      <FirstTimeHero
        surveyCompleted
        onOpenSurvey={() => {}}
        onCreateScenario={onCreateScenario}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Создать кампанию" }));
    expect(onCreateScenario).toHaveBeenCalledTimes(1);
  });

  it("pre-survey button calls onOpenSurvey", () => {
    const onOpenSurvey = vi.fn();
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={onOpenSurvey}
        onCreateScenario={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Подобрать сценарии" }));
    expect(onOpenSurvey).toHaveBeenCalledTimes(1);
  });
});
