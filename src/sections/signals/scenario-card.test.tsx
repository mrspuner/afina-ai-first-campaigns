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

describe("ScenarioCard — source label badge", () => {
  it("renders the source label inside the card (just the label, no «Источник:» prefix)", () => {
    render(
      <ScenarioCard
        scenario={SCENARIO}
        onClick={() => {}}
        sourceLabel="Новая база номеров"
      />
    );
    // Badge lives inside the card's clickable button, not as a sibling under it.
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    const badge = screen.getByText("Новая база номеров");
    expect(card).toContainElement(badge);
    // No "Источник:" prefix anymore — just the bare label.
    expect(screen.queryByText(/Источник:/i)).toBeNull();
  });

  it("renders no source badge when sourceLabel is omitted", () => {
    render(<ScenarioCard scenario={SCENARIO} onClick={() => {}} />);
    expect(screen.queryByText("Новая база номеров")).toBeNull();
  });

  it("clicking the card still selects even with a source badge present", () => {
    const onClick = vi.fn();
    render(
      <ScenarioCard
        scenario={SCENARIO}
        onClick={onClick}
        sourceLabel="Новая база номеров"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Тест-сценарий/i }));
    expect(onClick).toHaveBeenCalledWith("test-scenario");
  });
});

describe("ScenarioCard — curated label badge", () => {
  it("renders the curated label badge inside the card when curatedLabel is set", () => {
    render(
      <ScenarioCard
        scenario={SCENARIO}
        onClick={() => {}}
        curatedLabel="Подобрано для вас"
      />
    );
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    const badge = screen.getByText("Подобрано для вас");
    expect(card).toContainElement(badge);
  });

  it("renders both sourceLabel and curatedLabel badges when both props are set", () => {
    render(
      <ScenarioCard
        scenario={SCENARIO}
        onClick={() => {}}
        sourceLabel="Новая база номеров"
        curatedLabel="Подобрано для вас"
      />
    );
    const card = screen.getByRole("button", { name: /Тест-сценарий/i });
    const sourceBadge = screen.getByText("Новая база номеров");
    const curatedBadge = screen.getByText("Подобрано для вас");
    expect(card).toContainElement(sourceBadge);
    expect(card).toContainElement(curatedBadge);
  });

  it("renders no curated badge when curatedLabel is omitted", () => {
    render(<ScenarioCard scenario={SCENARIO} onClick={() => {}} />);
    expect(screen.queryByText("Подобрано для вас")).toBeNull();
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
