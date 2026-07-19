import type {
  DescriptionMessage,
  DescriptionStage,
  DescriptionStageId,
} from "@/state/graph-description";

/**
 * Уточнение коммуникации после названия канала: имя шаблона, а для письма без
 * резолвнутого шаблона — тема. Пустая строка, когда не за что зацепиться.
 */
function qualifier(message: DescriptionMessage): string {
  if (message.templateName) return `, шаблон «${message.templateName}»`;
  if (message.subject) return `, тема «${message.subject}»`;
  return "";
}

interface WorkflowDescriptionProps {
  stages: DescriptionStage[];
  /**
   * Доп. контент, вставляемый ПОД текстом конкретного этапа (напр. нодо-блок
   * «Старта» — A2.1 — или нодо-блоки коммуникаций под «Первым касанием»).
   * Ключ — id этапа, поэтому механизм не завязан на конкретный этап и
   * переиспользуется для любого следующего.
   */
  stageSlots?: Partial<Record<DescriptionStageId, React.ReactNode>>;
}

/**
 * Текстовое описание цепочки кампании.
 *
 * Описание — ТОЛЬКО связный текст: подзаголовки этапов жирным, тексты сообщений
 * в кавычках. Никаких карточек нод — граф живёт отдельной миниатюрой ниже.
 *
 * Чисто презентационный компонент: правки отсюда не запускаются — логика
 * правки идёт через граф кампании (кликабельная миниатюра рядом).
 */
export function WorkflowDescription({ stages, stageSlots }: WorkflowDescriptionProps) {
  if (!stages.length) return null;

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      {stages.map((stage) => (
        <div key={stage.id} className="flex flex-col gap-1.5">
          <p>
            <strong className="font-semibold text-foreground">{stage.heading}</strong>{" "}
            {stage.body}
          </p>
          {stage.messages && (
            <ul className="flex flex-col gap-1 pl-1">
              {stage.messages.map((message) => (
                <li key={`${message.channel}|${message.text}`}>
                  {/* Тело описания белое, поэтому канал выделяем весом,
                      а не цветом — иначе строка потеряла бы точку опоры. */}
                  — <span className="font-medium">{message.channel}</span>
                  {qualifier(message)}: «{message.text}»
                </li>
              ))}
            </ul>
          )}
          {stageSlots?.[stage.id] && (
            <div className="pt-1">{stageSlots[stage.id]}</div>
          )}
        </div>
      ))}
    </div>
  );
}
