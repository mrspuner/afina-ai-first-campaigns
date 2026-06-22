import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateDrawerView } from "./template-drawer";
import type { TemplateDrawerVariant } from "@/state/chat-context";

// TemplateDrawerView is a purely presentational component — no context needed.

const noop = () => {};

const defaultProps = {
  open: false,
  step: "channel" as const,
  channel: null,
  intent: "",
  variants: [] as TemplateDrawerVariant[],
  selectedId: null,
  generating: false,
  onClose: noop,
  onSelectChannel: noop,
  onIntentChange: noop,
  onGenerate: noop,
  onSelectVariant: noop,
  onSave: noop,
};

describe("TemplateDrawerView — closed state", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<TemplateDrawerView {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("TemplateDrawerView — channel step", () => {
  const channelProps = { ...defaultProps, open: true, step: "channel" as const };

  it("renders all 4 channel chips (SMS, Email, Push, Звонок)", () => {
    render(<TemplateDrawerView {...channelProps} />);
    expect(screen.getByRole("button", { name: /SMS/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Push/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Звонок/i })).toBeInTheDocument();
  });

  it("calls onSelectChannel with 'sms' when SMS chip is clicked", () => {
    const onSelectChannel = vi.fn();
    render(<TemplateDrawerView {...channelProps} onSelectChannel={onSelectChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /SMS/i }));
    expect(onSelectChannel).toHaveBeenCalledWith("sms");
  });

  it("calls onSelectChannel with 'email' when Email chip is clicked", () => {
    const onSelectChannel = vi.fn();
    render(<TemplateDrawerView {...channelProps} onSelectChannel={onSelectChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /Email/i }));
    expect(onSelectChannel).toHaveBeenCalledWith("email");
  });

  it("calls onSelectChannel with 'push' when Push chip is clicked", () => {
    const onSelectChannel = vi.fn();
    render(<TemplateDrawerView {...channelProps} onSelectChannel={onSelectChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /Push/i }));
    expect(onSelectChannel).toHaveBeenCalledWith("push");
  });

  it("calls onSelectChannel with 'ivr' when Звонок chip is clicked", () => {
    const onSelectChannel = vi.fn();
    render(<TemplateDrawerView {...channelProps} onSelectChannel={onSelectChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /Звонок/i }));
    expect(onSelectChannel).toHaveBeenCalledWith("ivr");
  });

  it("calls onClose when the close button is pressed", () => {
    const onClose = vi.fn();
    render(<TemplateDrawerView {...channelProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /закрыть|close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TemplateDrawerView — intent step", () => {
  const intentProps = {
    ...defaultProps,
    open: true,
    step: "intent" as const,
    channel: "sms" as const,
  };

  it("shows intent textarea", () => {
    render(<TemplateDrawerView {...intentProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onIntentChange when text is typed", () => {
    const onIntentChange = vi.fn();
    render(<TemplateDrawerView {...intentProps} onIntentChange={onIntentChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Акция" } });
    expect(onIntentChange).toHaveBeenCalledWith("Акция");
  });

  it("calls onGenerate when generate button clicked", () => {
    const onGenerate = vi.fn();
    render(<TemplateDrawerView {...intentProps} intent="Приветствие" onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole("button", { name: /генер|сгенер/i }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("shows mascot/loading indicator while generating", () => {
    render(<TemplateDrawerView {...intentProps} generating={true} />);
    // The drawer should show a loading/mascot element
    expect(screen.getByTestId("template-drawer-generating")).toBeInTheDocument();
  });
});

describe("TemplateDrawerView — variants step", () => {
  const variants: TemplateDrawerVariant[] = [
    { id: "v1", name: "Вариант 1", content: { kind: "sms", text: "SMS 1", alphaName: "A", scheduledAt: "immediate" } },
    { id: "v2", name: "Вариант 2", content: { kind: "sms", text: "SMS 2", alphaName: "A", scheduledAt: "immediate" } },
    { id: "v3", name: "Вариант 3", content: { kind: "sms", text: "SMS 3", alphaName: "A", scheduledAt: "immediate" } },
  ];
  const variantsProps = {
    ...defaultProps,
    open: true,
    step: "variants" as const,
    channel: "sms" as const,
    variants,
    selectedId: null,
  };

  it("renders all 3 variant cards", () => {
    render(<TemplateDrawerView {...variantsProps} />);
    expect(screen.getByText("Вариант 1")).toBeInTheDocument();
    expect(screen.getByText("Вариант 2")).toBeInTheDocument();
    expect(screen.getByText("Вариант 3")).toBeInTheDocument();
  });

  it("calls onSelectVariant when a variant is clicked", () => {
    const onSelectVariant = vi.fn();
    render(<TemplateDrawerView {...variantsProps} onSelectVariant={onSelectVariant} />);
    fireEvent.click(screen.getByText("Вариант 1"));
    expect(onSelectVariant).toHaveBeenCalledWith("v1");
  });

  it("calls onSave with selectedId when save button clicked", () => {
    const onSave = vi.fn();
    render(
      <TemplateDrawerView
        {...variantsProps}
        selectedId="v2"
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /сохранить|добавить/i }));
    expect(onSave).toHaveBeenCalled();
  });
});
