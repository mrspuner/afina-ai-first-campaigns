// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createChipElement } from "./chip-editable-input";
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
