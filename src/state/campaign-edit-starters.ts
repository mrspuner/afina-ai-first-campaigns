import type { TemplateQuestion } from "./chat-context";

/**
 * Заготовленные уточняющие вопросы для правки кампании.
 *
 * Тот же приём, что у `starterTemplateVariants` (Block 7 §5): когда ключа
 * провайдера нет или модель вернула пустой ответ, роут отдаёт эти вопросы —
 * прототип работает на любой машине и без сети. Они намеренно общие: конкретику
 * даёт модель, читая текст правки и описание цепочки.
 */
export function starterEditQuestions(): TemplateQuestion[] {
  return [
    {
      prompt: "Правку применить ко всей цепочке или только к первому касанию?",
      allowFreeInput: true,
      options: [
        { id: "all", label: "Ко всей цепочке" },
        { id: "first", label: "Только к первому касанию" },
      ],
    },
    {
      prompt: "Паузу перед повтором оставляем прежней?",
      allowFreeInput: true,
      options: [
        { id: "keep", label: "Оставить как есть" },
        { id: "shorter", label: "Сократить" },
      ],
    },
  ];
}
