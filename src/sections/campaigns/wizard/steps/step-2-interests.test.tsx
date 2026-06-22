import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2Interests } from "./step-2-interests";
import { initialStepData } from "@/types/campaign";
import { AppStateProvider } from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { TriggerEditRegistryProvider } from "@/state/trigger-edit-context";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

// StepContent gates its children behind a typewriter animation that only mounts
// them once the title+subtitle finish typing. Stub it so the interests/triggers
// body renders synchronously under test.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// next/image is not needed for the assertions and pulls in extra setup; render a
// plain element so the mascot icons don't break the jsdom mount.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

/**
 * Mount Step2Interests inside the real providers it depends on
 * (app-state for clientDirection, prompt-chips + prompt-input + trigger-edit
 * for the AI prompt-bar bridge). This is the lighter-weight verification the
 * task calls for: a smoke render asserting the full step body — including an
 * interest chip and the triggers section — appears without throwing.
 */
function renderStep() {
  return render(
    <AppStateProvider>
      <PromptInputProvider>
        <PromptChipsProvider>
          <TriggerEditRegistryProvider>
            <Step2Interests
              data={initialStepData}
              onNext={vi.fn()}
              onBack={vi.fn()}
            />
          </TriggerEditRegistryProvider>
        </PromptChipsProvider>
      </PromptInputProvider>
    </AppStateProvider>
  );
}

describe("Step2Interests — full interests+triggers step smoke render", () => {
  afterEach(cleanup);

  it("mounts inside the real providers and shows the interests UI", () => {
    expect(() => renderStep()).not.toThrow();

    // The "Интересы" section header proves the full step (not the light one)
    // rendered. The light StepInterests had no labelled section.
    expect(screen.getByText("Интересы")).toBeInTheDocument();
    // The "Триггеры" section is unique to the full step.
    expect(screen.getByText("Триггеры")).toBeInTheDocument();
  });

  it("renders interest chips for the default (finance) direction", () => {
    renderStep();

    // "Кредитование" is the first interest of the finance vertical, which is
    // the default clientDirection in app-state. Its chip is a toggle button.
    const chip = screen.getByRole("button", { name: "Кредитование" });
    expect(chip).toBeInTheDocument();
  });

  it("renders the «Продолжить» CTA for the full step", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: "Продолжить" })
    ).toBeInTheDocument();
  });
});
