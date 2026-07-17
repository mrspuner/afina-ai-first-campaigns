import { isCommunicationNode, type NodeParams, type WorkflowEdge, type WorkflowNode } from "@/types/workflow";
import { pluralRu } from "@/lib/plural-ru";
import { CHANNEL_LABEL } from "./channel-nodes";
import { channelForNodeKind, templateOptionsForKind } from "./node-template-options";
import type { MessageTemplate } from "./app-state";

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
}

export type DescriptionStageId = "start" | "first-touch" | "check" | "retry" | "outcome";

export interface DescriptionStage {
  id: DescriptionStageId;
  /** Жирный подзаголовок этапа, вместе с точкой: «Первое касание.» */
  heading: string;
  body: string;
  /** Строки коммуникаций — только у первого касания. */
  messages?: DescriptionMessage[];
}

export interface DescribableGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ── Обход графа ──────────────────────────────────────────────────────────────

/** Обход графа, общий для текстового описания И нодо-блоков коммуникаций
 *  (A2.1 — «Первое касание» карточки кампании): порядок нод, коммуникационные
 *  ноды и множество «первого прохода» (до повтора) вычисляются один раз, чтобы
 *  оба потребителя не могли разойтись в том, что считается первым касанием. */
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

/**
 * Коммуникационные ноды (sms/email/push/ivr) «первого прохода» — те же, что
 * несут строки текста под «Первым касанием» (см. `describeWorkflow`), а НЕ
 * ноды повторного блока за задержкой. Экспортирована для карточки кампании
 * (A2.1): нодо-блоки каналов под «Первым касанием» рендерятся по этому же
 * набору, поэтому текст и блоки не могут разойтись.
 */
export function firstTouchCommunicationNodes(graph: DescribableGraph): WorkflowNode[] {
  if (!graph.nodes.length) return [];
  const { commNodes, isFirstPass } = traverseGraph(graph);
  return commNodes.filter(isFirstPass);
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

/**
 * Ноды в порядке прохода базы: BFS от корней (нод без входящих рёбер) по
 * порядку рёбер. Недостижимые ноды дописываются в исходном порядке — обход не
 * теряет узлы даже на изувеченном вручную графе.
 */
function orderNodes(graph: DescribableGraph, adjacency: Map<string, string[]>): WorkflowNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hasIncoming = new Set(graph.edges.map((e) => e.target));
  const roots = graph.nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);

  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue = roots.length ? [...roots] : graph.nodes.slice(0, 1).map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) ordered.push(node);
    queue.push(...(adjacency.get(id) ?? []));
  }
  for (const node of graph.nodes) if (!seen.has(node.id)) ordered.push(node);
  return ordered;
}

// ── Коммуникации → строка описания ───────────────────────────────────────────

/**
 * Поле params, по которому нода привязывается к шаблону библиотеки — тот же
 * ключ, что использует селект «Шаблон» в карточке ноды
 * (`NODE_FIELD_EDITABILITY`), поэтому имя шаблона в тексте и выбор в UI сходятся.
 */
const TEMPLATE_MATCH_KEY: Partial<Record<NodeParams["kind"], string>> = {
  sms: "text",
  email: "body",
  push: "body",
};

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

function describeMessage(
  node: WorkflowNode,
  templates: MessageTemplate[],
): DescriptionMessage | null {
  const params = node.data.params;
  if (!params) return null;
  const channel = channelForNodeKind(params.kind);
  if (!channel) return null;

  const text = messageText(params).trim();
  if (!text) return null;

  const matchKey = TEMPLATE_MATCH_KEY[params.kind];
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
  };
}

// ── Формулировки ─────────────────────────────────────────────────────────────

/** «2 дня» / «12 часов» / «до наступления события» — из WaitParams. */
function waitPhrase(params: Extract<NodeParams, { kind: "wait" }>): string {
  if (params.mode === "until_event") return "до наступления события";
  const hours = params.durationHours ?? 0;
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
  }
  return `${hours} ${pluralRu(hours, ["час", "часа", "часов"])}`;
}

// ── Сборка описания ──────────────────────────────────────────────────────────

export function describeWorkflow(
  graph: DescribableGraph,
  templates: MessageTemplate[],
): DescriptionStage[] {
  if (!graph.nodes.length) return [];

  const { ordered, commNodes, retryWaits, isFirstPass } = traverseGraph(graph);

  // Параллельные сегменты несут одинаковые касания — схлопываем в строку на
  // канал (дедуп по каналу и тексту, а не по ноде).
  const messages: DescriptionMessage[] = [];
  const seenMessages = new Set<string>();
  for (const node of commNodes.filter(isFirstPass)) {
    const message = describeMessage(node, templates);
    if (!message) continue;
    const key = `${message.channel}|${message.text}`;
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

  stages.push({
    id: "start",
    heading: "Старт.",
    body: hasScoring
      ? "Загруженная база попадает в кампанию и проходит скоринг: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности."
      : "Загруженная база попадает в кампанию: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности.",
  });

  if (messages.length) {
    stages.push({
      id: "first-touch",
      heading: "Первое касание.",
      body: hasSplit
        ? "Аудитория делится на потоки, и каждому уходит своё сообщение:"
        : "Каждому контакту уходит первое сообщение:",
      messages,
    });
  }

  if (messages.length && hasCheck) {
    stages.push({
      id: "check",
      heading: "Проверка реакции.",
      body: multiChannel
        ? "После рассылки система смотрит, кто отреагировал по любому из каналов. Отреагировавшие уходят к результату как успех."
        : "После рассылки система смотрит, кто отреагировал. Отреагировавшие уходят к результату как успех.",
    });
  }

  if (hasRetry) {
    stages.push({
      id: "retry",
      heading: "Пауза и повтор.",
      body: multiChannel
        ? `Тем, кто не отреагировал, кампания выжидает ${waitPhrase(retryParams)} и повторяет ту же серию сообщений по тем же каналам.`
        : `Тем, кто не отреагировал, кампания выжидает ${waitPhrase(retryParams)} и повторяет то же сообщение.`,
    });
  }

  stages.push({
    id: "outcome",
    heading: "Итог.",
    body: !messages.length
      ? "Исходящих коммуникаций нет — на выходе вы получаете готовый сегмент, который можно выгрузить или запустить в другой кампании."
      : hasRetry
        ? "После повтора — финальная проверка: отреагировавшие засчитываются в успех, остальные завершают путь без конверсии."
        : "Отреагировавшие засчитываются в успех, остальные завершают путь без конверсии.",
  });

  return stages;
}
