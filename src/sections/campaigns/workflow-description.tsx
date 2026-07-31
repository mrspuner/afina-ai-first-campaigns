// Task 8: таблица коммуникаций несёт кнопку предпросмотра, а та зовёт
// useChat() — компонент перестаёт быть чисто серверным/презентационным и
// нуждается в границе клиентского компонента (тот же приём, что уже несёт
// сосед `description-tag.tsx`).
"use client";

import { Eye } from "lucide-react";
import type {
  DescriptionCommunication,
  DescriptionSegment,
  DescriptionStage,
  DescriptionTag,
} from "@/state/graph-description";
import { DescriptionTagPill } from "./description-tag";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";
import type { DomainStatus } from "@/types/account-settings";
import { useChat } from "@/state/chat-context";
import { nodePreviewTemplate } from "@/state/node-template-options";

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
 * Кнопка 4-й колонки таблицы коммуникаций (Task 8). Тот же механизм, что
 * «глаз» в селекте шаблонов ноды (`node-card-content.tsx`): резолвнутый
 * шаблон открывается по id, а нерезолвнутый — синтетическим шаблоном из
 * текущих params ноды, который `nodePreviewTemplate` помечает
 * `usedInCampaigns: 1`, чтобы дровер открыл его read-only (нет записи в
 * библиотеке — «Сохранить» списало бы правку в несуществующий id).
 * Без цели (ни `previewTemplateId`, ни резолвнутых `nodeParams`) кнопка не
 * рендерится вовсе — не пустышкой без действия.
 *
 * `stageHeading` (Task 9, fix round) — заголовок этапа, которому принадлежит
 * строка. РЕАЛЬНЫЙ источник дублей аудио-имён — не ◈-группы одного шага (у
 * них `group.label` заполняется только настоящей развилкой, `forkKind`), а
 * этап «Пауза и повтор»: он рисует СВОЮ таблицу с содержательно той же самой
 * строкой, что и оригинальное касание, и обе группы при этом БЕЗ `group.label`
 * (повтор никогда не развилка). Поэтому основной различитель — заголовок
 * ЭТАПА (человекочитаем): «Предпросмотр — SMS, Первое касание» против
 * «Предпросмотр — SMS, Пауза и повтор». `groupLabel` (◈-подпись ветки
 * НАСТОЯЩЕЙ развилки) добавляется поверх — обе причины дублей закрыты
 * независимо.
 *
 * `stageId` (финальное ревью) — страховка на случай, когда и заголовка мало.
 * Заголовки уникальны у шаблонов репозитория, но не ПО ПОСТРОЕНИЮ: цепочка
 * A → пауза → A → пауза → A даёт два этапа «Пауза и повтор», а две
 * условные развилки — две «Развилки по реакции» (из шаблонов недостижимо, из
 * ИИ-правки графа — вполне). Уникален по построению только `stage.id`
 * (`touch-1`, `retry-1`, `retry-2`), поэтому он и дописывается хвостом — но
 * ТОЛЬКО когда заголовки реально совпали (проп приходит `undefined` в обычном
 * случае), иначе ярлык терял бы читаемость на всех нормальных карточках.
 */
function PreviewButton({
  row,
  nodeParams,
  stageHeading,
  stageId,
  groupLabel,
}: {
  row: DescriptionCommunication;
  nodeParams?: Map<string, NodeParams>;
  stageHeading: string;
  stageId?: string;
  groupLabel?: string;
}) {
  const { openTemplatePreview } = useChat();
  const params = nodeParams?.get(row.nodeId);
  const fallback = params ? nodePreviewTemplate(row.nodeId, params) : null;
  const target = row.previewTemplateId ?? fallback;
  if (!target) return null;
  const parts = [
    row.channel,
    stageHeading,
    ...(groupLabel ? [groupLabel] : []),
    ...(stageId ? [stageId] : []),
  ];
  const label = `Предпросмотр — ${parts.join(", ")}`;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => openTemplatePreview(target)}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      <span className="text-xs">Предпросмотр</span>
    </button>
  );
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
 * — кликабельными тегами. Таблицы коммуникаций (Task 8) — ниже текста, по
 * ◈-группам шага. Никаких карточек нод — граф живёт отдельной миниатюрой ниже.
 *
 * Клик по тегу поднимается наверх (`onTagActivate`) — решение о том, куда
 * вести (шаг визарда/поповер), принимает вызывающий. Но кнопка предпросмотра
 * (Task 8) зовёт `useChat().openTemplatePreview` сама — компонент больше не
 * чисто презентационный: он открывает боковой дровер напрямую, хотя ничего
 * в нём не правит (правки таблица не производит вовсе).
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
   * Заголовки, встречающиеся в описании больше одного раза. Только их ярлыки
   * предпросмотра получают хвост из `stage.id` — см. `PreviewButton`.
   * Считается по всему `stages`, а не по соседям: два одноимённых этапа могут
   * стоять и не подряд (касание — развилка — то же касание).
   */
  const ambiguousHeadings = new Set(
    stages
      .map((s) => s.heading)
      .filter((heading, i, all) => all.indexOf(heading) !== i),
  );

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
          domains={domains}
        />
      ),
    );
  }

  return (
    <TooltipProvider delay={1000}>
      {/* Item 1 (finale-полировка): пилюли (~23.6px) выше строки текста при
          leading-relaxed (1.625 → 22.75px) — в абзаце с несколькими тегами
          (напр. перечисление триггеров в «Старте») соседние обёрнутые строки
          соприкасаются пилюлями. 1.75 подобрано глазом на реальной карточке —
          даёт видимый зазор, не раздувая текст; трогаем только контейнер
          описания, не глобальную типографику. */}
      <ol className="flex flex-col gap-5 text-sm leading-[1.75] text-foreground">
        {stages.map((stage, i) => (
          <li key={stage.id} className="flex gap-3">
            {/* aria-hidden: номер — декоративный, `<ol>` уже несёт списочную
                семантику (порядковый номер даёт сам браузер/скринридер);
                Preflight снимает только визуальный маркер, а не роль списка,
                поэтому без aria-hidden номер озвучивался бы дважды. */}
            <span
              data-testid="stage-number"
              aria-hidden
              className="w-4 shrink-0 pt-px text-right text-xs font-medium tabular-nums text-muted-foreground"
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="font-semibold text-foreground">{stage.heading}</p>
              <p>{renderSegments(stage.body)}</p>
              {stage.settings?.length ? (
                <dl data-testid="stage-settings" className="mt-0.5 flex flex-col gap-1">
                  {stage.settings.map((s) => (
                    <div key={s.id} className="flex items-baseline gap-2">
                      <dt className="shrink-0 text-muted-foreground">{s.label}</dt>
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
              {stage.groups?.map((group, gi) => (
                <div key={group.id} className={gi > 0 ? "mt-3" : undefined}>
                  {group.label && (
                    <p
                      data-testid="group-label"
                      className="mb-1.5 font-medium text-foreground"
                    >
                      {/* Глиф — маркер списка ветвей, а не слово: без
                          aria-hidden скринридер зачитывал бы его перед каждым
                          названием потока («ромб чёрный, Высокая склонность»). */}
                      <span aria-hidden>◈</span> {group.label}
                    </p>
                  )}
                  <table className="w-full table-fixed border-collapse text-left">
                    {/* colgroup — фикс эскиза брифа: там ширины сидели на <th>
                        шапки, но шапка — ОДИН раз на шаг (у первой ◈-группы), а
                        table-fixed берёт ширины колонок из первой строки СВОЕЙ
                        таблицы, а не соседней. Без общего <colgroup> у 2-й+
                        группы колонки поплыли бы — здесь общий источник ширин
                        для ВСЕХ таблиц шага, выровненных между группами.

                        Значения сняты замером на живой карточке (таблица 602px):
                        имя шаблона в одну строку требует до 178px («Звонок —
                        приветствие»; типичные — 165–175), кнопка предпросмотра
                        — 116px. 26% под шаблон (157px) рвали имя на два ряда, и
                        пилюля читалась блоком-кнопкой, а не чипом строки; 7rem
                        под кнопку были УЖЕ самой кнопки, и «Предпросмотр»
                        вылезал за правый край таблицы. Место им отдала колонка
                        контента: её текст всё равно ограничен двумя строками
                        (`line-clamp-2`). «Коммуникация» НЕ ужимается, хотя
                        канал в ней короткий (Email — 35px): ширину колонки
                        держит её собственная шапка (98px), и на меньшем
                        подпись «Коммуникация» слипалась бы с «Шаблоном». */}
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[32%]" />
                      <col />
                      <col className="w-[7.5rem]" />
                    </colgroup>
                    {/* Шапку несёт КАЖДАЯ таблица шага, но видимая — только у
                        первой ◈-группы: визуально повторять подписи колонок над
                        каждой веткой незачем, а вот без `<thead>` вторая и
                        третья таблицы приходили к скринридеру полностью
                        неподписанными сетками данных. `sr-only` снимает ровно
                        визуальную половину проблемы, не трогая семантику. */}
                    <thead className={gi === 0 ? undefined : "sr-only"}>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
                        <th scope="col" className="pb-1 font-normal">Коммуникация</th>
                        <th scope="col" className="pb-1 font-normal">Шаблон</th>
                        <th scope="col" className="pb-1 font-normal">Контент шаблона</th>
                        {/* Колонка кнопки предпросмотра остаётся без подписи:
                            сама кнопка уже несёт полный aria-label
                            («Предпросмотр — SMS, Первое касание»), и заголовок
                            колонки только удваивал бы его при чтении ячейки. */}
                        <th scope="col" className="pb-1 font-normal" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.nodeId} className="align-top">
                          <td className="py-1.5 pr-2 font-medium">{row.channel}</td>
                          <td className="py-1.5 pr-2">
                            {row.templateTag && (
                              <DescriptionTagPill
                                tag={row.templateTag}
                                onActivate={onTagActivate}
                                nodeType={nodeTypeForTag(row.templateTag, nodeTypes)}
                                // Чип строки таблицы, а не слово прозы: длинное
                                // имя усекается многоточием (полное — в
                                // подсказке), но никогда не переносится.
                                truncateLabel
                              />
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">
                            {/* Без кавычек и без меток «Тема:»/«Текст:» —
                                контент читается как факт таблицы, не цитата. */}
                            <span className="line-clamp-2">
                              {row.contentTitle && (
                                <span className="text-foreground">{row.contentTitle}</span>
                              )}
                              {row.contentTitle && <br />}
                              {row.contentText}
                            </span>
                          </td>
                          {/* Кнопка прижата к правому краю таблицы и не
                              переносится: подпись «Предпросмотр» — одно слово,
                              разорванное посередине, читалось бы как две
                              строки-обрывка. */}
                          <td className="py-1.5 text-right whitespace-nowrap">
                            <PreviewButton
                              row={row}
                              nodeParams={nodeParams}
                              stageHeading={stage.heading}
                              stageId={
                                ambiguousHeadings.has(stage.heading) ? stage.id : undefined
                              }
                              groupLabel={group.label}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </TooltipProvider>
  );
}
