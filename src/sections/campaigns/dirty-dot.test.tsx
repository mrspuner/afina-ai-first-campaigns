// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DirtyDot } from "./dirty-dot";

describe("DirtyDot", () => {
  it("renders the yellow marker with the RU title", () => {
    const { getByTitle } = render(<DirtyDot />);
    const dot = getByTitle("Параметр изменён");
    expect(dot).toHaveClass("bg-[#FFEC00]", "rounded-full", "shrink-0");
  });
});
