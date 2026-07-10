import { describe, expect, it } from "vitest";
import { describeWorkflow } from "./graph-description";
import { createTemplate } from "./workflow-templates";
import { PRESET_TEMPLATES } from "./app-state";

const T = PRESET_TEMPLATES;

describe("describeWorkflow", () => {
  describe("Старт", () => {
    it("упоминает скоринг, когда нода скоринга есть в графе (new/stream)", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.id === "start")!;
      expect(start.heading).toBe("Старт.");
      expect(start.body).toContain("скоринг");
      expect(start.body).toContain("проявляет намерение");
    });

    it("не упоминает скоринг для своей базы (ноды скоринга нет)", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T);
      const start = stages.find((s) => s.id === "start")!;
      expect(start.body).not.toContain("скоринг");
      expect(start.body).toContain("сверяются с сигналами");
    });
  });

  describe("Первое касание", () => {
    it("даёт по одной строке на канал: имя шаблона + текст из params", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(touch.heading).toBe("Первое касание.");
      expect(touch.messages).toHaveLength(2);

      const sms = touch.messages!.find((m) => m.channel === "SMS")!;
      expect(sms.templateName).toBe("SMS — напоминание");
      expect(sms.text).toBe("Ваше предложение ждёт. Подробности на сайте.");

      // Текст письма не совпадает ни с одним пресетом справочника → шаблон не
      // резолвится, и по спеке для email показываем тему.
      const email = touch.messages!.find((m) => m.channel === "Email")!;
      expect(email.templateName).toBeUndefined();
      expect(email.subject).toBe("Специальное предложение");
      expect(email.text).toBe("Мы подготовили для вас персональное предложение.");
    });

    it("упоминает деление на потоки, когда в графе есть сплиттер", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      expect(stages.find((s) => s.id === "first-touch")!.body).toContain("потоки");
    });

    it("для одного канала не выдумывает деление на потоки", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      expect(stages.find((s) => s.id === "first-touch")!.body).not.toContain("потоки");
    });

    it("схлопывает одинаковые касания параллельных сегментов в одну строку на канал", () => {
      // Апсейл — сегментированный шаблон: три comm-юнита с одинаковыми params.
      const stages = describeWorkflow(createTemplate("Апсейл", "new", ["sms"]), T);
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(touch.messages).toHaveLength(1);
      expect(touch.messages![0].channel).toBe("SMS");
    });
  });

  describe("Проверка реакции и повтор", () => {
    it("описывает проверку после первого касания", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.id === "check")!;
      expect(check.heading).toBe("Проверка реакции.");
      expect(check.body).toContain("успех");
    });

    it("берёт длительность паузы из WaitParams и не цитирует тексты повторно", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const retry = stages.find((s) => s.id === "retry")!;
      expect(retry.heading).toBe("Пауза и повтор.");
      expect(retry.body).toContain("2 дня"); // durationHours: 48
      expect(retry.messages).toBeUndefined();
    });

    it("не цитирует тексты повторного блока в первом касании", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      // Повторный блок несёт те же две ноды; в описании ровно одна строка.
      expect(stages.find((s) => s.id === "first-touch")!.messages).toHaveLength(1);
    });
  });

  describe("Итог", () => {
    it("после повтора описывает финальную проверку", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const outcome = stages.find((s) => s.id === "outcome")!;
      expect(outcome.heading).toBe("Итог.");
      expect(outcome.body).toContain("без конверсии");
    });
  });

  describe("Граф без коммуникаций", () => {
    it("даёт только Старт и Итог, без выдуманных касаний", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      expect(stages.map((s) => s.id)).toEqual(["start", "outcome"]);
      expect(stages[1].body).toContain("готовый сегмент");
      expect(stages.some((s) => s.messages?.length)).toBe(false);
    });
  });

  describe("Порядок и чистота", () => {
    it("этапы идут по пути базы через ноды", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      expect(stages.map((s) => s.id)).toEqual([
        "start",
        "first-touch",
        "check",
        "retry",
        "outcome",
      ]);
    });

    it("не мутирует переданный граф", () => {
      const graph = createTemplate("Возврат", "new", ["sms"]);
      const snapshot = JSON.stringify(graph);
      describeWorkflow(graph, T);
      expect(JSON.stringify(graph)).toBe(snapshot);
    });

    it("пустой граф не роняет обход", () => {
      expect(describeWorkflow({ nodes: [], edges: [] }, T)).toEqual([]);
    });
  });
});
