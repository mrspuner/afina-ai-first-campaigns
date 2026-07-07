// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppStateProvider } from "@/state/app-state-context";
import type { Survey } from "@/types/survey";
import { OnboardingReviewScreen } from "./onboarding-review-screen";

afterEach(cleanup);

const survey: Survey = {
  companyName: "",
  companyWebsite: "mytest.ru",
  taskDescription: "привлечь ипотечников",
  directionId: null,
};

function renderScreen(onContinue = vi.fn(), onBack = vi.fn()) {
  render(
    <AppStateProvider>
      <OnboardingReviewScreen
        survey={survey}
        onContinue={onContinue}
        onBack={onBack}
      />
    </AppStateProvider>,
  );
  return { onContinue, onBack };
}

describe("OnboardingReviewScreen", () => {
  it("inherits the site typed on the previous step (#3)", () => {
    renderScreen();
    expect(screen.getByText("mytest.ru")).toBeInTheDocument();
  });

  it("does not render the removed subtitle (#4)", () => {
    renderScreen();
    expect(screen.queryByText(/Афина изучила/)).not.toBeInTheDocument();
  });

  it("renders labelled fields (#5/#7/#8)", () => {
    renderScreen();
    expect(screen.getByText("Название компании")).toBeInTheDocument();
    expect(screen.getByText("Описание бизнеса")).toBeInTheDocument();
    expect(screen.getByText("Тон бренда")).toBeInTheDocument();
  });

  it("calls onContinue on the primary button and onBack on «Назад» (#1/#2)", () => {
    const { onContinue, onBack } = renderScreen();
    fireEvent.click(
      screen.getByRole("button", { name: "Всё верно, продолжить" }),
    );
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
  });
});
