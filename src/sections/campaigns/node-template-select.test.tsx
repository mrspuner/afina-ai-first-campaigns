import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeTemplateSelect } from "./node-template-select";
import type { MessageTemplate } from "@/state/app-state";

// next/image → plain <img> so the mascot icon mounts under jsdom.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

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

  it("«Создать новый шаблон» показывает маскот Афина ИИ, а не плюс", () => {
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
    const row = screen.getByText("Создать новый шаблон").closest("[cmdk-item]");
    expect(row?.querySelector("img")).toBeTruthy();
    expect(row?.querySelector("img")).toHaveAttribute("src", "/mascot-icon.svg");
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
});
