import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
