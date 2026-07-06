import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntroOverlay } from "./intro-overlay";

describe("IntroOverlay — no skip button", () => {
  it("does not render a «Пропустить» button on the first step", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Пропустить" }),
    ).not.toBeInTheDocument();
  });

  it("still renders the first-step advance button «Далее»", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Далее" }),
    ).toBeInTheDocument();
  });

  it("shows the first step title with canonical «афина ИИ» naming", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(screen.getByText("Знакомьтесь — афина ИИ")).toBeInTheDocument();
  });
});

describe("IntroOverlay — back button", () => {
  it("does not render «Назад» on the first step", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Назад" }),
    ).not.toBeInTheDocument();
  });

  it("shows «Назад» after advancing, and returns to the first step on click", async () => {
    render(<IntroOverlay onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    // AnimatePresence mode="wait" defers the next step until the exit completes.
    const back = await screen.findByRole("button", { name: "Назад" });
    expect(back).toBeInTheDocument();

    fireEvent.click(back);
    expect(
      await screen.findByText("Знакомьтесь — афина ИИ"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Назад" }),
    ).not.toBeInTheDocument();
  });
});
