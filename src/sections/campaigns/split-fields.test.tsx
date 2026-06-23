// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SplitFields } from "./split-fields";
import type { SplitParams } from "@/types/workflow";

vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/state/split-segments", () => ({
  splitSegmentBranches: () => [],
}));

const params: SplitParams = { kind: "split", by: "equal", branches: 2 };

describe("SplitFields — карандаш в SelectRow", () => {
  it("рендерит иконку-карандаш в редактируемом поле «По»", () => {
    const { container } = render(
      <SplitFields
        nodeId="n1"
        params={params}
        readOnly={false}
        onAiHandoff={vi.fn()}
      />,
    );
    // lucide Pencil → <svg class="lucide lucide-pencil ...">
    expect(container.querySelector("svg.lucide-pencil")).not.toBeNull();
  });

  it("НЕ рендерит карандаш в readonly-режиме", () => {
    const { container } = render(
      <SplitFields
        nodeId="n1"
        params={params}
        readOnly
        onAiHandoff={vi.fn()}
      />,
    );
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
