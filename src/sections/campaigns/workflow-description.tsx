import type {
  DescriptionSegment,
  DescriptionStage,
  DescriptionTag,
} from "@/state/graph-description";
import { DescriptionTagPill } from "./description-tag";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";
import type { DomainStatus } from "@/types/account-settings";

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

/**
 * Параметры ноды ожидания для цели `node-fields` (Task 8) — тем же путём, что
 * и `nodeTypeForTag` выше: лукап строится вызывающим (`CampaignScreen`, из
 * `launchGraph.nodes`), пилюля в кэш графа не лезет. `undefined`, если ноду не
 * нашли ИЛИ она не «wait» (`params.kind !== "wait"`) — в обоих случаях пилюля
 * рендерится без поповера, а не с пустым.
 */
function waitParamsForTag(
  tag: DescriptionTag,
  nodeParams: Map<string, NodeParams> | undefined,
) {
  if (tag.target.kind !== "node-fields") return undefined;
  const params = nodeParams?.get(tag.target.nodeId);
  return params?.kind === "wait" ? params : undefined;
}

/** Знаки, которые в тексте описания всегда стоят СРАЗУ за предыдущим словом,
 *  без пробела («тег.», «тег,», «каналам:»). */
const GLUED_PUNCTUATION = /^[.,:;!?]/;

/** Единственное место, где живёт величина отступа знака препинания после тега
 *  в `stage.body` (`punctuationPullBack` ниже). */
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

interface WorkflowDescriptionProps {
  stages: DescriptionStage[];
  /**
   * Доп. контент, вставляемый ПОД текстом конкретного этапа (напр. нодо-блок
   * «Старта» — A2.1 — или нодо-блоки коммуникаций под «Первым касанием»).
   * Ключ — id этапа, поэтому механизм не завязан на конкретный этап и
   * переиспользуется для любого следующего.
   */
  stageSlots?: Partial<Record<string, React.ReactNode>>;
  /** Клик по кликабельной пилюле (target ≠ `none`) — поднимается наверх, к
   *  экрану кампании, который знает, куда вести (шаг визарда/поповер). */
  onTagActivate?: (tag: DescriptionTag) => void;
  /** nodeId → nodeType — красит пилюли `template`/`node-fields` под цвет узла
   *  графа (Task 6). Без пропа все пилюли этих целей остаются нейтральными. */
  nodeTypes?: Map<string, WorkflowNodeType>;
  /** nodeId → params ноды — содержимое поповера паузы (Task 8), резолвится
   *  ТЕМ ЖЕ лукапом, что и `nodeTypes` (из `launchGraph.nodes` в
   *  `CampaignScreen`). Без пропа пилюля `node-fields` остаётся без поповера. */
  nodeParams?: Map<string, NodeParams>;
  /** Все домены триггеров кампании со статусами — содержимое поповера
   *  доменов (Task 8), тот же `facts.domains`, что уже строит
   *  `CampaignScreen`. Без пропа пилюля `domains` остаётся без поповера. */
  domains?: { domain: string; status: DomainStatus }[];
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
  nodeParams,
  domains,
}: WorkflowDescriptionProps) {
  if (!stages.length) return null;

  return (
    <TooltipProvider delay={1000}>
      {/* Item 1 (finale-полировка): пилюли (~23.6px) выше строки текста при
          leading-relaxed (1.625 → 22.75px) — в абзаце с несколькими тегами
          (напр. перечисление триггеров в «Старте») соседние обёрнутые строки
          соприкасаются пилюлями. 1.75 подобрано глазом на реальной карточке —
          даёт видимый зазор, не раздувая текст; трогаем только контейнер
          описания, не глобальную типографику. */}
      <div className="flex flex-col gap-3 text-sm leading-[1.75] text-foreground">
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
                    waitParams={waitParamsForTag(segment.tag, nodeParams)}
                    domains={domains}
                  />
                ),
              )}
            </p>
            {/* Таблицы коммуникаций (`stage.groups`) рендерит Task 8 — список
                строк снят вместе с `DescriptionStage.messages` (Task 5). */}
            {stageSlots?.[stage.id] && (
              <div className="pt-1">{stageSlots[stage.id]}</div>
            )}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
