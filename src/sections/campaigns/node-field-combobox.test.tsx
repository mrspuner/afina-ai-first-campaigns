// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/state/field-directory", () => ({
  getFieldOptions: () => ["Открыто", "Кликнуто"],
  addFieldValue: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

import { NodeFieldCombobox } from "./node-field-combobox";

describe("NodeFieldCombobox — chevron affordance (spec B #4)", () => {
  it("renders a chevron, not a pencil", () => {
    const { container } = render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={vi.fn()}
        onAiHandoff={vi.fn()}
      />
    );
    expect(container.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
