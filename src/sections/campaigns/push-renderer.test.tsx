import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PushRenderer } from "./push-renderer";
import type { PushParams } from "@/types/workflow";

function params(overrides: Partial<PushParams> = {}): PushParams {
  return {
    kind: "push",
    title: "Давно вас не видели",
    body: "Загляните — у нас есть кое-что для вас.",
    ...overrides,
  };
}

describe("PushRenderer", () => {
  it("renders the notification title", () => {
    render(<PushRenderer params={params()} />);
    expect(screen.getByText("Давно вас не видели")).toBeInTheDocument();
  });

  it("renders the notification body", () => {
    render(<PushRenderer params={params()} />);
    expect(
      screen.getByText("Загляните — у нас есть кое-что для вас."),
    ).toBeInTheDocument();
  });

  it("renders variables in the body literally (no substitution)", () => {
    render(<PushRenderer params={params({ body: "Привет, {Имя}!" })} />);
    expect(screen.getByText("Привет, {Имя}!")).toBeInTheDocument();
  });

  it("falls back to placeholders when title and body are empty", () => {
    render(<PushRenderer params={params({ title: "", body: "" })} />);
    expect(screen.getByText("Заголовок")).toBeInTheDocument();
    expect(screen.getByText("Текст уведомления")).toBeInTheDocument();
  });
});
