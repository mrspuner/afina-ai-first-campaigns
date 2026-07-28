import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignStepper } from "./campaign-stepper";
import type { WizardStepId } from "./wizard-steps";

const STEPS: WizardStepId[] = [
  "scenario",
  "intent",
  "interests",
  "channels",
  "budget",
];

/** Кружок шага — общий предок подписи-кнопки и его круга (см. разметку
 *  CampaignStepper: оба — дети одного `<div className="flex items-center …">`). */
function circleFor(label: string): HTMLElement {
  const labelButton = screen.getByRole("button", { name: label });
  const row = labelButton.closest("div.flex.items-center") as HTMLElement;
  const circle = row.querySelector('[class*="rounded-full"]') as HTMLElement;
  if (!circle) throw new Error(`circle not found for ${label}`);
  return circle;
}

function isCheckmark(circle: HTMLElement): boolean {
  return circle.querySelector("svg") !== null;
}

describe("CampaignStepper — обычный визард (без изолированной сессии), регресс", () => {
  it("пройденные шаги — галочка, текущий не в счёт, будущие — номер", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={3}
        maxStep={3}
        onStepClick={vi.fn()}
      />,
    );
    expect(isCheckmark(circleFor("Сценарий"))).toBe(true);
    expect(isCheckmark(circleFor("Цель"))).toBe(true);
    expect(isCheckmark(circleFor("Интересы"))).toBe(false); // активный — не галочка
    expect(isCheckmark(circleFor("Каналы"))).toBe(false); // ещё не дошли
    expect(isCheckmark(circleFor("Бюджет"))).toBe(false);
  });
});

describe("CampaignStepper — изолированная сессия правки (Item 2, финальная полировка)", () => {
  // Сценарий из брифа: правка «Каналов» обнулила «Бюджет» (попал в колонку,
  // ещё не пройден) — «Каналы» активен, «Бюджет» должен нести НОМЕР, а не
  // галочку; все остальные шаги (вне колонки — их значение не меняется)
  // должны нести галочку.
  const visitedSteps = new Set([4, 5]); // «Каналы»(4) и «Бюджет»(5) — колонка правки
  const completedSteps = new Set([1, 2, 3]); // всё вне колонки — не изменилось

  it("шаг ВНЕ колонки правки (значение не меняется) — галочка, даже НЕ будучи «visited»", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={4}
        maxStep={5}
        onStepClick={vi.fn()}
        visitedSteps={visitedSteps}
        completedSteps={completedSteps}
      />,
    );
    expect(isCheckmark(circleFor("Сценарий"))).toBe(true);
    expect(isCheckmark(circleFor("Цель"))).toBe(true);
    expect(isCheckmark(circleFor("Интересы"))).toBe(true);
  });

  it("шаг В колонке правки, ещё не пройденный (инвалидирован, не открыт) — номер, не галочка", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={4}
        maxStep={5}
        onStepClick={vi.fn()}
        visitedSteps={visitedSteps}
        completedSteps={completedSteps}
      />,
    );
    expect(isCheckmark(circleFor("Бюджет"))).toBe(false);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("активный шаг сохраняет прежнее оформление (жёлтый), а не галочку/номер-пенднинг", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={4}
        maxStep={5}
        onStepClick={vi.fn()}
        visitedSteps={visitedSteps}
        completedSteps={completedSteps}
      />,
    );
    const circle = circleFor("Каналы");
    expect(isCheckmark(circle)).toBe(false);
    expect(circle.className).toContain("border-brand");
  });

  it("шаг в колонке правки, уже пройденный в этой сессии (индекс раньше активного) — галочка", () => {
    // Пользователь продвинулся дальше «Каналов» — активный теперь «Бюджет»,
    // «Каналы» (editing.step) уже пройден и признаётся завершённым.
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={5}
        maxStep={5}
        onStepClick={vi.fn()}
        visitedSteps={visitedSteps}
        completedSteps={new Set([1, 2, 3, 4])}
      />,
    );
    expect(isCheckmark(circleFor("Каналы"))).toBe(true);
  });

  it("без completedSteps (обычный визард) поведение не меняется: галочка = visited && !active", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={3}
        maxStep={3}
        onStepClick={vi.fn()}
      />,
    );
    expect(isCheckmark(circleFor("Сценарий"))).toBe(true);
    expect(isCheckmark(circleFor("Интересы"))).toBe(false);
  });

  it("шаг вне колонки (не visited → не кликабелен), но с галочкой — кнопка задизейблена", () => {
    render(
      <CampaignStepper
        steps={STEPS}
        currentStep={4}
        maxStep={5}
        onStepClick={vi.fn()}
        visitedSteps={visitedSteps}
        completedSteps={completedSteps}
      />,
    );
    expect(screen.getByRole("button", { name: "Сценарий" })).toBeDisabled();
  });
});
