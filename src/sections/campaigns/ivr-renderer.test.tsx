import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IvrRenderer } from "./ivr-renderer";
import type { IvrParams } from "@/types/workflow";

function params(overrides: Partial<IvrParams> = {}): IvrParams {
  return {
    kind: "ivr",
    scenario: "Здравствуйте! Это звонок от Афины.",
    voiceType: "female",
    ...overrides,
  };
}

describe("IvrRenderer", () => {
  it("renders the full scenario text — a long multi-paragraph script is not truncated", () => {
    const long = [
      "Здравствуйте! Меня зовут Анна, я звоню из компании «Афина».",
      "",
      "Вы недавно интересовались ипотечными программами на нашем сайте.",
      "У нас появилось персональное предложение со ставкой от 5,9%.",
      "",
      "Если вам удобно, я расскажу подробности прямо сейчас — это займёт пару минут.",
    ].join("\n");
    render(<IvrRenderer params={params({ scenario: long })} />);
    // The whole script is one wrapped/pre-wrapped block — both the opening line
    // and the distinctive tail line are present (nothing clipped in between).
    const block = screen.getByText(/Меня зовут Анна/);
    expect(block).toHaveTextContent("это займёт пару минут");
    // Content-preserving: line breaks are kept via whitespace-pre-wrap.
    expect(block).toHaveClass("whitespace-pre-wrap");
  });

  it("shows the human voice-type meta label", () => {
    render(<IvrRenderer params={params({ voiceType: "male" })} />);
    expect(screen.getByText(/Мужской/)).toBeInTheDocument();
  });

  it("maps the neutral voice type to «Нейтральный»", () => {
    render(<IvrRenderer params={params({ voiceType: "neutral" })} />);
    expect(screen.getByText(/Нейтральный/)).toBeInTheDocument();
  });

  it("renders variables in the script literally (no substitution)", () => {
    render(<IvrRenderer params={params({ scenario: "Здравствуйте, {Имя}!" })} />);
    expect(screen.getByText(/Здравствуйте, \{Имя\}!/)).toBeInTheDocument();
  });

  it("falls back to the «Текст скрипта» placeholder when scenario is empty", () => {
    render(<IvrRenderer params={params({ scenario: "   " })} />);
    expect(screen.getByText("Текст скрипта")).toBeInTheDocument();
  });
});
