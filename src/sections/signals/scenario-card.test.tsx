import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioCard } from "./scenario-card";
import type { Scenario } from "@/data/scenarios";

const SCENARIO: Scenario = {
  id: "test-scenario",
  name: "Тест-сценарий",
  description: "Описание для теста.",
  category: "Привлечение",
  signalType: "Регистрация",
  isBase: true,
  isCurated: false,
  recommendedSourceType: "new",
};

describe("ScenarioCard — card-level click", () => {
  it("clicking the card surface calls onClick with scenario id", () => {
    const onClick = vi.fn();
    render(<ScenarioCard scenario={SCENARIO} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /Тест-сценарий/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("test-scenario");
  });
});

describe("ScenarioCard — keyboard support", () => {
  it("Enter on card triggers onClick", () => {
    const onClick = vi.fn();
    render(<ScenarioCard scenario={SCENARIO} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledWith("test-scenario");
  });

  it("Space on card triggers onClick", () => {
    const onClick = vi.fn();
    render(<ScenarioCard scenario={SCENARIO} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledWith("test-scenario");
  });

  it("other keys do not trigger onClick", () => {
    const onClick = vi.fn();
    render(<ScenarioCard scenario={SCENARIO} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    fireEvent.keyDown(card, { key: "Tab" });
    fireEvent.keyDown(card, { key: "a" });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ScenarioCard — aria-pressed", () => {
  it("sets aria-pressed=true when selected", () => {
    render(<ScenarioCard scenario={SCENARIO} onClick={() => {}} selected />);
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("sets aria-pressed=false when not selected", () => {
    render(<ScenarioCard scenario={SCENARIO} onClick={() => {}} />);
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    expect(card.getAttribute("aria-pressed")).toBe("false");
  });
});
