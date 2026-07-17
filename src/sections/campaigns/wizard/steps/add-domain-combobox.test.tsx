// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AddDomainCombobox } from "./add-domain-combobox";

afterEach(cleanup);

// base-ui's Popover positions itself via floating-ui, which touches
// ResizeObserver on mount — absent in jsdom. Same shim used by other
// popover/tooltip tests in this codebase (node-field-combobox.test.tsx,
// interests-triggers-editor.test.tsx); without it the popup never mounts.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??=
    () => {};
});

function openCombobox() {
  fireEvent.click(
    screen.getByRole("button", { name: /Добавить свой домен/ })
  );
}

describe("AddDomainCombobox", () => {
  it("renders the same dashed trigger button as before", () => {
    render(
      <AddDomainCombobox
        alreadyAdded={[]}
        registeredDomains={[]}
        onSelectRegistered={vi.fn()}
        onSubmitTyped={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Добавить свой домен/ })
    ).toBeInTheDocument();
  });

  it("lists previously-registered own-domains as selectable options", async () => {
    const onSelectRegistered = vi.fn();
    render(
      <AddDomainCombobox
        alreadyAdded={[]}
        registeredDomains={["already-registered.ru"]}
        onSelectRegistered={onSelectRegistered}
        onSubmitTyped={vi.fn()}
      />
    );
    openCombobox();
    const option = await screen.findByText("already-registered.ru");
    fireEvent.click(option);
    expect(onSelectRegistered).toHaveBeenCalledWith("already-registered.ru");
  });

  it("excludes domains already in the trigger's delta.added from the options list", async () => {
    render(
      <AddDomainCombobox
        alreadyAdded={["already-added.ru"]}
        registeredDomains={["already-added.ru", "still-available.ru"]}
        onSelectRegistered={vi.fn()}
        onSubmitTyped={vi.fn()}
      />
    );
    openCombobox();
    expect(await screen.findByText("still-available.ru")).toBeInTheDocument();
    expect(screen.queryByText("already-added.ru")).toBeNull();
  });

  it("offers a free-typed custom entry and submits it raw (caller normalizes)", async () => {
    const onSubmitTyped = vi.fn();
    render(
      <AddDomainCombobox
        alreadyAdded={[]}
        registeredDomains={[]}
        onSelectRegistered={vi.fn()}
        onSubmitTyped={onSubmitTyped}
      />
    );
    openCombobox();
    const input = await screen.findByPlaceholderText("Домен (example.ru)");
    fireEvent.change(input, { target: { value: "New-Domain.ru" } });
    const custom = await screen.findByText("Добавить «New-Domain.ru»");
    fireEvent.click(custom);
    expect(onSubmitTyped).toHaveBeenCalledWith("New-Domain.ru");
  });

  it("does not offer a custom entry that duplicates an already-added domain", async () => {
    render(
      <AddDomainCombobox
        alreadyAdded={["dup.ru"]}
        registeredDomains={[]}
        onSelectRegistered={vi.fn()}
        onSubmitTyped={vi.fn()}
      />
    );
    openCombobox();
    const input = await screen.findByPlaceholderText("Домен (example.ru)");
    fireEvent.change(input, { target: { value: "dup.ru" } });
    expect(screen.queryByText("Добавить «dup.ru»")).toBeNull();
  });
});
