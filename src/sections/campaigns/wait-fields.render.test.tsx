// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/state/app-state-context", () => ({ useAppDispatch: () => vi.fn() }));

// next/image + cmdk (NodeFieldCombobox внутри WaitFields «До события») —
// тот же шим, что description-tag.test.tsx/node-field-combobox.test.tsx.
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
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

import { WaitFields } from "./wait-fields";

describe("WaitFields — chevron affordance (spec B #4)", () => {
  it("mode + duration rows both show a chevron, no pencil", () => {
    const { container } = render(
      <WaitFields
        nodeId="n1"
        params={{ kind: "wait", mode: "duration", durationHours: 24 }}
        readOnly={false}
        onEventAiHandoff={vi.fn()}
      />
    );
    expect(container.querySelectorAll("svg.lucide-chevron-down")).toHaveLength(2);
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});

describe("WaitFields — «Сформировать с помощью ИИ» у поля «Событие» (fix round 1, Finding 2)", () => {
  it("с onEventAiHandoff (граф-канвасная нода) — пункт ИИ-хэндоффа есть", () => {
    render(
      <WaitFields
        nodeId="n1"
        params={{ kind: "wait", mode: "until_event", untilEvent: "" }}
        readOnly={false}
        onEventAiHandoff={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    expect(screen.getByText("Сформировать с помощью ИИ")).toBeInTheDocument();
  });

  // Поповер паузы на карточке кампании (description-tag.tsx) не передаёт
  // onEventAiHandoff вовсе — там нет сайдбара ИИ-редактирования поля. Пункт
  // обязан не рендериться, а не рендериться кнопкой-пустышкой.
  it("без onEventAiHandoff (поповер паузы на карточке) — пункта ИИ-хэндоффа нет", () => {
    render(
      <WaitFields
        nodeId="n1"
        params={{ kind: "wait", mode: "until_event", untilEvent: "" }}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    expect(screen.queryByText("Сформировать с помощью ИИ")).not.toBeInTheDocument();
  });
});
