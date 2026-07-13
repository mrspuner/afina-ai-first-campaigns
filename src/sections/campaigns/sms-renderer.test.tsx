import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SmsRenderer } from "./sms-renderer";
import type { SmsParams } from "@/types/workflow";

function params(overrides: Partial<SmsParams> = {}): SmsParams {
  return {
    kind: "sms",
    text: "Ваше предложение ждёт. Подробности на сайте.",
    alphaName: "AFINA",
    scheduledAt: "immediate",
    ...overrides,
  };
}

describe("SmsRenderer", () => {
  it("renders the message text in a received bubble", () => {
    render(<SmsRenderer params={params()} />);
    expect(
      screen.getByText("Ваше предложение ждёт. Подробности на сайте."),
    ).toBeInTheDocument();
  });

  it("shows the alpha-name (sender) label", () => {
    render(<SmsRenderer params={params({ alphaName: "MYBANK" })} />);
    expect(screen.getByText("MYBANK")).toBeInTheDocument();
  });

  it("renders variables in the text literally (no substitution)", () => {
    render(<SmsRenderer params={params({ text: "Здравствуйте, {Имя}!" })} />);
    expect(screen.getByText("Здравствуйте, {Имя}!")).toBeInTheDocument();
  });

  it("shows the link when present", () => {
    render(
      <SmsRenderer params={params({ link: "https://afina.ai/offer" })} />,
    );
    expect(screen.getByText("https://afina.ai/offer")).toBeInTheDocument();
  });

  it("falls back to a placeholder when the text is empty", () => {
    render(<SmsRenderer params={params({ text: "" })} />);
    expect(screen.getByText("Текст сообщения")).toBeInTheDocument();
  });

  it("readOnly по умолчанию — клик по тексту НЕ открывает инпут", () => {
    render(<SmsRenderer params={params()} />);
    fireEvent.click(screen.getByText("Ваше предложение ждёт. Подробности на сайте."));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("editable: клик по тексту → правка → onChange с патчем text (#3)", () => {
    const onChange = vi.fn();
    render(<SmsRenderer params={params()} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByText("Ваше предложение ждёт. Подробности на сайте."));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Новый текст" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ text: "Новый текст" });
  });
});
