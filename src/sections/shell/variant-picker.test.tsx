import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantPicker } from "./variant-picker";
import type { TemplateQuestion } from "@/state/chat-context";

const closedQuestion: TemplateQuestion = {
  prompt: "Выберите канал",
  allowFreeInput: false,
  options: [
    { id: "sms", label: "SMS" },
    { id: "email", label: "Email" },
    { id: "push", label: "Push" },
  ],
};

const openQuestion: TemplateQuestion = {
  prompt: "Выберите вариант",
  allowFreeInput: true,
  options: [
    { id: "v1", label: "Вариант 1", components: ["тема", "текст", "отправитель"] },
    { id: "v2", label: "Вариант 2", components: ["тема", "текст"] },
  ],
};

const base = { onSelect: () => {}, onClose: () => {}, onSkip: () => {} };

describe("VariantPicker", () => {
  it("renders the question text as panel header", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.getByText("Выберите канал")).toBeInTheDocument();
  });

  it("renders numbered options 1,2,3", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("НЕ показывает подстроку состава под опцией (#10)", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(screen.queryByText(/тема · текст · отправитель/)).not.toBeInTheDocument();
  });

  it("calls onSelect with option id on click", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Email"));
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("Enter selects the active (first) option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("variant-picker"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("sms");
  });

  it("ArrowDown then Enter selects the second option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    const root = screen.getByTestId("variant-picker");
    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("number key selects the matching option", () => {
    const onSelect = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("variant-picker"), { key: "2" });
    expect(onSelect).toHaveBeenCalledWith("email");
  });

  it("HIDES «Другой вариант»/«Пропустить» for a closed question", () => {
    render(<VariantPicker question={closedQuestion} {...base} />);
    expect(screen.queryByText("Другой вариант")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Пропустить" })).not.toBeInTheDocument();
  });

  it("SHOWS «Другой вариант»/«Пропустить» for an open question", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(screen.getByText("Другой вариант")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пропустить" })).toBeInTheDocument();
  });

  it("НЕ показывает подсказку навигации (#9)", () => {
    render(<VariantPicker question={openQuestion} {...base} />);
    expect(
      screen.queryByText(/↑↓ — навигация · Enter — выбрать · или впишите ниже/)
    ).not.toBeInTheDocument();
  });

  it("calls onClose when ✕ pressed", () => {
    const onClose = vi.fn();
    render(<VariantPicker question={closedQuestion} {...base} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "закрыть" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSkip when «Пропустить» pressed (open only)", () => {
    const onSkip = vi.fn();
    render(<VariantPicker question={openQuestion} {...base} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Пропустить" }));
    expect(onSkip).toHaveBeenCalled();
  });
});
