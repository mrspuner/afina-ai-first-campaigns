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
 *
 * `rowLabel` — различитель ДВУХ строк одного канала внутри ОДНОЙ группы (см.
 * `rowDistinctions`): ни канал, ни заголовок этапа, ни метка ветки их не
 * различают. Приходит `undefined` в обычном случае — по той же причине, что и
 * `stageId`.
 */
function PreviewButton({
  row,
  nodeParams,
  stageHeading,
  stageId,
  groupLabel,
  rowLabel,
}: {
  row: DescriptionCommunication;
  nodeParams?: Map<string, NodeParams>;
  stageHeading: string;
  stageId?: string;
  groupLabel?: string;
  rowLabel?: string;
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
    ...(rowLabel ? [rowLabel] : []),
    ...(stageId ? [stageId] : []),
  ];
  const label = `Предпросмотр — ${parts.join(", ")}`;
  return (
    // Task 4: квадратная кнопка-иконка вместо иконки с подписью — подпись
    // «Предпросмотр» уходит из видимого текста (освобождает колонку под
    // контент), но не из доступного имени: aria-label уже уникален (различает
    // канал/этап/группу/строку выше), а `title` дублирует его для наведения
    // мышью — подсказка не пропадает вместе с текстом.
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => openTemplatePreview(target)}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-scenario-badge-border bg-scenario-badge-bg text-scenario-badge-text transition-colors hover:border-scenario-badge-text hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** Сколько символов контента строки уходит в её ярлык предпросмотра: фраза
 *  должна опознаваться на слух, а не зачитываться целым сообщением. */
const ROW_LABEL_LIMIT = 40;

/** Начало контента строки — ровно то, что видно в её ячейке. */
function contentSnippet(row: DescriptionCommunication): string {
  const text = (row.contentTitle ?? row.contentText).replace(/\s+/g, " ").trim();
  return text.length > ROW_LABEL_LIMIT
    ? `${text.slice(0, ROW_LABEL_LIMIT).trimEnd()}…`
    : text;
}

/**
 * Различители строк ВНУТРИ одной ◈-группы: nodeId → добавка к `aria-label`.
 *
 * Канал + заголовок этапа (+ метка ветки) не различают ДВЕ строки ОДНОГО
 * канала в одной группе — например два письма с разными телами: ключ сравнения
 * коммуникаций читает тему И тело (`graph-waves.ts`), поэтому в таблицу они
 * попадают обе, а показывается у письма одна тема.
 *
 * Ведущий различитель — содержательный: начало контента строки. Оно
 * произносится и что-то значит для слушателя, в отличие от технического
 * `row.nodeId`. Но уникальным по построению оно НЕ является (те самые два
 * письма с одной темой), поэтому там, где контент пуст или совпал, идёт
 * порядковый номер строки среди строк своего канала — он уникален всегда.
 * Добавка выдаётся ТОЛЬКО строкам спорного канала: на обычной карточке (по
 * одной строке на канал) ярлык остаётся коротким — тот же принцип, что и у
 * хвоста `stage.id`.
 */
function rowDistinctions(rows: DescriptionCommunication[]): Map<string, string> {
  const byChannel = new Map<string, DescriptionCommunication[]>();
  for (const row of rows) {
    const list = byChannel.get(row.channel);
    if (list) list.push(row);
    else byChannel.set(row.channel, [row]);
  }
  const distinctions = new Map<string, string>();
  for (const list of byChannel.values()) {
    if (list.length < 2) continue;
    const snippets = list.map(contentSnippet);
    list.forEach((row, i) => {
      const snippet = snippets[i];
      const distinct = snippet !== "" && snippets.filter((s) => s === snippet).length === 1;
      distinctions.set(row.nodeId, distinct ? snippet : `сообщение ${i + 1}`);
    });
  }
  return distinctions;
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
          conditionParams={conditionParamsForTag(segment.tag, nodeParams)}
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
          // relative — контейнер позиционирования для сегмента рельса ниже:
          // сегмент считает свои top/bottom от границ ИМЕННО этого <li>, а не
          // всего списка (см. комментарий у stage-rail). isolate — создаёт
          // СВОЙ стековый контекст: без него -z-10 рельса ищет ближайший
          // такой контекст выше по дереву (li с z-index:auto его не создаёт)
          // и сравнивается там с фоном родительской карточки (`bg-card` у
          // CardSection) — обычный некликабельный блок в потоке красится
          // тем же тиром стекинга, что и фон карточки, и перекрывает рельс
          // целиком (проверено вживую: elementFromPoint возвращал <li>, а не
          // рельс, на его собственных координатах). isolate запирает -z-10
          // внутри ЭТОГО <li> — сравнение остаётся только с СОБСТВЕННЫМ
          // (прозрачным) фоном li, а не с чужой картой выше по дереву.
          <li key={stage.id} className="relative isolate flex gap-3">
            {/* Таймлайн-рельс (Task 4): соединяет бейдж ЭТОГО шага с бейджем
                СЛЕДУЮЩЕГО. Не единый div на всю высоту списка — тот подход
                (как в референс-прототипе, `.steps::before` на весь контейнер)
                считает bottom-отступ от низа ПОСЛЕДНЕГО шага целиком, а тело
                шага (текст, таблицы) обычно намного выше своего бейджа —
                линия утекала бы далеко за круг последнего шага. Сегмент на
                каждый шаг, кроме последнего, зависит только от высоты
                СВОЕГО <li>: `top-3.5` — центр СВОЕГО бейджа (28px/2=14px),
                `-bottom-[34px]` — уходит на gap-5 (20px) + половину бейджа
                СЛЕДУЮЩЕГО шага (14px) ниже своей нижней границы, попадая
                ровно в центр следующего бейджа без единой замерной цифры.
                `-z-10`: бейдж и текст — обычный поток (не positioned),
                поэтому по спецификации стекинга рисуются ПОВЕРХ отрицательного
                z-index рельса независимо от порядка в DOM — линия проходит
                позади круга, а не поверх него. Не рисуем у одинокого шага и у
                последнего — соединять не с чем. */}
            {i < stages.length - 1 && (
              <div
                data-testid="stage-rail"
                aria-hidden
                className="absolute left-[13px] top-3.5 -bottom-[34px] -z-10 w-0.5 bg-scenario-rail"
              />
            )}
            {/* aria-hidden: номер — декоративный, `<ol>` уже несёт списочную
                семантику (порядковый номер даёт сам браузер/скринридер);
                Preflight снимает только визуальный маркер, а не роль списка,
                поэтому без aria-hidden номер озвучивался бы дважды. */}
            <span
              data-testid="stage-number"
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-scenario-badge-border bg-scenario-badge-bg text-xs font-medium tabular-nums text-scenario-badge-text"
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-[15.5px] font-semibold text-scenario-heading">{stage.heading}</p>
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
              {stage.groups?.map((group, gi) => {
                const distinctions = rowDistinctions(group.rows);
                return (
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
                    {/* Task 4: панель вокруг таблицы — фон/обводка/радиус,
                        overflow-hidden обрезает углы строк и шапки под
                        rounded-[10px] (иначе прямоугольные ячейки торчали бы
                        за скруглением панели). */}
                    <div
                      data-testid="table-panel"
                      className="overflow-hidden rounded-[10px] border border-scenario-rail bg-scenario-panel"
                    >
                      <table className="w-full table-fixed border-collapse text-left">
                        {/* colgroup — фикс эскиза брифа: там ширины сидели на <th>
                            шапки, но шапка — ОДИН раз на шаг (у первой ◈-группы), а
                            table-fixed берёт ширины колонок из первой строки СВОЕЙ
                            таблицы, а не соседней. Без общего <colgroup> у 2-й+
                            группы колонки поплыли бы — здесь общий источник ширин
                            для ВСЕХ таблиц шага, выровненных между группами.

                            Значения — Task 4, макет: 110px / 196px / авто / 52px.
                            Колонка кнопки сузилась с прежних 7.5rem (120px) до
                            52px: кнопка предпросмотра стала квадратной иконкой без
                            подписи (28px кнопки + по 12px паддинга ячейки с
                            каждой стороны) — подписи «Предпросмотр» не осталось
                            вовсе, вылезать за край больше нечему. Контент —
                            по-прежнему без фиксированной ширины (авто): его текст
                            и так ограничен двумя строками (`line-clamp-2`), а
                            освободившееся место у колонки кнопки лучше отдать
                            ему, чем раздувать соседние колонки. */}
                        <colgroup>
                          <col className="w-[110px]" />
                          <col className="w-[196px]" />
                          <col />
                          <col className="w-[52px]" />
                        </colgroup>
                        {/* Шапку несёт КАЖДАЯ таблица шага, но видимая — только у
                            первой ◈-группы: визуально повторять подписи колонок над
                            каждой веткой незачем, а вот без `<thead>` вторая и
                            третья таблицы приходили к скринридеру полностью
                            неподписанными сетками данных. `sr-only` снимает ровно
                            визуальную половину проблемы, не трогая семантику. */}
                        <thead className={gi === 0 ? undefined : "sr-only"}>
                          <tr className="border-b border-scenario-rail text-[10px] font-medium uppercase tracking-wide text-scenario-th">
                            <th scope="col" className="px-3 py-1.5">Коммуникация</th>
                            <th scope="col" className="px-3 py-1.5">Шаблон</th>
                            <th scope="col" className="px-3 py-1.5">Контент шаблона</th>
                            {/* Колонка кнопки предпросмотра остаётся без подписи:
                                сама кнопка уже несёт полный aria-label
                                («Предпросмотр — SMS, Первое касание»), и заголовок
                                колонки только удваивал бы его при чтении ячейки. */}
                            <th scope="col" className="px-3 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            // border-collapse на <table> выше — необходимое условие,
                            // чтобы браузер вообще учитывал border у <tr> (в
                            // раздельной модели границ бордер строки игнорируется
                            // полностью, см. CSS2.1 §17.6.1). last:border-b-0 —
                            // Tailwind-эквивалент :last-child, снимает разделитель у
                            // последней строки без сравнения индекса в JS.
                            <tr key={row.nodeId} className="border-b border-scenario-rail align-top last:border-b-0">
                              <td className="px-3 py-2.5 font-medium">{row.channel}</td>
                              <td className="px-3 py-2.5">
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
                              <td className="px-3 py-2.5 text-muted-foreground">
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
                              {/* Кнопка прижата к правому краю таблицы — квадратная
                                  иконка (Task 4), переносить больше нечему. */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <PreviewButton
                                  row={row}
                                  nodeParams={nodeParams}
                                  stageHeading={stage.heading}
                                  stageId={
                                    ambiguousHeadings.has(stage.heading) ? stage.id : undefined
                                  }
                                  groupLabel={group.label}
                                  rowLabel={distinctions.get(row.nodeId)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </TooltipProvider>
  );
}
