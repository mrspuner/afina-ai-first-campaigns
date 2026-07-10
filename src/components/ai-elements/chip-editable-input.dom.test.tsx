// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createChipElement, updateChipLabel } from "./chip-editable-input";
import type { PromptChip } from "@/state/prompt-chips-context";

// createChipElement calls getNodeIconSvg (renderToStaticMarkup) — mock it away.
vi.mock("@/sections/campaigns/node-visuals", () => ({ getNodeIconSvg: () => null }));

const chip = (over: Partial<PromptChip> = {}): PromptChip => ({
  id: "nodefield_n1_Текст",
  kind: "node",
  label: "Текст",
  payload: { color: "#5eead4", nodeType: "sms" },
  removable: true,
  ...over,
});

describe("createChipElement — × for removable chips (spec B #2)", () => {
  it("removable chip renders an × that calls onRemoveChip(id)", () => {
    const onRemove = vi.fn();
    const el = createChipElement(chip(), onRemove);
    const x = el.querySelector<HTMLButtonElement>('button[aria-label^="Убрать тег"]');
    expect(x).not.toBeNull();
    x!.click();
    expect(onRemove).toHaveBeenCalledWith("nodefield_n1_Текст");
  });

  it("non-removable chip renders no ×", () => {
    const el = createChipElement(chip({ removable: false }), vi.fn());
    expect(el.querySelector('button[aria-label^="Убрать тег"]')).toBeNull();
  });

  it("still renders the chip label", () => {
    const el = createChipElement(chip(), vi.fn());
    expect(el.textContent).toContain("Текст");
  });
});

/**
 * Регрессия: у removable-чипа последний ребёнок — кнопка ×, а не текстовый узел.
 * Старый sync-эффект брал el.lastChild и, не найдя текст, ДОПИСЫВАЛ второй label
 * после крестика → «Текст × Текст».
 */
describe("updateChipLabel — не дублирует название тега", () => {
  const labelCount = (el: HTMLElement, s: string) =>
    (el.textContent ?? "").split(s).length - 1;

  it("повторная синхронизация с тем же label не дублирует его", () => {
    const el = createChipElement(chip(), vi.fn());
    updateChipLabel(el, chip());
    updateChipLabel(el, chip());
    expect(labelCount(el, "Текст")).toBe(1);
  });

  it("смена label обновляет текст на месте, крестик остаётся последним", () => {
    const el = createChipElement(chip(), vi.fn());
    updateChipLabel(el, chip({ label: "Время" }));
    expect(labelCount(el, "Время")).toBe(1);
    expect(labelCount(el, "Текст")).toBe(0);
    const x = el.querySelector('button[aria-label^="Убрать тег"]');
    expect(x).not.toBeNull();
    expect(el.lastElementChild).toBe(x);
    // aria-label крестика тоже следует за новым названием.
    expect(x!.getAttribute("aria-label")).toBe("Убрать тег: Время");
  });

  it("работает и для не-removable чипа (текст — последний узел)", () => {
    const el = createChipElement(chip({ removable: false }), vi.fn());
    updateChipLabel(el, chip({ removable: false, label: "Время" }));
    expect(labelCount(el, "Время")).toBe(1);
    expect(labelCount(el, "Текст")).toBe(0);
  });
});
