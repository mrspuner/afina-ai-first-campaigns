// Клиентский компонент: вплетённые в текст пилюли (`DescriptionTagPill`)
// раскрывают поповеры/дроверы и держат собственный клиентский стейт. Само
// описание правок не производит — оно только рендерит сегменты и теги.
"use client";

import type {
  DescriptionSegment,
  DescriptionStage,
  DescriptionTag,
} from "@/state/graph-description";
import { DescriptionTagPill } from "./description-tag";
import { NODE_STYLES } from "./node-visuals";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";
import type { DomainStatus } from "@/types/account-settings";

/**
 * Верхнеуровневые блоки карточки «Сценарий кампании». Этапы описания
 * группируются по `stage.block` и рисуются под общим заголовком блока в этом
 * порядке. Денежный блок «Итог» рисует ЭКРАН кампании отдельно (не это
 * описание), поэтому здесь только «Сигнал (Скоринг)» и «Коммуникации» —
 * `describeWorkflow` иных значений `block` наружу больше и не выпускает.
 */
const BLOCK_LABEL = { signal: "Сигналы", communication: "Коммуникации" } as const;
const BLOCK_ORDER = ["signal", "communication"] as const;
/** Этапность: «1. Сигналы» → «2. Коммуникации». Номер фиксирован позицией в
 *  `BLOCK_ORDER` (signal=1, communication=2) независимо от наличия блоков. */
const BLOCK_NUMBER: Record<(typeof BLOCK_ORDER)[number], number> = {
  signal: 1,
  communication: 2,
};

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

/**
 * Параметры ноды условия для цели `node-fields` (Task 3) — расширение ТОГО ЖЕ
 * пути, что и `waitParamsForTag` выше: тот же `nodeParams`-лукап (не третий,
 * второй лукап уже есть — `nodeTypes`), тот же приём фильтрации по `kind`,
 * только `"condition"` вместо `"wait"`. `undefined`, если ноду не нашли ИЛИ
 * она не «condition» — пилюля рендерится без поповера, а не с пустым.
 */
function conditionParamsForTag(
  tag: DescriptionTag,
  nodeParams: Map<string, NodeParams> | undefined,
) {
  if (tag.target.kind !== "node-fields") return undefined;
  const params = nodeParams?.get(tag.target.nodeId);
  return params?.kind === "condition" ? params : undefined;
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
  /** Клик по кликабельной пилюле (target ≠ `none`) — поднимается наверх, к
   *  экрану кампании, который знает, куда вести (шаг визарда/поповер). */
  onTagActivate?: (tag: DescriptionTag) => void;
  /** nodeId → nodeType — красит пилюли `template`/`node-fields` под цвет узла
   *  графа (Task 6). Без пропа все пилюли этих целей остаются нейтральными. */
  nodeTypes?: Map<string, WorkflowNodeType>;
  /** nodeId → params ноды — содержимое поповера паузы (Task 8) и условия
   *  (Task 3), резолвится ТЕМ ЖЕ лукапом, что и `nodeTypes` (из
   *  `launchGraph.nodes` в `CampaignScreen`). Без пропа пилюля `node-fields`
   *  остаётся без поповера. */
  nodeParams?: Map<string, NodeParams>;
  /** Все домены триггеров кампании со статусами — содержимое поповера
   *  доменов (Task 8), тот же `facts.domains`, что уже строит
   *  `CampaignScreen`. Без пропа пилюля `domains` остаётся без поповера. */
  domains?: { domain: string; status: DomainStatus }[];
}

/**
 * Текстовое описание цепочки кампании.
 *
 * Описание — связный текст с вкраплёнными пилюлями значений: этапы сгруппированы
 * по нумерованным верхнеуровневым блокам «1. Сигналы» и «2. Коммуникации», под
 * каждым — нумерованные под-шаги (подзаголовок жирным, параметры кампании —
 * кликабельными тегами) и закрывающая строка блока. Каналы касания вплетены в
 * текст инлайн — «SMS с шаблоном [тег] и звонок…»; ветки развилки (форк-волны)
 * остаются отдельными ◈-абзацами со своим инлайн-перечислением каналов. Никаких
 * таблиц, кнопок предпросмотра и карточек нод — граф живёт миниатюрой ниже.
 *
 * Клик по тегу поднимается наверх (`onTagActivate`) — решение о том, куда вести
 * (шаг визарда/поповер/дровер триггеров), принимает вызывающий. Само описание
 * правок не производит.
 */
export function WorkflowDescription({
  stages,
  onTagActivate,
  nodeTypes,
  nodeParams,
  domains,
}: WorkflowDescriptionProps) {
  if (!stages.length) return null;

  /**
   * Этапы по верхнеуровневым блокам, сохраняя исходный порядок внутри блока.
   * Пустых блоков в мапе не остаётся (ключ появляется только при первом этапе),
   * поэтому рисуем блок только когда `BLOCK_ORDER` его действительно нашёл.
   */
  const stagesByBlock = new Map<DescriptionStage["block"], DescriptionStage[]>();
  for (const stage of stages) {
    const list = stagesByBlock.get(stage.block);
    if (list) list.push(stage);
    else stagesByBlock.set(stage.block, [stage]);
  }

  /**
   * Один путь рендера сегментов для ДВУХ мест — тела этапа (`stage.body`) и
   * значения настройки (`settings[].value`). Если бы у каждого была своя
   * копия этой развилки, пилюли настроек и пилюли прозы неизбежно разъехались
   * бы по пул-бэку пунктуации/резолву nodeType при первой же независимой
   * правке одной из копий.
   */
  function renderSegments(segments: DescriptionSegment[]) {
    return segments.map((segment, i) =>
      segment.kind === "text" ? (
        <span key={i} className={punctuationPullBack(segments[i - 1], segment.text)}>
          {segment.text}
        </span>
      ) : (
        <DescriptionTagPill
          key={segment.tag.id}
          tag={segment.tag}
          onActivate={onTagActivate}
          nodeType={nodeTypeForTag(segment.tag, nodeTypes)}
          waitParams={waitParamsForTag(segment.tag, nodeParams)}
          conditionParams={conditionParamsForTag(segment.tag, nodeParams)}
          domains={domains}
        />
      ),
    );
  }

  /**
   * Всё, что рисуется НИЖЕ заголовка этапа: тело, настройки, defensive-строка
   * «Та же серия…» и текстовые строки коммуникаций ◈-групп (Task 9). Общий
   * кусок для нумерованного под-шага (у него сверху бейдж + подзаголовок) и
   * для поглощённого сигнального этапа (у него ни бейджа, ни подзаголовка —
   * заголовок блока их заменяет). Сам заголовок под-шага и бейдж рисует
   * вызывающий уровень.
   */
  function renderStageDetails(stage: DescriptionStage) {
    return (
      <>
        <p>{renderSegments(stage.body)}</p>
        {stage.settings?.length ? (
          // Правка 5 (владелец продукта): зазор между строками списка настроек
          // доведён до 8px (`gap-2`, было `gap-1` = 4px).
          <dl data-testid="stage-settings" className="mt-0.5 flex flex-col gap-2">
            {stage.settings.map((s) => (
              <div key={s.id} className="flex items-baseline gap-2">
                {/* Правка 1: фиксированная ширина подписи — без неё «База»/
                    «Режим» короче «Сценарий»/«Триггеры», и теги-значения
                    в соседних строках начинались на разной горизонтали
                    (список читался «рваным»). 92px — самая длинная подпись
                    («Сценарий», «Триггеры») уместилась без переноса
                    (замерено Playwright'ом на реальном шрифте/рендере). */}
                <dt className="w-[92px] shrink-0 text-muted-foreground">{s.label}</dt>
                <dd className="min-w-0">{renderSegments(s.value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {stage.sameAsHeading && (
          <p className="text-muted-foreground italic">
            Та же серия, что в шаге «{stage.sameAsHeading}»
          </p>
        )}
        {/* Группы остаются ТОЛЬКО у форк-волн (у каждой ветки своё инлайн-
            перечисление каналов в `group.inline`). Не-форк волны вплетают
            каналы прямо в `stage.body`, групп не отдают — стопки строк с 👁
            больше нет. Ветка — один абзац: ◈-подпись + «: » + инлайн-каналы. */}
        {stage.groups?.map((group) => (
          <p key={group.id}>
            {group.label && (
              <span data-testid="group-label" className="font-semibold text-foreground">
                {/* Глиф — маркер ветви, а не слово: без aria-hidden скринридер
                    зачитывал бы его перед каждым названием потока. Цвет — из
                    палитры узла-развилки (`NODE_STYLES.condition`), инлайном по
                    той же причине, что и цвета пилюль. */}
                <span aria-hidden style={{ color: NODE_STYLES.condition.color }}>
                  ◈
                </span>{" "}
                {group.label}
              </span>
            )}
            {group.label ? ": " : null}
            {group.inline ? renderSegments(group.inline) : null}
          </p>
        ))}
      </>
    );
  }

  return (
    <TooltipProvider delay={1000}>
      {/* Item 1 (finale-полировка): пилюли (~23.6px) выше строки текста при
          leading-relaxed (1.625 → 22.75px) — в абзаце с несколькими тегами
          (напр. перечисление триггеров в «Старте») соседние обёрнутые строки
          соприкасаются пилюлями. 1.75 подобрано глазом на реальной карточке —
          давало видимый зазор при пилюле ~23.6px, не раздувая текст; трогаем
          только контейнер описания, не глобальную типографику.

          Правка 6 (владелец продукта, py-1 у PILL_BASE в description-tag.tsx):
          пилюля подросла до ~33px — ВЫШЕ, чем 24.5px (14px×1.75), которые даёт
          ЭТОТ leading. На плотном случае (несколько пилюль-триггеров,
          перенос строки) соседние строки снова стыкуются впритык (0px зазора,
          замерено Playwright'ом) — тот самый регресс, от которого 1.75 когда-то
          спасал. `leading` НЕ подгоняем молча (прямое указание правки 6) —
          см. отчёт правок, известный компромисс. */}
      <div className="flex flex-col gap-6 text-sm leading-[1.75] text-foreground">
        {BLOCK_ORDER.map((block) => {
          const blockStages = stagesByBlock.get(block);
          if (!blockStages?.length) return null;

          // Классификация этапов блока (порядок внутри блока сохранён):
          //  • closing — этап с ПУСТЫМ heading: закрывающая строка блока,
          //    обычный абзац без бейджа/заголовка/рельса;
          //  • lead — титульный этап СИГНАЛЬНОГО блока: его собственный
          //    заголовок («Скоринг базы») дублировал бы заголовок блока
          //    «Сигналы», поэтому тело идёт прямо под заголовком блока, без
          //    бейджа-номера;
          //  • numbered — всё прочее: нумерованный под-шаг с бейджем и рельсом.
          const numbered = blockStages.filter(
            (s) => s.heading !== "" && block !== "signal",
          );
          const lead = blockStages.filter(
            (s) => s.heading !== "" && block === "signal",
          );
          const closing = blockStages.filter((s) => s.heading === "");

          return (
            <section key={block} className="flex flex-col gap-3">
              <h3
                data-testid="block-heading"
                className="text-base font-semibold text-scenario-heading"
              >
                {BLOCK_NUMBER[block]}. {BLOCK_LABEL[block]}
              </h3>

              {/* Сигнальный титульный этап — тело+настройки прямо под
                  заголовком блока (его заголовок поглощён, см. классификацию). */}
              {lead.map((stage) => (
                <div key={stage.id} className="flex flex-col gap-1.5">
                  {renderStageDetails(stage)}
                </div>
              ))}

              {/* Нумерованные под-шаги. Рельс соединяет бейдж ЭТОГО шага с
                  бейджем СЛЕДУЮЩЕГО и только внутри блока — нумерация
                  перезапускается с каждого блока, поэтому и `<ol>` свой. */}
              {numbered.length > 0 && (
                <ol className="flex flex-col gap-5">
                  {numbered.map((stage, i) => (
                    // relative — контейнер позиционирования для сегмента рельса
                    // ниже: сегмент считает свои top/bottom от границ ИМЕННО
                    // этого <li>, а не всего списка. isolate — создаёт СВОЙ
                    // стековый контекст: без него -z-10 рельса ищет ближайший
                    // такой контекст выше по дереву (li с z-index:auto его не
                    // создаёт) и сравнивается там с фоном родительской карточки
                    // (`bg-card` у CardSection) — обычный некликабельный блок в
                    // потоке красится тем же тиром стекинга, что и фон карточки,
                    // и перекрывает рельс целиком. isolate запирает -z-10
                    // внутри ЭТОГО <li> — сравнение остаётся только с
                    // СОБСТВЕННЫМ (прозрачным) фоном li.
                    <li key={stage.id} className="relative isolate flex gap-3">
                      {/* Таймлайн-рельс (Task 4): соединяет бейдж ЭТОГО шага с
                          бейджем СЛЕДУЮЩЕГО. Сегмент на каждый шаг, кроме
                          последнего В БЛОКЕ, зависит только от высоты СВОЕГО
                          <li>: `top-3.5` — центр СВОЕГО бейджа (28px/2=14px),
                          `-bottom-[34px]` — уходит на gap-5 (20px) + половину
                          бейджа СЛЕДУЮЩЕГО шага (14px) ниже своей нижней
                          границы, попадая ровно в центр следующего бейджа без
                          единой замерной цифры. `-z-10`: бейдж и текст —
                          обычный поток (не positioned), поэтому по спецификации
                          стекинга рисуются ПОВЕРХ отрицательного z-index рельса
                          независимо от порядка в DOM — линия проходит позади
                          круга, а не поверх него. Не рисуем у последнего
                          нумерованного шага блока — соединять не с чем. */}
                      {i < numbered.length - 1 && (
                        <div
                          data-testid="stage-rail"
                          aria-hidden
                          className="absolute left-[13px] top-3.5 -bottom-[34px] -z-10 w-0.5 bg-scenario-rail"
                        />
                      )}
                      {/* aria-hidden: номер — декоративный, `<ol>` уже несёт
                          списочную семантику (порядковый номер даёт сам
                          браузер/скринридер); Preflight снимает только
                          визуальный маркер, а не роль списка, поэтому без
                          aria-hidden номер озвучивался бы дважды. */}
                      <span
                        data-testid="stage-number"
                        aria-hidden
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-scenario-badge-border bg-scenario-badge-bg text-xs font-medium tabular-nums text-scenario-badge-text"
                      >
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="text-[15.5px] font-semibold text-scenario-heading">
                          {stage.heading}
                        </p>
                        {renderStageDetails(stage)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {/* Закрывающая строка блока — обычный абзац, без бейджа-номера,
                  заголовка и рельса (тело этапа с пустым heading). */}
              {closing.map((stage) => (
                <p key={stage.id}>{renderSegments(stage.body)}</p>
              ))}
            </section>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
