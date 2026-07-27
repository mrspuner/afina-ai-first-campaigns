import type {
  DescriptionMessage,
  DescriptionSegment,
  DescriptionStage,
  DescriptionStageId,
  DescriptionTag,
} from "@/state/graph-description";
import { DescriptionTagPill } from "./description-tag";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkflowNodeType } from "@/types/workflow";

/**
 * Тип ноды по её id для целей `template`/`node-fields` — сам тег его не несёт
 * (Task 5), поэтому пилюля резолвит цвет через лукап, который передаёт
 * вызывающий (`CampaignScreen`, построенный из `launchGraph.nodes`). Без
 * лукапа (или без совпадения) пилюля остаётся нейтральной — обратная
 * совместимость с Task 4/5. После демоции (`none`, fix round 2) `nodeId`
 * переезжает на сам `none`-таргет (см. `graph-description.ts`), поэтому его
 * тоже проверяем — иначе демотированный шаблон/пауза теряют nodeType и вместе
 * с ним иконку.
 */
function nodeTypeForTag(
  tag: DescriptionTag,
  nodeTypes: Map<string, WorkflowNodeType> | undefined,
): WorkflowNodeType | undefined {
  const target = tag.target;
  const nodeId =
    target.kind === "template" || target.kind === "node-fields"
      ? target.nodeId
      : target.kind === "none"
        ? target.nodeId
        : undefined;
  return nodeId !== undefined ? nodeTypes?.get(nodeId) : undefined;
}

/** Знаки, которые в тексте описания всегда стоят СРАЗУ за предыдущим словом,
 *  без пробела («тег.», «тег,», «каналам:»). */
const GLUED_PUNCTUATION = /^[.,:;!?]/;

/**
 * Единственное место, где живёт величина отступа — используется и для знака
 * препинания после тега в `stage.body` (`punctuationPullBack` ниже), и для
 * двоеточия после `message.templateTag` в списке сообщений (тот же паддинг
 * пилюли, тот же эффект, но другая разметка — литерал `: «…»`, а не сегмент
 * `stage.body`, поэтому через `punctuationPullBack` не идёт).
 */
const PILL_PUNCTUATION_PULL_BACK = "-ml-[5px]";

/**
 * Пилюля — inline-flex бокс со своим правым паддингом+бордером (~7px,
 * `PILL_BASE` в description-tag.tsx). Когда следом без пробела в самом
 * тексте идёт знак препинания, этот паддинг визуально читается как пробел
 * перед точкой/запятой — «Регистрация .» вместо «Регистрация.» — хотя в
 * сегментах пробела нет (проверено: склейка сегментов не содержит лишних
 * пробелов). Небольшой отрицательный margin у ТАКОГО текстового сегмента
 * возвращает знак вплотную к пилюле. Сегменты, начинающиеся с буквы или
 * пробела (обычные слова после тега — у них пробел законный, если он есть в
 * тексте), не трогаем.
 */
function punctuationPullBack(
  prev: DescriptionSegment | undefined,
  text: string,
): string | undefined {
  return prev?.kind === "tag" && GLUED_PUNCTUATION.test(text)
    ? PILL_PUNCTUATION_PULL_BACK
    : undefined;
}

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
  /** nodeId → nodeType — красит пилюли `template`/`node-fields` под цвет узла
   *  графа (Task 6). Без пропа все пилюли этих целей остаются нейтральными. */
  nodeTypes?: Map<string, WorkflowNodeType>;
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
export function WorkflowDescription({
  stages,
  stageSlots,
  onTagActivate,
  nodeTypes,
}: WorkflowDescriptionProps) {
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
                  <span
                    key={i}
                    className={punctuationPullBack(stage.body[i - 1], segment.text)}
                  >
                    {segment.text}
                  </span>
                ) : (
                  <DescriptionTagPill
                    key={segment.tag.id}
                    tag={segment.tag}
                    onActivate={onTagActivate}
                    nodeType={nodeTypeForTag(segment.tag, nodeTypes)}
                  />
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
                        <DescriptionTagPill
                          tag={message.templateTag}
                          onActivate={onTagActivate}
                          nodeType={nodeTypeForTag(message.templateTag, nodeTypes)}
                        />
                        {/* Двоеточие идёт вплотную к пилюле в исходном тексте
                            (без пробела) ровно как «тег.»/«тег,» в
                            stage.body — тот же паддинг+бордер пилюли создаёт
                            ту же иллюзию пробела перед ним. Обёрнуто в свой
                            <span>, а не оставлено голым JSX-текстом, ТОЛЬКО в
                            этой ветке — именно тут перед двоеточием реально
                            пилюля; фолбэк-ветка (qualifierText/ничего) ниже
                            остаётся плоским текстом, как раньше. */}
                        <span className={PILL_PUNCTUATION_PULL_BACK}>
                          : «{message.text}»
                        </span>
                      </>
                    ) : (
                      <>
                        {qualifierText(message)}
                        : «{message.text}»
                      </>
                    )}
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
