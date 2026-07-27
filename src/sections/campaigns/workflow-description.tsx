import type {
  DescriptionMessage,
  DescriptionStage,
  DescriptionStageId,
  DescriptionTag,
} from "@/state/graph-description";
import { DescriptionTagPill } from "./description-tag";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Текстовый «хвостик» после названия канала, когда за него можно уцепиться
 * строкой: тема письма без резолвнутого шаблона. Резолвнутый шаблон рендерится
 * пилюлей (`message.templateTag`), не строкой — им ведает JSX ниже, поэтому
 * здесь для него `null`.
 */
function qualifierText(message: DescriptionMessage): string | null {
  if (message.templateTag) return null;
  if (message.templateName) return `, шаблон «${message.templateName}»`;
  if (message.subject) return `, тема «${message.subject}»`;
  return null;
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
  /** Клик по кликабельной пилюле (target ≠ `none`) — поднимается наверх, к
   *  экрану кампании, который знает, куда вести (шаг визарда/поповер). */
  onTagActivate?: (tag: DescriptionTag) => void;
}

/**
 * Текстовое описание цепочки кампании.
 *
 * Описание — связный текст с вкраплёнными пилюлями значений (Task 4/5):
 * подзаголовки этапов жирным, тексты сообщений в кавычках, параметры кампании
 * — кликабельными тегами. Никаких карточек нод — граф живёт отдельной
 * миниатюрой ниже.
 *
 * Чисто презентационный компонент: правки отсюда не запускаются напрямую —
 * клик по тегу лишь поднимает его наверх (`onTagActivate`), решение о том,
 * куда вести (шаг визарда/поповер), принимает вызывающий.
 */
export function WorkflowDescription({ stages, stageSlots, onTagActivate }: WorkflowDescriptionProps) {
  if (!stages.length) return null;

  return (
    <TooltipProvider delay={1000}>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
        {stages.map((stage) => (
          <div key={stage.id} className="flex flex-col gap-1.5">
            <p>
              <strong className="font-semibold text-foreground">{stage.heading}</strong>{" "}
              {stage.body.map((segment, i) =>
                segment.kind === "text" ? (
                  <span key={i}>{segment.text}</span>
                ) : (
                  <DescriptionTagPill key={segment.tag.id} tag={segment.tag} onActivate={onTagActivate} />
                ),
              )}
            </p>
            {stage.messages && (
              <ul className="flex flex-col gap-1 pl-1">
                {stage.messages.map((message) => (
                  <li key={`${message.channel}|${message.text}`}>
                    {/* Тело описания белое, поэтому канал выделяем весом,
                        а не цветом — иначе строка потеряла бы точку опоры. */}
                    — <span className="font-medium">{message.channel}</span>
                    {message.templateTag ? (
                      <>
                        {", шаблон "}
                        <DescriptionTagPill tag={message.templateTag} onActivate={onTagActivate} />
                      </>
                    ) : (
                      qualifierText(message)
                    )}
                    : «{message.text}»
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
    </TooltipProvider>
  );
}
