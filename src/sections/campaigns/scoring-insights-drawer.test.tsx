import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScoringInsightsDrawer } from "./scoring-insights-drawer";

const OPTIONS = [
  { label: "Ипотека", triggerLabels: ["Заявка на ипотеку", "Кредитный калькулятор"] },
  { label: "Авто", triggerLabels: ["Тест-драйв"] },
];

describe("ScoringInsightsDrawer", () => {
  it("lists interests and triggers when open", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={["Ипотека", "Авто"]}
        triggers={["Посещение сайтов застройщиков"]}
      />
    );
    expect(screen.getByText("Интересы и триггеры")).toBeInTheDocument();
    expect(screen.getByText("Ипотека")).toBeInTheDocument();
    expect(screen.getByText("Авто")).toBeInTheDocument();
    expect(
      screen.getByText("Посещение сайтов застройщиков")
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no interests or triggers", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={[]}
        triggers={[]}
      />
    );
    expect(
      screen.getByText(/пока не заданы интересы и триггеры/i)
    ).toBeInTheDocument();
  });

  it("renders no content when closed", () => {
    render(
      <ScoringInsightsDrawer
        open={false}
        onOpenChange={() => {}}
        interests={["Ипотека"]}
        triggers={[]}
      />
    );
    expect(screen.queryByText("Ипотека")).not.toBeInTheDocument();
  });

  // 2c — read-only (launched / no editor) keeps interests as plain chips, not
  // toggles.
  it("read-only mode renders no interest toggle buttons", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={["Ипотека"]}
        triggers={["Заявка на ипотеку"]}
        interestOptions={OPTIONS}
        onChange={() => {}}
      />
    );
    // `editable` is omitted → read-only: the interest is text, not a button.
    expect(
      screen.queryByRole("button", { name: "Ипотека" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ипотека")).toBeInTheDocument();
  });

  it("editable without onChange falls back to read-only", () => {
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={["Ипотека"]}
        triggers={[]}
        editable
        interestOptions={OPTIONS}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Ипотека" })
    ).not.toBeInTheDocument();
  });
});

describe("ScoringInsightsDrawer — editable (2c, draft)", () => {
  function setup(over?: {
    interests?: string[];
    triggers?: string[];
    onChange?: (n: { interests: string[]; triggers: string[] }) => void;
  }) {
    const onChange = over?.onChange ?? vi.fn();
    render(
      <ScoringInsightsDrawer
        open
        onOpenChange={() => {}}
        interests={over?.interests ?? ["Ипотека"]}
        triggers={over?.triggers ?? ["Заявка на ипотеку"]}
        editable
        interestOptions={OPTIONS}
        onChange={onChange}
      />
    );
    return onChange;
  }

  it("renders interest/trigger chips as toggles reflecting selection", () => {
    setup();
    expect(screen.getByRole("button", { name: "Ипотека" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Авто" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    // A trigger from the selected interest is offered, unselected.
    expect(
      screen.getByRole("button", { name: "Кредитный калькулятор" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("adding an interest persists it (onChange with it appended)", () => {
    const onChange = setup({ interests: ["Ипотека"], triggers: [] });
    fireEvent.click(screen.getByRole("button", { name: "Авто" }));
    expect(onChange).toHaveBeenCalledWith({
      interests: ["Ипотека", "Авто"],
      triggers: [],
    });
  });

  it("removing a selected interest persists the removal", () => {
    const onChange = setup({ interests: ["Ипотека", "Авто"], triggers: [] });
    fireEvent.click(screen.getByRole("button", { name: "Ипотека" }));
    expect(onChange).toHaveBeenCalledWith({
      interests: ["Авто"],
      triggers: [],
    });
  });

  it("only offers triggers from currently-selected interests", () => {
    setup({ interests: ["Ипотека"], triggers: [] });
    // Авто is not selected → its trigger «Тест-драйв» is not offered.
    expect(
      screen.queryByRole("button", { name: "Тест-драйв" })
    ).not.toBeInTheDocument();
  });

  it("toggling a trigger persists it", () => {
    const onChange = setup({ interests: ["Ипотека"], triggers: [] });
    fireEvent.click(screen.getByRole("button", { name: "Кредитный калькулятор" }));
    expect(onChange).toHaveBeenCalledWith({
      interests: ["Ипотека"],
      triggers: ["Кредитный калькулятор"],
    });
  });

  it("keeps an already-selected trigger visible/removable even if its interest is deselected", () => {
    // «Тест-драйв» belongs to Авто, which is NOT selected, but it is already a
    // chosen trigger → it stays as a pressed toggle so the user can remove it.
    const onChange = setup({ interests: ["Ипотека"], triggers: ["Тест-драйв"] });
    const chip = screen.getByRole("button", { name: "Тест-драйв" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({
      interests: ["Ипотека"],
      triggers: [],
    });
  });
});
