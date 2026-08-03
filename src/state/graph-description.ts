import type { NodeParams, WorkflowEdge, WorkflowNode } from "@/types/workflow";
import { pluralRu } from "@/lib/plural-ru";
import { formatRubPlain } from "@/lib/format-rub";
import { CHANNEL_LABEL } from "./channel-nodes";
import { segmentWaves, type Wave } from "./graph-waves";
import { conditionBranchLabel, conditionQuestionLabel } from "./node-sublabel";
import {
  channelForNodeKind,
  templateOptionsForKind,
  templateParamKeyForKind,
} from "./node-template-options";
import type { MessageTemplate } from "./app-state";
import type { WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";
import type { DomainStatus } from "@/types/account-settings";
import type { Channel, AnalysisMode } from "@/types/campaign";
import { getTriggerShortLabel } from "@/data/triggers-by-vertical";

/**
 * Детерминированное описание workflow-графа человеческим текстом.
 *
 * Чистая функция обхода: тот же граф + та же библиотека шаблонов всегда дают
 * тот же текст. Ни сети, ни кэша, ни модели — при желании фраза генерации
 * заменяется вызовом LLM без изменения формы результата.
 *
 * Этапы выводятся ИЗ ГРАФА, а не из сценария: нет ноды скоринга — нет слова
 * «скоринг»; нет коммуникаций — нет выдуманных касаний.
 */

/** Строка таблицы коммуникаций: одна нода канала внутри волны. */
export interface DescriptionCommunication {
  /** Нода-источник — ключ строки и адрес предпросмотра. */
  nodeId: string;
  /** Человекочитаемый канал: «SMS», «Email», «Push», «Звонок». */
  channel: string;
  /** Название шаблона как тег — раскрывает поповер выбора шаблона у пилюли. */
  templateTag?: DescriptionTag;
  /** Первая строка ячейки контента — только push (его заголовок). */
  contentTitle?: string;
  /** Основной текст ячейки: sms.text / email.subject / push.body / ivr.scenario. */
  contentText: string;
  /** id библиотечного шаблона, если резолвится — иначе предпросмотр из params ноды. */
  previewTemplateId?: string;
}

/** Поток внутри этапа: своя ветка развилки со своей таблицей. */
export interface DescriptionGroup {
  id: string;
  /** ◈-подзаголовок ветки/потока. Отсутствует у обычного касания. */
  label?: string;
  rows: DescriptionCommunication[];
}

/**
 * Категория этапа — грубее, чем `DescriptionStage.id` (тот остаётся строкой:
 * повторяющиеся волны нумеруются внутри своего вида — `touch-2`, `retry-1`).
 */
export type DescriptionStageKind = "start" | "touch" | "fork" | "check" | "retry" | "outcome";

/**
 * Кусок текста описания. Значения параметров кампании выносятся в теги-пилюли,
 * поэтому тело этапа больше не строка — оно чередует текст и теги.
 */
export type DescriptionSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: DescriptionTag };

/**
 * Куда ведёт клик по тегу. Единственная цель, уводящая с карточки, — шаг
 * визарда; остальные раскрываются поповером у самой пилюли. `none` — значение
 * без цели: кампания запущена (или граф больше не правится), либо такого шага
 * в её визарде не существует. `step`/`nodeId` на `none` — не цель клика (клика
 * нет), а ЛИЧНОСТЬ демотированного тега: только по ней пилюля узнаёт, чью
 * иконку и чей цвет показать (STEP_ICON / NODE_ICON + NODE_STYLES) — без неё
 * все демотированные пилюли стали бы одинаковыми серыми табличками (fix round
 * 2, Finding 2), а пилюли шаблонов запущенной кампании разъехались бы по цвету
 * с её же узлами графа (финальное ревью).
 */
export type TagTarget =
  | { kind: "wizard-step"; step: WizardStepId }
  | { kind: "template"; nodeId: string }
  | { kind: "node-fields"; nodeId: string }
  | { kind: "domains" }
  | { kind: "none"; step?: WizardStepId; nodeId?: string };

/** Значение параметра, вынесенное в кликабельную пилюлю внутри текста. */
export interface DescriptionTag {
  /** Уникален в пределах описания — используется как React-ключ. */
  id: string;
  label: string;
  target: TagTarget;
  /** Раскрывается по наведению: остаток схлопнутого перечисления. */
  hoverList?: string[];
}

/** Короткий конструктор текстового сегмента — читаемость сборки описания. */
const t = (text: string): DescriptionSegment => ({ kind: "text", text });

/** Плоский текст сегментов — для тестов, тултипов и заголовков. */
export function segmentsText(segments: DescriptionSegment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? s.text : s.tag.label))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Пункт «подпись — значение» в шапке этапа старта. */
export interface DescriptionSetting {
  id: string;
  label: string;
  value: DescriptionSegment[];
}

export interface DescriptionStage {
  id: string;
  kind: DescriptionStageKind;
  /** Заголовок БЕЗ точки — номер шага добавляет рендер. */
  heading: string;
  body: DescriptionSegment[];
  /** Факты кампании списком «подпись — значение» — пока только у старта. */
  settings?: DescriptionSetting[];
  /**
   * Таблицы коммуникаций. Одна группа без `label` — обычное касание. У
   * `kind:"retry"` это таблица САМОЙ повторной волны (её ноды, её id тегов),
   * содержательно совпадающая с оригиналом, — рендеру не приходится искать
   * чужой этап по заголовку, а идентификаторы тегов остаются уникальными.
   */
  groups?: DescriptionGroup[];
  /** Заголовок волны-оригинала → «Та же серия, что в шаге „Первое касание“».
   *  Только у `kind:"retry"`. */
  sameAsHeading?: string;
}

export interface DescribableGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ── Коммуникации → строка таблицы ────────────────────────────────────────────

/** Контент ячейки таблицы по каналу — что ПОКАЗЫВАЕМ, не что сравниваем
 *  (сравнение волн живёт в `graph-waves.ts` и читает другие поля). */
function communicationContent(params: NodeParams): { contentTitle?: string; contentText: string } {
  switch (params.kind) {
    case "sms": return { contentText: params.text };
    case "email": return { contentText: params.subject };
    case "push": return { contentTitle: params.title, contentText: params.body };
    case "ivr": return { contentText: params.scenario };
    default: return { contentText: "" };
  }
}

function describeCommunication(
  node: WorkflowNode,
  templates: MessageTemplate[],
  withTags: boolean,
  graphEditable: boolean,
): DescriptionCommunication | null {
  const params = node.data.params;
  if (!params) return null;
  const channel = channelForNodeKind(params.kind);
  if (!channel) return null;

  const matchKey = templateParamKeyForKind(params.kind);
  const bound = matchKey ? (params as unknown as Record<string, unknown>)[matchKey] : undefined;
  const template = matchKey
    ? templateOptionsForKind(templates, params.kind).find(
        (t) => (t.content as unknown as Record<string, unknown>)[matchKey] === bound,
      )
    : undefined;

  return {
    nodeId: node.id,
    channel: CHANNEL_LABEL[channel],
    ...communicationContent(params),
    // Резолвится шаблон — предпросмотр открывает его из библиотеки; не
    // резолвится — рендер собирает синтетический из params самой ноды.
    ...(template ? { previewTemplateId: template.id } : {}),
    // Fix: пилюля появляется ВСЕГДА в режиме тегов (вызвавший передал факты) —
    // резолвится шаблон или нет. Раньше тег создавался только когда
    // `templateName` резолвился, а резолв зависел от случайного совпадения
    // текущего текста ноды с содержимым библиотеки — для email/ivr текст
    // никогда не совпадал, и аффорданс «сменить шаблон» пропадал ровно тогда,
    // когда он нужнее всего. label — имя шаблона, если резолвится, иначе
    // «не выбран» (пилюля остаётся точкой входа в список шаблонов канала в
    // обоих случаях). Без фактов (withTags=false) тег по-прежнему не
    // создаётся — описание остаётся чистым текстом (Task 4). Цель — только
    // пока граф ещё правится (§2.12): после запуска шаблон остаётся пилюлей со
    // значением, но клика не даёт — `none`, не отдельная read-only ветка.
    // `nodeId` переносится на `none` тоже — не как цель (клика нет), а чтобы
    // `WorkflowDescription` могло резолвить nodeType→NODE_ICON и после демоции
    // (fix round 2, Finding 2).
    ...(withTags
      ? {
          templateTag: {
            id: `msg-${node.id}-template`,
            label: template?.name ?? "не выбран",
            target: graphEditable
              ? { kind: "template", nodeId: node.id }
              : { kind: "none", nodeId: node.id },
          },
        }
      : {}),
  };
}

// ── Формулировки ─────────────────────────────────────────────────────────────

/**
 * «2 дня» / «12 часов» / «5 недель» / «до наступления события» — из WaitParams.
 *
 * Крупнейшая точная единица (неделя → день → час) — ЗЕРКАЛИТ алгоритм
 * `splitDuration` (wait-fields.tsx): та же лестница 168 → 24 → 1, тот же выбор
 * «крупнейшая единица, на которую число делится без остатка». До поповера
 * паузы (Task 8) эта фраза и поле `WaitFields` жили на разных экранах и
 * никогда не оказывались на глазах одновременно; поповер показывает их
 * рядом, поэтому расхождение форматов (здесь — только дни/часы, там — ещё и
 * недели) стало видимым багом (round 1, Finding 1): 840 часов читались как
 * «35 дней» у пилюли и «5 недель» у поля в один и тот же момент. Числа
 * (168/24) НЕ вынесены в общий модуль с `wait-fields.tsx` намеренно — правка
 * ограничена этим файлом (см. фикс-раунд 1), поэтому здесь отдельная, но
 * алгоритмически идентичная лестница.
 */
function waitPhrase(params: Extract<NodeParams, { kind: "wait" }>): string {
  if (params.mode === "until_event") return "до наступления события";
  const hours = params.durationHours ?? 0;
  if (hours >= 168 && hours % 168 === 0) {
    const weeks = hours / 168;
    return `${weeks} ${pluralRu(weeks, ["неделя", "недели", "недель"])}`;
  }
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
  }
  return `${hours} ${pluralRu(hours, ["час", "часа", "часов"])}`;
}

/**
 * Метка потока: сокращения рёбер сегментного сплиттера → человеческая фраза.
 * Незнакомая метка проходит как есть — граф мог быть собран вручную или ИИ.
 */
const SEGMENT_LABEL: Record<string, string> = {
  "Макс": "Максимальная склонность",
  "Выс": "Высокая склонность",
  "Ср": "Средняя склонность",
  "Низ": "Низкая склонность",
};

const TOUCH_HEADING = ["Первое касание", "Повторное касание", "Третье касание", "Четвёртое касание"];

/** Заголовок волны-касания по её порядковому номеру (1-based). Развилки и
 *  повторы номер НЕ тратят — их заголовки не зависят от него вовсе. */
function touchHeading(ordinal: number): string {
  return TOUCH_HEADING[ordinal - 1] ?? `Касание ${ordinal}`;
}

/**
 * Ветка условия — положительная? Рёбра сгенерированных шаблонов подписаны
 * «ДА»/«НЕТ», легаси-шаблонов — «YES»/«NO». Любая другая подпись (граф собран
 * вручную или ИИ) даёт `undefined`: тогда метка ветки идёт сырой, а не
 * угадывается наугад.
 */
function conditionBranchYes(label: string | undefined): boolean | undefined {
  switch (label?.toUpperCase()) {
    case "ДА": case "YES": return true;
    case "НЕТ": case "NO": return false;
    default: return undefined;
  }
}

/** ◈-подпись группы: сырая метка ребра, разложенная по виду развилки. */
function groupLabel(wave: Wave, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (wave.forkKind === "split") return SEGMENT_LABEL[raw] ?? raw;
  if (wave.forkKind === "condition") {
    const params = wave.forkNode?.data.params;
    const yes = conditionBranchYes(raw);
    if (params?.kind === "condition" && yes !== undefined) {
      return conditionBranchLabel(params.trigger, yes);
    }
  }
  return raw;
}

/** Таблицы волны. Группа без строк (ноды без канала/params) не выпускается. */
function describeGroups(
  wave: Wave,
  templates: MessageTemplate[],
  withTags: boolean,
  graphEditable: boolean,
): DescriptionGroup[] {
  const groups: DescriptionGroup[] = [];
  for (const group of wave.groups) {
    const rows = group.nodes
      .map((node) => describeCommunication(node, templates, withTags, graphEditable))
      .filter((row): row is DescriptionCommunication => row !== null);
    if (!rows.length) continue;
    const label = groupLabel(wave, group.label);
    groups.push({ id: group.id, ...(label !== undefined ? { label } : {}), rows });
  }
  return groups;
}

/**
 * Значение внутри фразы этапа: пилюля, когда вызвавший передал факты, иначе
 * просто текст. Без фактов описание остаётся чистым текстом — правило файла
 * старше этой задачи (Task 3/4).
 */
function valueSegments(withTags: boolean, tag: DescriptionTag): DescriptionSegment[] {
  return withTags ? [{ kind: "tag", tag }] : [t(tag.label)];
}

/**
 * Тело этапа-развилки.
 *
 * `condition` (Task 3) — пилюля со значением ведёт на поповер `node-fields`
 * («Событие» — combo-поле из `NODE_FIELD_EDITABILITY.condition`), ПОКА граф
 * ещё правится; после запуска — та же демоция в `none`, что и у шаблона/паузы
 * (§2.12), с тем же переносом `nodeId` ради иконки узла (fix round 2,
 * Finding 2).
 *
 * `split` остаётся `none` НАВСЕГДА, независимо от `graphEditable`:
 * `NODE_FIELD_EDITABILITY.split` помечает оба поля сплиттера («По»/«Ветки»)
 * `editability: "ai"` — их правит только ИИ-дровер (функция канвасной ноды),
 * которого на карточке кампании нет. Кликабельная пилюля без работающего
 * редактора была бы мёртвой кнопкой — хуже, чем нейтральный носитель значения.
 */
function forkBody(
  wave: Wave,
  groupCount: number,
  withTags: boolean,
  graphEditable: boolean,
): DescriptionSegment[] {
  const fork = wave.forkNode;

  if (wave.forkKind === "condition") {
    const params = fork?.data.params;
    if (!fork || params?.kind !== "condition") return [t("Дальше путь расходится по условию:")];
    const conditionTarget: TagTarget = graphEditable
      ? { kind: "node-fields", nodeId: fork.id }
      : { kind: "none", nodeId: fork.id };
    return [
      t("Дальше путь расходится по условию "),
      ...valueSegments(withTags, {
        id: `fork-${fork.id}`,
        label: conditionQuestionLabel(params.trigger),
        target: conditionTarget,
      }),
      t(":"),
    ];
  }

  return [
    t(`Аудитория делится на ${groupCount} ${pluralRu(groupCount, ["поток", "потока", "потоков"])} по `),
    ...(fork
      ? valueSegments(withTags, {
          id: `fork-${fork.id}`,
          label: "уровню склонности",
          target: { kind: "none", nodeId: fork.id },
        })
      : [t("уровню склонности")]),
    t(", каждый получает своё:"),
  ];
}

// ── Сборка описания ──────────────────────────────────────────────────────────

/**
 * Факты кампании, которые описание вплетает в текст тегами.
 *
 * `describeWorkflow` остаётся ЧИСТОЙ функцией от графа: состояние она не
 * читает, всё приходит сюда от вызывающего (`CampaignScreen`). Поле `pending`
 * — прежний `DomainStatuses`, сохранено ради обратной совместимости вызова.
 */
export interface CampaignFacts {
  /** Домены на модерации — управляет выводом фразы о модерации. */
  pending: string[];
  /** Все домены триггеров со статусами — содержимое поповера доменов. */
  domains?: { domain: string; status: DomainStatus }[];
  baseRows?: number;
  triggers?: string[];
  channels?: Channel[];
  budget?: number;
  /** Отсутствует у собственной базы — шага «Режим» в её визарде нет. */
  analysisMode?: AnalysisMode;
  scenarioName?: string;
  /**
   * Шаги, на которые тег имеет право увести. Пустой список = кампания
   * запущена: теги рендерятся как носители значений без клика. Это и есть
   * механизм read-only, отдельной ветки рендера не требуется.
   */
  editableSteps?: WizardStepId[];
  /**
   * Кампания ещё правится: граф можно менять. Отдельный сигнал от
   * `editableSteps` — тот требует снапшота визарда, а правка графа нужна и
   * сидовым черновикам без снапшота (так же, как её разрешал снятый
   * нодо-блок через readOnly={status !== "draft"}).
   */
  graphEditable?: boolean;
}

/**
 * Сегмент-тег со значением параметра, ведущий на шаг визарда.
 *
 * Если шаг недоступен (кампания запущена — `editableSteps` пуст; либо шага в
 * визарде этой цели нет — например «Режим» у собственной базы), цель
 * становится `none`: пилюля рендерится без клика, но значение показывает.
 * Отдельной ветки read-only-рендера поэтому не требуется. `step` переносится
 * на `none` и там же — не как цель клика (клика нет), а чтобы пилюля не
 * потеряла свою иконку при демоции (fix round 2, Finding 2).
 */
function stepTag(
  id: string,
  label: string,
  step: WizardStepId,
  editableSteps: WizardStepId[] | undefined,
  hoverList?: string[],
): DescriptionSegment {
  const editable = editableSteps?.includes(step) ?? false;
  return {
    kind: "tag",
    tag: {
      id,
      label,
      target: editable ? { kind: "wizard-step", step } : { kind: "none", step },
      ...(hoverList ? { hoverList } : {}),
    },
  };
}

/**
 * Склеивает соседние текстовые сегменты в один. Фразы собираются по кускам
 * (одни условные, другие нет), но соседние `text`+`text` должны читаться ОДНИМ
 * сегментом — это ровно то, что фиксирует тест на точный шов фразы о
 * модерации. Теги не трогает и порядок не меняет.
 */
function mergeTextSegments(segments: DescriptionSegment[]): DescriptionSegment[] {
  const merged: DescriptionSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.kind === "text" && last?.kind === "text") {
      merged[merged.length - 1] = { kind: "text", text: last.text + seg.text };
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

export function describeWorkflow(
  graph: DescribableGraph,
  templates: MessageTemplate[],
  facts?: CampaignFacts,
): DescriptionStage[] {
  if (!graph.nodes.length) return [];

  const { ordered, steps } = segmentWaves(graph);

  // Без фактов описание остаётся ровно тем, что производил Task 3 — чистым
  // текстом. Теги, не привязанные к конкретному полю CampaignFacts (шаблон
  // сообщения, пауза повтора — они читаются из графа, а не из facts),
  // включаются этим единственным флагом.
  const hasFacts = facts !== undefined;
  const editableSteps = facts?.editableSteps;
  // Отдельный от editableSteps сигнал (§2.12): шаблон/пауза — цели на граф,
  // не на визард, и остаются кликабельными весь черновик, даже без снапшота
  // (сидовые кампании). Отсутствие поля трактуем как «нет» — небезопасный
  // дефолт был бы молча кликабельным.
  const graphEditable = facts?.graphEditable ?? false;

  // Таблицы собираются ДО нумерации этапов: формулировка «Проверки реакции»
  // зависит от того, сколько каналов несут ВСЕ волны, а не только предыдущая.
  const groupsByWave = new Map<string, DescriptionGroup[]>();
  const channelsSeen = new Set<string>();
  for (const step of steps) {
    if (step.kind !== "wave") continue;
    const groups = describeGroups(step.wave, templates, hasFacts, graphEditable);
    groupsByWave.set(step.wave.id, groups);
    for (const group of groups) for (const row of group.rows) channelsSeen.add(row.channel);
  }
  const multiChannel = channelsSeen.size > 1;

  const hasScoring = ordered.some((n) => n.data.nodeType === "scoring");

  const stages: DescriptionStage[] = [];

  // Заголовок этапа читается ИЗ ГРАФА (есть нода скоринга — «Скоринг базы»),
  // а не из сценария/типа базы, как раньше заголовок «Старт.» был константой.
  const startBody = hasScoring
    ? "Загруженная база проходит скоринг: остаются те, кто проявляет намерение, с разбивкой по уровням склонности."
    : "Загруженная база попадает в кампанию: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности.";

  const triggersList = facts?.triggers ?? [];
  const hasBase = facts?.baseRows !== undefined;
  const hasTriggers = triggersList.length > 0;

  /**
   * Перечисление тегов триггеров: первые два именем, остаток — схлопка. В
   * пилюлю идёт КОРОТКОЕ имя триггера (`getTriggerShortLabel`) — полное
   * («Посещение сайтов банков…») в узкой пилюле всё равно режется многоточием;
   * полное остаётся подсказкой на наведении (`hoverList: [full]`). Остаток
   * схлопки — тоже короткими именами: тултип перечисляет их через запятую.
   */
  const triggerTagList = (): DescriptionSegment[] => {
    const [first, second, ...rest] = triggersList;
    const segs: DescriptionSegment[] = [
      stepTag("start-trigger-0", getTriggerShortLabel(first), "interests", editableSteps, [first]),
    ];
    if (second) {
      segs.push(
        t(rest.length ? ", " : " и "),
        stepTag("start-trigger-1", getTriggerShortLabel(second), "interests", editableSteps, [
          second,
        ]),
      );
    }
    if (rest.length) {
      segs.push(
        t(" и "),
        stepTag(
          "start-triggers-more",
          `ещё ${rest.length} ${pluralRu(rest.length, ["триггеру", "триггерам", "триггерам"])}`,
          "interests",
          editableSteps,
          rest.map(getTriggerShortLabel),
        ),
      );
    }
    return segs;
  };

  // Факты кампании — раньше вплетались инлайн в одно длинное предложение
  // старта, теперь каждый факт — свой пункт «подпись — значение» (Task 4).
  // Порядок фиксирован: База, Сценарий, Триггеры, Режим, Бюджет. Id тегов
  // внутри значений не меняются — на них ссылаются существующие клики/тесты.
  const settings: DescriptionSetting[] = [];

  if (hasBase) {
    settings.push({
      id: "start-base",
      label: "База",
      value: [
        stepTag(
          "start-base",
          `${facts!.baseRows!.toLocaleString("ru-RU")} строк`,
          "file",
          editableSteps,
        ),
      ],
    });
  }

  if (facts?.scenarioName !== undefined) {
    settings.push({
      id: "start-scenario",
      label: "Сценарий",
      value: [stepTag("start-scenario", facts.scenarioName, "scenario", editableSteps)],
    });
  }

  if (hasTriggers) {
    settings.push({ id: "start-triggers", label: "Триггеры", value: triggerTagList() });
  }

  // Режим анализа отсутствует в визарде собственной базы — тогда analysisMode
  // не приходит вовсе, и пункт не появляется.
  if (facts?.analysisMode !== undefined) {
    settings.push({
      id: "start-mode",
      label: "Режим",
      value: [
        stepTag(
          "start-mode",
          facts.analysisMode === "once" ? "разовый" : "потоковый",
          "analysis",
          editableSteps,
        ),
      ],
    });
  }

  // Бюджет переехал сюда из «Итога» (review round 1, Finding 2) — там он был
  // спайкой на конце предложения о конверсии, к которой отношения не имеет.
  // Id `outcome-budget` СТАРШЕ переезда и оставлен как есть по историческим
  // причинам — на него ссылаются существующие тесты/клики.
  if (facts?.budget !== undefined) {
    settings.push({
      id: "start-budget",
      label: "Бюджет",
      value: [stepTag("outcome-budget", formatRubPlain(facts.budget), "budget", editableSteps)],
    });
  }

  // Детерминированная строка судьбы доменов (Task 11): появляется ТОЛЬКО когда
  // есть pending-домены — граф + статусы решают, LLM тут ни при чём. Домены —
  // тег с целью на поповер модерации, а не сырой текст. Остаётся предложением
  // ТЕЛА (не пунктом списка) — это судьба, а не настройка кампании.
  const pendingDomains = facts?.pending ?? [];
  const domainSegments: DescriptionSegment[] = pendingDomains.length
    ? [
        t(" Домены "),
        {
          kind: "tag",
          tag: {
            id: "start-domains",
            label: pendingDomains.join(", "),
            target: { kind: "domains" },
          },
        },
        t(" отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании."),
      ]
    : [];

  stages.push({
    id: "start",
    kind: "start",
    heading: hasScoring ? "Скоринг базы" : "Загрузка базы",
    body: mergeTextSegments([t(startBody), ...domainSegments]),
    ...(settings.length ? { settings } : {}),
  });

  // Вводная «Выбрано [N каналов]: …» принадлежит ПЕРВОЙ волне, какой бы она ни
  // была: пилюля — единственный вход описания в шаг визарда «Каналы», и терять
  // её оттого, что первая волна разветвилась (легаси-«Удержание» — развилка по
  // построению), нельзя.
  const channelsCount = facts?.channels?.length ?? 0;
  const channelsIntro: DescriptionSegment[] = channelsCount
    ? [
        t("Выбрано "),
        // Пилюля называет СКОЛЬКО каналов выбрано («3 канала»), а не
        // перечисляет имена внутри себя — имена идут следом обычным текстом.
        stepTag(
          "first-touch-channels",
          `${channelsCount} ${pluralRu(channelsCount, ["канал", "канала", "каналов"])}`,
          "channels",
          editableSteps,
        ),
        t(`: ${facts!.channels!.map((c) => CHANNEL_LABEL[c]).join(", ")}. `),
      ]
    : [];

  // Волны графа → этапы. Счётчиков два, и оба содержательные: ПОРЯДКОВЫЙ НОМЕР
  // КАСАНИЯ тратят и обычные волны, и развилки (развилка — полноценный шаг
  // рассылки, просто со своим заголовком; иначе следующая волна назвалась бы
  // «Первым касанием», рассказывая при этом про неотреагировавших), а повтор не
  // тратит — это та же волна, повторённая. НОМЕР ВОЛНЫ решает, чья формулировка
  // «первая»: легаси-«Реактивация» ставит паузу перед первым касанием, и оно
  // всё равно остаётся первым.
  let waveOrdinal = 0;
  let touchOrdinal = 0;
  let forkOrdinal = 0;
  let retryOrdinal = 0;
  let checkOrdinal = 0;
  /** Заголовок последней НЕ-повторной волны — на него ссылается «Пауза и повтор». */
  let originHeading: string | undefined;
  /** Каналы предыдущей волны — расходящаяся волна сверяется с ними. */
  let previousChannels: Set<string> | undefined;
  let hasRetry = false;

  for (const step of steps) {
    if (step.kind === "check") {
      // Проверять реакцию не на что, пока ничего не отправлено; вторая и
      // дальнейшие проверки поглощаются формулировкой «Итога».
      if (waveOrdinal === 0 || checkOrdinal > 0) continue;
      checkOrdinal += 1;
      stages.push({
        id: `check-${checkOrdinal}`,
        kind: "check",
        heading: "Проверка реакции",
        body: [
          t(
            multiChannel
              ? "Кто отреагировал по любому каналу — уходит в успех и покидает кампанию."
              : "Кто отреагировал — уходит в успех и покидает кампанию.",
          ),
        ],
      });
      continue;
    }

    const wave = step.wave;
    const groups = groupsByWave.get(wave.id) ?? [];
    if (!groups.length) continue;
    waveOrdinal += 1;
    const waveChannels = new Set(groups.flatMap((g) => g.rows.map((r) => r.channel)));

    // Пауза — тег с целью node-fields на саму ноду ожидания, пока граф
    // правится (§2.12: после запуска — та же демоция в `none`, что и у
    // шаблона, с тем же переносом nodeId ради иконки — fix round 2, Finding 2).
    const waitNode = wave.waitBefore;
    const waitParams = waitNode?.data.params;
    const waitTag: DescriptionTag | undefined =
      waitNode && waitParams?.kind === "wait"
        ? {
            id: `wait-${waitNode.id}`,
            label: waitPhrase(waitParams),
            target: graphEditable
              ? { kind: "node-fields", nodeId: waitNode.id }
              : { kind: "none", nodeId: waitNode.id },
          }
        : undefined;

    if (wave.repeatsPrevious) {
      retryOrdinal += 1;
      hasRetry = true;
      stages.push({
        id: `retry-${retryOrdinal}`,
        kind: "retry",
        heading: "Пауза и повтор",
        body: mergeTextSegments(
          waitTag
            ? [
                t("Тем, кто не отреагировал, кампания выжидает "),
                ...valueSegments(hasFacts, waitTag),
                t(" и повторяет ту же серию по тем же каналам."),
              ]
            : [t("Тем, кто не отреагировал, кампания повторяет ту же серию по тем же каналам.")],
        ),
        groups,
        ...(originHeading ? { sameAsHeading: originHeading } : {}),
      });
      previousChannels = waveChannels;
      continue;
    }

    // Развилка — только когда ветки РАЗЛИЧАЮТСЯ: одинаковые по содержанию
    // потоки `graph-waves` уже схлопнул в одну группу, и делить там нечего.
    const isFork = wave.forkKind !== undefined && groups.length > 1;
    // Номер тратят и развилка, и обычное касание — см. комментарий у счётчиков.
    touchOrdinal += 1;
    const heading = isFork
      ? wave.forkKind === "split"
        ? "Деление на потоки"
        : "Развилка по реакции"
      : touchHeading(touchOrdinal);

    let waveBody: DescriptionSegment[];
    if (isFork) {
      waveBody = forkBody(wave, groups.length, hasFacts, graphEditable);
    } else if (waveOrdinal === 1) {
      const rowCount = groups.reduce((n, group) => n + group.rows.length, 0);
      // «Поток» в этом блоке принадлежит СЕГМЕНТУ аудитории: этап развилки
      // говорит «Аудитория делится на 3 потока по уровню склонности», и именно
      // этот смысл закрепляют ◈-подзаголовки таблиц. Многоканальная волна
      // делит аудиторию по другому признаку — по каналам (`split by:"equal"`
      // действительно ДЕЛИТ охват между ветками, поэтому «каждому контакту
      // уходит серия» тут было бы неправдой), — и называет свой механизм
      // своим именем, а не занимает чужое слово.
      waveBody = [
        t(
          rowCount > 1
            ? "Аудитория делится по каналам — каждому своё сообщение:"
            : "Каждому контакту уходит первое сообщение:",
        ),
      ];
    } else if (wave.sameContentAsPrevious) {
      // Содержание совпало с предыдущей волной, но разделяющей паузы нет —
      // «Паузой и повтором» такая волна не стала (её определение требует
      // паузы), а вот назвать её серию ДРУГОЙ было бы прямой ложью: ниже
      // стоит та же самая таблица. Называем серию повторённой и НЕ поминаем
      // паузу, которой в графе нет (`waitBefore` здесь отсутствует по
      // построению: будь она — волна ушла бы в ветку `repeatsPrevious` выше).
      waveBody = [t("Тем, кто не отреагировал, кампания повторяет ту же серию по тем же каналам:")];
    } else {
      // Волна разошлась с предыдущей: те же люди, но другой заход. Чем именно
      // он другой — сверяем по каналам, а не утверждаем наугад: вторая волна
      // тех же каналов с другими текстами — обычная форма, и врать про «другие
      // каналы» описание не должно.
      const sameChannels =
        previousChannels !== undefined &&
        previousChannels.size === waveChannels.size &&
        [...waveChannels].every((c) => previousChannels!.has(c));
      const differs = sameChannels ? "другими сообщениями" : "другими каналами и шаблонами";
      waveBody = waitTag
        ? [
            t("Тем, кто не отреагировал, кампания выжидает "),
            ...valueSegments(hasFacts, waitTag),
            t(` и заходит иначе — ${differs}:`),
          ]
        : [t(`Тем, кто не отреагировал, кампания заходит иначе — ${differs}:`)];
    }

    stages.push({
      id: isFork ? `fork-${++forkOrdinal}` : `touch-${touchOrdinal}`,
      kind: isFork ? "fork" : "touch",
      heading,
      // Вводная про каналы — у первой волны любого вида, перед её собственной
      // фразой.
      body: mergeTextSegments(waveOrdinal === 1 ? [...channelsIntro, ...waveBody] : waveBody),
      groups,
    });
    originHeading = heading;
    previousChannels = waveChannels;
  }

  // «Итог» — снова только про исход конверсии (review round 1, Finding 2:
  // бюджет переехал в «Старт», сюда его больше не сплавляем).
  stages.push({
    id: "outcome",
    kind: "outcome",
    heading: "Итог",
    body: [
      t(
        waveOrdinal === 0
          ? "Исходящих коммуникаций нет — на выходе вы получаете готовый сегмент, который можно выгрузить или запустить в другой кампании."
          : hasRetry
            ? "После финальной проверки: отреагировавшие — в успех, остальные завершают путь без конверсии."
            : "Отреагировавшие засчитываются в успех, остальные завершают путь без конверсии.",
      ),
    ],
  });

  return stages;
}
