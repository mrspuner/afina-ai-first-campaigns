import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { buildSummaryRows, WizardSummaryTable } from "./wizard-summary-table";
import { initialStepData, type StepData } from "@/types/campaign";

afterEach(cleanup);

const signalsComms: StepData = {
  ...initialStepData,
  scenario: "base-registration",
  intent: "signals-comms",
  analysisMode: "once",
  interests: ["Ипотека", "Новостройки"],
  triggers: ["визит на сайт застройщика"],
  files: [{ name: "клиенты.csv", rowCount: 56_297 }],
  fileRowCount: 56_297,
  channels: ["sms", "email"],
};

describe("buildSummaryRows — состав строк зависит от цели", () => {
  it("«сигналы + коммуникация» несёт все строки потока и НЕ несёт бюджет", () => {
    const labels = buildSummaryRows(signalsComms).map((r) => r.label);
    expect(labels).toEqual([
      "Сценарий",
      "Цель",
      "Интересы и триггеры",
      "Режим",
      "База",
      "Каналы",
    ]);
    // Бюджет живёт прямо под таблицей — дублировать его здесь нечего.
    expect(labels).not.toContain("Бюджет");
  });

  // «Своя база» не проходит шаги интересов и анализа: строки про них были бы
  // не «пустыми», а выдуманными — такого шага в потоке нет вовсе.
  it("«коммуникация по своим сигналам» не выдумывает интересы, триггеры и режим", () => {
    const labels = buildSummaryRows({
      ...signalsComms,
      intent: "comms-own",
      sourceType: "own",
    }).map((r) => r.label);
    expect(labels).toEqual(["Сценарий", "Цель", "База", "Каналы"]);
  });

  it("«только сигналы» не несёт каналов", () => {
    const labels = buildSummaryRows({
      ...signalsComms,
      intent: "signals",
      channels: [],
    }).map((r) => r.label);
    expect(labels).not.toContain("Каналы");
  });
});

describe("buildSummaryRows — значения", () => {
  function valueOf(data: StepData, label: string): string | undefined {
    return buildSummaryRows(data).find((r) => r.label === label)?.value;
  }

  it("разворачивает id сценария в человеческое имя", () => {
    expect(valueOf(signalsComms, "Сценарий")).toBe("Регистрация");
  });

  it("цель читается подписью с шага, а не ключом", () => {
    expect(valueOf(signalsComms, "Цель")).toBe("Сигналы + коммуникация");
  });

  it("интересы и триггеры живут в одной ячейке — обе вели бы на один шаг", () => {
    expect(valueOf(signalsComms, "Интересы и триггеры")).toBe(
      "Ипотека, Новостройки · визит на сайт застройщика",
    );
  });

  it("база показывает число баз и суммарные строки", () => {
    // Разряды разделяет неразрывный пробел (U+00A0) — так их ставит
    // toLocaleString("ru-RU"), и обычный пробел в ожидании не совпал бы.
    expect(valueOf(signalsComms, "База")).toBe("1 база · ~56 297 строк");
  });

  it("каналы читаются подписями, а не ключами", () => {
    expect(valueOf(signalsComms, "Каналы")).toBe("SMS, Email");
  });

  it("режим различает разовый и потоковый", () => {
    expect(valueOf(signalsComms, "Режим")).toBe("Разовый");
    expect(valueOf({ ...signalsComms, analysisMode: "stream" }, "Режим")).toBe(
      "Потоковый",
    );
  });

  it("незаполненное показывается прочерком, а не пустой строкой", () => {
    const empty = { ...signalsComms, interests: [], triggers: [], files: [] };
    expect(valueOf(empty, "Интересы и триггеры")).toBe("—");
    expect(valueOf(empty, "База")).toBe("—");
  });

  it("пустой набор каналов читается как «Без коммуникации», а не прочерком", () => {
    expect(valueOf({ ...signalsComms, channels: [] }, "Каналы")).toBe(
      "Без коммуникации",
    );
  });
});

describe("WizardSummaryTable — возврат на шаг", () => {
  it("клик по строке ведёт на её шаг, а не на фиксированный номер", () => {
    const onGoToStep = vi.fn();
    render(<WizardSummaryTable data={signalsComms} onGoToStep={onGoToStep} />);
    // Порядок шагов для signals-comms: scenario, intent, interests, analysis,
    // file, channels, budget. «Каналы» — шестой, то есть 1-based 6.
    fireEvent.click(screen.getByRole("button", { name: /Каналы/ }));
    expect(onGoToStep).toHaveBeenCalledWith(6);
  });

  // Номера шагов НЕЛЬЗЯ хардкодить: состав шагов зависит от цели. У «своей
  // базы» интересов и анализа нет, поэтому «Каналы» уезжают с шестого на
  // четвёртый — тот же клик обязан дать другое число.
  it("у другой цели тот же ряд ведёт на другой номер шага", () => {
    const onGoToStep = vi.fn();
    render(
      <WizardSummaryTable
        data={{ ...signalsComms, intent: "comms-own", sourceType: "own" }}
        onGoToStep={onGoToStep}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Каналы/ }));
    expect(onGoToStep).toHaveBeenCalledWith(4);
  });

  it("без onGoToStep строки не кнопки — таблица просто читается", () => {
    render(<WizardSummaryTable data={signalsComms} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("SMS, Email")).toBeInTheDocument();
  });
});
