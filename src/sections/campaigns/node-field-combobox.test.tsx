// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

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

  it("dirty dot sits in the label column, not the affordance column (spec B #5)", () => {
    const { getByText, getByTitle } = render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey="eventCatalog"
        isDirty
        onSelect={vi.fn()}
        onAiHandoff={vi.fn()}
      />
    );
    const labelCell = getByText("Событие");
    expect(within(labelCell).getByTitle("Параметр изменён")).not.toBeNull();
    // sanity: the title-carrying dot is the same node the label column holds.
    expect(getByTitle("Параметр изменён")).not.toBeNull();
  });

  it("shows an eye before the chevron only when onPreview is provided; click previews, no popover (spec B #6)", () => {
    const onPreview = vi.fn();
    const onSelect = vi.fn();
    const { getByRole } = render(
      <NodeFieldCombobox
        label="Текст"
        value="Сценарий"
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={onSelect}
        onAiHandoff={vi.fn()}
        onPreview={onPreview}
      />
    );
    fireEvent.click(getByRole("button", { name: "Предпросмотр" }));
    expect(onPreview).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("no eye without onPreview (sms Время / condition / wait etc.)", () => {
    const { queryByRole } = render(
      <NodeFieldCombobox
        label="Время"
        value=""
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={vi.fn()}
        onAiHandoff={vi.fn()}
      />
    );
    expect(queryByRole("button", { name: "Предпросмотр" })).toBeNull();
  });
});

describe("NodeFieldCombobox — «Сформировать с помощью ИИ» только когда есть кому его отдать (fix round 1, Finding 2)", () => {
  it("рендерит пункт ИИ-хэндоффа, когда onAiHandoff передан (граф-канвасная нода)", () => {
    render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={vi.fn()}
        onAiHandoff={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    expect(screen.getByText("Сформировать с помощью ИИ")).toBeInTheDocument();
  });

  // Раньше вызывающий без реального адресата передавал заглушку `() => {}` —
  // пункт рендерился, клик молча ничего не делал. Теперь отсутствие пропа —
  // само по себе сигнал: пункт не рендерится вовсе (карточка кампании, где нет
  // сайдбара ИИ-редактирования поля).
  it("НЕ рендерит пункт ИИ-хэндоффа, когда onAiHandoff не передан (поповер паузы на карточке)", () => {
    render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    expect(screen.queryByText("Сформировать с помощью ИИ")).not.toBeInTheDocument();
  });

  it("клик по пункту ИИ-хэндоффа вызывает onAiHandoff и закрывает поповер", () => {
    const onAiHandoff = vi.fn();
    render(
      <NodeFieldCombobox
        label="Событие"
        value=""
        optionsKey="eventCatalog"
        isDirty={false}
        onSelect={vi.fn()}
        onAiHandoff={onAiHandoff}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    fireEvent.click(screen.getByText("Сформировать с помощью ИИ"));
    expect(onAiHandoff).toHaveBeenCalledTimes(1);
  });
});
