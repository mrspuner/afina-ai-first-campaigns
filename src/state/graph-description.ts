import { isCommunicationNode, type NodeParams, type WorkflowEdge, type WorkflowNode } from "@/types/workflow";
import { pluralRu } from "@/lib/plural-ru";
import { formatRubPlain } from "@/lib/format-rub";
import { CHANNEL_LABEL } from "./channel-nodes";
import { orderNodes } from "./graph-waves";
import {
  channelForNodeKind,
  templateOptionsForKind,
  templateParamKeyForKind,
} from "./node-template-options";
import type { MessageTemplate } from "./app-state";
import type { WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";
import type { DomainStatus } from "@/types/account-settings";
import type { Channel, AnalysisMode } from "@/types/campaign";

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

export interface DescriptionMessage {
  /** Человекочитаемый канал: «SMS», «Email», «Push», «Звонок». */
  channel: string;
  /** Имя шаблона из библиотеки, если params ноды совпали с его контентом. */
  templateName?: string;
  /** Тема письма — фолбэк для email, когда шаблон не резолвится. */
  subject?: string;
  /** Текст сообщения, взятый из params ноды. */
  text: string;
  /** Название шаблона как тег — раскрывает поповер выбора шаблона у пилюли. */
  templateTag?: DescriptionTag;
}

export type DescriptionStageId = "start" | "first-touch" | "check" | "retry" | "outcome";

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
 * иконку показать (STEP_ICON/NODE_ICON) — без неё все демотированные пилюли
 * стали бы одинаковыми серыми табличками (fix round 2, Finding 2).
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

export interface DescriptionStage {
  id: DescriptionStageId;
  /** Жирный подзаголовок этапа, вместе с точкой: «Первое касание.» */
  heading: string;
  body: DescriptionSegment[];
  /** Строки коммуникаций — только у первого касания. */
  messages?: DescriptionMessage[];
}

export interface DescribableGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ── Обход графа ──────────────────────────────────────────────────────────────

/** Обход графа для текстового описания: порядок нод, коммуникационные ноды и
 *  множество «первого прохода» (до повтора) вычисляются один раз. */
interface GraphTraversal {
  ordered: WorkflowNode[];
  commNodes: WorkflowNode[];
  retryWaits: WorkflowNode[];
  isFirstPass: (node: WorkflowNode) => boolean;
}

function traverseGraph(graph: DescribableGraph): GraphTraversal {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source);
    if (list) list.push(edge.target);
    else adjacency.set(edge.source, [edge.target]);
  }

  const ordered = orderNodes(graph, adjacency);
  const commNodes = ordered.filter((n) => isCommunicationNode(n.data.nodeType));

  // «Повтор» — это ноды за задержкой, которая сама стоит ПОСЛЕ коммуникации.
  // Задержка перед первым касанием (её носят легаси-шаблоны) повтором не
  // считается, иначе первое касание осталось бы без текстов.
  const afterAnyComm = reachableFrom(commNodes.map((n) => n.id), adjacency);
  const retryWaits = ordered.filter(
    (n) => n.data.nodeType === "wait" && afterAnyComm.has(n.id),
  );
  const afterRetry = reachableFrom(retryWaits.map((n) => n.id), adjacency);
  const isFirstPass = (node: WorkflowNode) => !afterRetry.has(node.id);

  return { ordered, commNodes, retryWaits, isFirstPass };
}

/** Множество нод, достижимых из `seeds` по рёбрам (сами seeds включены). */
function reachableFrom(seeds: string[], adjacency: Map<string, string[]>): Set<string> {
  const seen = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

// ── Коммуникации → строка описания ───────────────────────────────────────────

/** Цитируемый текст коммуникационной ноды. */
function messageText(params: NodeParams): string {
  switch (params.kind) {
    case "sms": return params.text;
    case "email": return params.body;
    case "push": return params.body;
    case "ivr": return params.scenario;
    default: return "";
  }
}

/**
 * Ключ дедупа коммуникационной ноды — `канал|текст`, единственный источник
 * истины для схлопывания строк текста (`describeWorkflow`): сегментированный
 * сценарий (Апсейл/Удержание — N одинаковых comm-юнитов) даёт РОВНО одну
 * строку на канал, а не N визуально идентичных строк. `null` — канал не
 * резолвится (не comm-нода) или текст пуст (дедупу не подлежит).
 */
function communicationDedupKey(node: WorkflowNode): string | null {
  const params = node.data.params;
  if (!params) return null;
  const channel = channelForNodeKind(params.kind);
  if (!channel) return null;
  const text = messageText(params).trim();
  if (!text) return null;
  return `${CHANNEL_LABEL[channel]}|${text}`;
}

function describeMessage(
  node: WorkflowNode,
  templates: MessageTemplate[],
  withTags: boolean,
  graphEditable: boolean,
): DescriptionMessage | null {
  const params = node.data.params;
  if (!params) return null;
  const channel = channelForNodeKind(params.kind);
  if (!channel) return null;

  const text = messageText(params).trim();
  if (!text) return null;

  const matchKey = templateParamKeyForKind(params.kind);
  const bound = matchKey ? (params as unknown as Record<string, unknown>)[matchKey] : undefined;
  const templateName = matchKey
    ? templateOptionsForKind(templates, params.kind).find(
        (t) => (t.content as unknown as Record<string, unknown>)[matchKey] === bound,
      )?.name
    : undefined;

  return {
    channel: CHANNEL_LABEL[channel],
    ...(templateName ? { templateName } : {}),
    // Тема — фолбэк только для письма без резолвнутого шаблона (спека §3).
    ...(!templateName && params.kind === "email" && params.subject
      ? { subject: params.subject }
      : {}),
    text,
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
            label: templateName ?? "не выбран",
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

  const { ordered, commNodes, retryWaits, isFirstPass } = traverseGraph(graph);

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

  // Параллельные сегменты несут одинаковые касания — схлопываем в строку на
  // канал (дедуп по каналу и тексту, а не по ноде).
  const messages: DescriptionMessage[] = [];
  const seenMessages = new Set<string>();
  for (const node of commNodes.filter(isFirstPass)) {
    const message = describeMessage(node, templates, hasFacts, graphEditable);
    if (!message) continue;
    // Не может быть null здесь: describeMessage вернул сообщение только если
    // канал резолвится и текст непуст — ровно условия communicationDedupKey.
    const key = communicationDedupKey(node)!;
    if (seenMessages.has(key)) continue;
    seenMessages.add(key);
    messages.push(message);
  }

  const hasScoring = ordered.some((n) => n.data.nodeType === "scoring");
  const hasSplit = ordered.some((n) => n.data.nodeType === "split" && isFirstPass(n));
  const hasCheck = ordered.some((n) => n.data.nodeType === "condition" && isFirstPass(n));
  const multiChannel = messages.length > 1;
  const retryParams = retryWaits[0]?.data.params;
  const hasRetry = retryParams?.kind === "wait";

  const stages: DescriptionStage[] = [];

  const startBody = hasScoring
    ? "Загруженная база попадает в кампанию и проходит скоринг: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности."
    : "Загруженная база попадает в кампанию: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности.";

  // Сценарий (личность кампании) читается первым из фактов — прежде чем
  // читатель встретит детали, которые он иначе не может контекстуализировать
  // (review round 1, Finding 2).
  const scenarioSegments: DescriptionSegment[] = facts?.scenarioName !== undefined
    ? [
        t(" Сценарий — "),
        stepTag("start-scenario", facts.scenarioName, "scenario", editableSteps),
        t("."),
      ]
    : [];

  // База и триггеры — ОДНО предложение, а не два: «В работу идёт база на N
  // строк по триггерам X, Y и ещё Z» (review round 1, Finding 2). Единственное
  // / множественное число «по триггеру»/«по триггерам» зависит от того, один
  // триггер или несколько — раньше было захардкожено в множественном числе
  // (Finding 1: «Работает по триггерам Ипотека» на одном триггере — баг).
  const triggersList = facts?.triggers ?? [];
  const hasBase = facts?.baseRows !== undefined;
  const hasTriggers = triggersList.length > 0;

  /** Перечисление тегов триггеров: первые два именем, остаток — схлопка. */
  const triggerTagList = (): DescriptionSegment[] => {
    const [first, second, ...rest] = triggersList;
    const segs: DescriptionSegment[] = [stepTag("start-trigger-0", first, "interests", editableSteps)];
    if (second) {
      segs.push(
        t(rest.length ? ", " : " и "),
        stepTag("start-trigger-1", second, "interests", editableSteps),
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
          rest,
        ),
      );
    }
    return segs;
  };

  const baseTriggerSegments: DescriptionSegment[] = [];
  if (hasBase || hasTriggers) {
    const triggerWord = triggersList.length === 1 ? " по триггеру " : " по триггерам ";
    if (hasBase) {
      baseTriggerSegments.push(
        t(" В работу идёт база на "),
        stepTag(
          "start-base",
          `${facts!.baseRows!.toLocaleString("ru-RU")} строк`,
          "file",
          editableSteps,
        ),
      );
      if (hasTriggers) baseTriggerSegments.push(t(triggerWord), ...triggerTagList());
      baseTriggerSegments.push(t("."));
    } else {
      // Триггеры без известного числа строк — своя формулировка (нет «базы,
      // на которую» ссылаться).
      baseTriggerSegments.push(t(` Отбор идёт${triggerWord}`), ...triggerTagList(), t("."));
    }
  }

  // Режим анализа отсутствует в визарде собственной базы — тогда analysisMode
  // не приходит вовсе, и тег не появляется.
  const modeSegments: DescriptionSegment[] = facts?.analysisMode !== undefined
    ? [
        t(" Режим анализа — "),
        stepTag(
          "start-mode",
          facts.analysisMode === "once" ? "разовый" : "потоковый",
          "analysis",
          editableSteps,
        ),
        t("."),
      ]
    : [];

  // Бюджет переехал сюда из «Итога» (review round 1, Finding 2) — там он был
  // спайкой на конце предложения о конверсии, к которой отношения не имеет;
  // здесь он читается как факт запуска, наравне с базой и режимом. Id
  // `outcome-budget` СТАРШЕ переезда и оставлен как есть — Task 5/6 может
  // ссылаться на него по имени.
  const budgetSegments: DescriptionSegment[] = facts?.budget !== undefined
    ? [
        t(" На кампанию заложено "),
        stepTag("outcome-budget", formatRubPlain(facts.budget), "budget", editableSteps),
        t("."),
      ]
    : [];

  // Детерминированная строка судьбы доменов (Task 11): появляется ТОЛЬКО когда
  // есть pending-домены — граф + статусы решают, LLM тут ни при чём. Домены —
  // тег с целью на поповер модерации, а не сырой текст. Остаётся последней.
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
    heading: "Старт.",
    body: mergeTextSegments([
      t(startBody),
      ...scenarioSegments,
      ...baseTriggerSegments,
      ...modeSegments,
      ...budgetSegments,
      ...domainSegments,
    ]),
  });

  if (messages.length) {
    // Item 3 (финальная полировка): пилюля называет СКОЛЬКО каналов выбрано
    // («3 канала»), а не перечисляет имена внутри себя — имена идут следом
    // обычным текстом. Отдельное предложение-вводная («Выбрано …:») перед
    // существующей фразой про первое касание/деление на потоки — та не
    // трогается (кроме потери своего собственного «по каналам …»).
    const channelsCount = facts?.channels?.length ?? 0;
    const channelsCountTag: DescriptionSegment | null = channelsCount
      ? stepTag(
          "first-touch-channels",
          `${channelsCount} ${pluralRu(channelsCount, ["канал", "канала", "каналов"])}`,
          "channels",
          editableSteps,
        )
      : null;
    const channelNames = facts?.channels?.map((c) => CHANNEL_LABEL[c]).join(", ") ?? "";
    const nextSentence = hasSplit
      ? "Аудитория делится на потоки, и каждому уходит своё сообщение:"
      : "Каждому контакту уходит первое сообщение:";
    const touchBody: DescriptionSegment[] = channelsCountTag
      ? [t("Выбрано "), channelsCountTag, t(`: ${channelNames}. `), t(nextSentence)]
      : [t(nextSentence)];
    stages.push({
      id: "first-touch",
      heading: "Первое касание.",
      body: mergeTextSegments(touchBody),
      messages,
    });
  }

  if (messages.length && hasCheck) {
    stages.push({
      id: "check",
      heading: "Проверка реакции.",
      body: [
        t(
          multiChannel
            ? "После рассылки система смотрит, кто отреагировал по любому из каналов. Отреагировавшие уходят к результату как успех."
            : "После рассылки система смотрит, кто отреагировал. Отреагировавшие уходят к результату как успех.",
        ),
      ],
    });
  }

  if (hasRetry) {
    const retryPrefix = "Тем, кто не отреагировал, кампания выжидает ";
    const retrySuffix = multiChannel
      ? " и повторяет ту же серию сообщений по тем же каналам."
      : " и повторяет то же сообщение.";
    stages.push({
      id: "retry",
      heading: "Пауза и повтор.",
      // Пауза — тег с целью node-fields на саму ноду ожидания, пока граф
      // правится (§2.12: после запуска — та же демоция в `none`, что и у
      // шаблона, с тем же переносом nodeId ради иконки — fix round 2,
      // Finding 2). Без фактов (hasFacts=false) остаётся прежним единым
      // текстом Task 3.
      body: hasFacts
        ? mergeTextSegments([
            t(retryPrefix),
            {
              kind: "tag",
              tag: {
                id: "retry-wait",
                label: waitPhrase(retryParams),
                target: graphEditable
                  ? { kind: "node-fields", nodeId: retryWaits[0].id }
                  : { kind: "none", nodeId: retryWaits[0].id },
              },
            },
            t(retrySuffix),
          ])
        : [t(`${retryPrefix}${waitPhrase(retryParams)}${retrySuffix}`)],
    });
  }

  // «Итог» — снова только про исход конверсии (review round 1, Finding 2:
  // бюджет переехал в «Старт», сюда его больше не сплавляем).
  stages.push({
    id: "outcome",
    heading: "Итог.",
    body: [
      t(
        !messages.length
          ? "Исходящих коммуникаций нет — на выходе вы получаете готовый сегмент, который можно выгрузить или запустить в другой кампании."
          : hasRetry
            ? "После повтора — финальная проверка: отреагировавшие засчитываются в успех, остальные завершают путь без конверсии."
            : "Отреагировавшие засчитываются в успех, остальные завершают путь без конверсии.",
      ),
    ],
  });

  return stages;
}
