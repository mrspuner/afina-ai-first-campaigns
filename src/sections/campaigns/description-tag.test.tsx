import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DescriptionTagPill } from "./description-tag";
import type { DescriptionTag } from "@/state/graph-description";

afterEach(cleanup);

const stepTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "wizard-step", step: "file" },
};

const valueTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "none" },
};

describe("DescriptionTagPill", () => {
  it("тег с целью — кнопка, клик поднимает наверх", () => {
    const onActivate = vi.fn();
    render(<DescriptionTagPill tag={stepTag} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: /база на 12 000 строк/ }));
    expect(onActivate).toHaveBeenCalledWith(stepTag);
  });

  it("тег без цели — не кнопка, но значение показывает", () => {
    render(<DescriptionTagPill tag={valueTag} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/база на 12 000 строк/)).toBeInTheDocument();
  });

  it("схлопка перечисления несёт остаток в title для наведения", () => {
    render(
      <DescriptionTagPill
        tag={{ ...stepTag, label: "ещё 2 триггерам", hoverList: ["Вторичка", "Аренда"] }}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("title", "Вторичка, Аренда");
  });
});
