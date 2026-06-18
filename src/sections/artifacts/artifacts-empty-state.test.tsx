import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArtifactsEmptyState } from "./artifacts-empty-state";

describe("ArtifactsEmptyState", () => {
  it("explains artifacts appear from launched campaigns and has no create/upload", () => {
    render(<ArtifactsEmptyState />);
    expect(screen.getByText(/Запустите кампанию/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Загрузить/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Создать сигнал/i }),
    ).not.toBeInTheDocument();
  });
});
