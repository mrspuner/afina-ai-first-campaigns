// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SplitFields } from "./split-fields";
import type { SplitParams } from "@/types/workflow";

vi.mock("@/state/split-segments", () => ({
  splitSegmentBranches: () => [],
}));
// next/image не нужен в этих проверках — иконка-маскот только визуал.
vi.mock("next/image", () => ({ default: () => null }));

const params: SplitParams = { kind: "split", by: "equal", branches: 2 };

describe("SplitFields — ИИ-редактирование (отмена A6, спека #1)", () => {
  it("обе строки «По» и «Ветки» — кнопки с ИИ-аффордансом; клик зовёт onAiHandoff с полем", () => {
    const onAiHandoff = vi.fn();
    const { getByLabelText } = render(
      <SplitFields params={params} readOnly={false} onAiHandoff={onAiHandoff} />,
    );
    getByLabelText("Настроить «По» с помощью ИИ").click();
    expect(onAiHandoff).toHaveBeenCalledWith("По");
    getByLabelText("Настроить «Ветки» с помощью ИИ").click();
    expect(onAiHandoff).toHaveBeenCalledWith("Ветки");
  });

  it("НЕ рендерит кнопки-аффордансы в readonly-режиме (только показ)", () => {
    const { queryByLabelText } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />,
    );
    expect(queryByLabelText("Настроить «По» с помощью ИИ")).toBeNull();
    expect(queryByLabelText("Настроить «Ветки» с помощью ИИ")).toBeNull();
  });

  it("показывает число веток при by=equal и авто-текст «По категориям сигнала» при by=segment", () => {
    const { getByText, rerender } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />,
    );
    getByText("2");
    rerender(
      <SplitFields
        params={{ kind: "split", by: "segment", branches: 0 }}
        readOnly
        onAiHandoff={vi.fn()}
      />,
    );
    getByText(/По категориям сигнала/);
  });
});
