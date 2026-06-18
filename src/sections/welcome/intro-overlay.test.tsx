import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("keeps the first step title unchanged", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(screen.getByText("Знакомьтесь — ИИ афина")).toBeInTheDocument();
  });
});
