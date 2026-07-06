// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DirectoryChipsField } from "./directory-chips-field";

afterEach(cleanup);

const dir = [
  { id: "msk", label: "Москва" },
  { id: "spb", label: "Санкт-Петербург" },
];

describe("DirectoryChipsField", () => {
  it("renders current items as chips and an add trigger", () => {
    render(
      <DirectoryChipsField
        items={[{ id: "msk", label: "Москва" }]}
        directory={dir}
        onAdd={() => {}}
        onRemove={() => {}}
        addLabel="Добавить регион"
        removeLabel={(i) => `Убрать ${i.label}`}
      />,
    );
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Добавить регион" }),
    ).toBeInTheDocument();
  });

  it("calls onRemove with the item id when the chip remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <DirectoryChipsField
        items={[{ id: "msk", label: "Москва" }]}
        directory={dir}
        onAdd={() => {}}
        onRemove={onRemove}
        addLabel="Добавить регион"
        removeLabel={(i) => `Убрать ${i.label}`}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Убрать Москва" }));
    expect(onRemove).toHaveBeenCalledWith("msk");
  });
});
