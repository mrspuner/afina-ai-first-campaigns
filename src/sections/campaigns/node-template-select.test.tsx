import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NodeTemplateSelect } from "./node-template-select";
import type { MessageTemplate } from "@/state/app-state";

// cmdk (Command primitives) needs ResizeObserver + scrollIntoView — jsdom lacks both.
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

const TPLS: MessageTemplate[] = [
  {
    id: "t1",
    channel: "sms",
    name: "SMS — напоминание",
    content: { kind: "sms", text: "x", alphaName: "A", scheduledAt: "immediate" },
    usedInCampaigns: 0,
  },
  {
    id: "t2",
    channel: "sms",
    name: "SMS — акция",
    content: { kind: "sms", text: "y", alphaName: "A", scheduledAt: "immediate" },
    usedInCampaigns: 0,
  },
];

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Шаблон/i }));
}

describe("NodeTemplateSelect", () => {
  it("lists template names for the channel", () => {
    render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    open();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("SMS — акция")).toBeInTheDocument();
  });

  it("selecting a template fires onSelect with that template", () => {
    const onSelect = vi.fn();
    render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={onSelect}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    open();
    fireEvent.click(screen.getByText("SMS — акция"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
  });

  it("preview button fires onPreview(id) without selecting", () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={onSelect}
        onPreview={onPreview}
        onCreate={vi.fn()}
      />
    );
    open();
    fireEvent.click(screen.getAllByRole("button", { name: "Предпросмотр" })[0]);
    expect(onPreview).toHaveBeenCalledWith("t1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("«Создать новый шаблон» fires onCreate", () => {
    const onCreate = vi.fn();
    render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={onCreate}
      />
    );
    open();
    fireEvent.click(screen.getByText("Создать новый шаблон"));
    expect(onCreate).toHaveBeenCalled();
  });

  it("empty channel shows the russian empty state", () => {
    render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={[]}
        selectedName=""
        isDirty={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    open();
    expect(screen.getByText("Нет шаблонов для этого канала")).toBeInTheDocument();
  });

  it("uses a chevron affordance, not a pencil (spec B #4)", () => {
    const { container } = render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    expect(container.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });

  it("dirty dot sits next to the label (spec B #5)", () => {
    const { getByText } = render(
      <NodeTemplateSelect
        label="Шаблон"
        templates={TPLS}
        selectedName=""
        isDirty
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    const labelCell = getByText("Шаблон");
    expect(within(labelCell).getByTitle("Параметр изменён")).not.toBeNull();
  });
});
