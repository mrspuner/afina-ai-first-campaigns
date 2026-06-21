import type { SignalType } from "./app-state";
import type { SourceType } from "@/types/campaign";
import type {
  NodeParams,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeType,
  WorkflowNodeData,
} from "@/types/workflow";

export interface Template {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

type NodeExtras = Partial<Pick<WorkflowNodeData, "isSuccess" | "needsAttention">>;

function n(
  id: string,
  label: string,
  nodeType: WorkflowNodeType,
  x: number,
  y: number,
  sublabel?: string,
  extras?: NodeExtras,
  params?: NodeParams
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: { label, nodeType, sublabel, ...extras, ...(params ? { params } : {}) },
  };
}

const EMPTY_SEGMENTS = { max: 0, high: 0, mid: 0, low: 0 };

const EDGE_STYLE = { stroke: "#2a2a2a", strokeWidth: 1.5 };
const LABEL_STYLE = { fill: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: 500 };
const LABEL_BG_STYLE = { fill: "#141414", fillOpacity: 0.92, stroke: "#2a2a2a", strokeWidth: 1 };
const LABEL_BG_PADDING: [number, number] = [4, 2];
const LABEL_BG_BORDER_RADIUS = 4;

function e(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
    style: EDGE_STYLE,
    ...(label
      ? {
          label,
          labelStyle: LABEL_STYLE,
          labelBgStyle: LABEL_BG_STYLE,
          labelBgPadding: LABEL_BG_PADDING,
          labelBgBorderRadius: LABEL_BG_BORDER_RADIUS,
        }
      : {}),
  };
}

const STEP = 210;

function registrationTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Регистрация", undefined,
        { kind: "signal", fileName: "сигнал_регистрация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, "Welcome", undefined,
        { kind: "email", subject: "Добро пожаловать", body: "Мы рады видеть вас в нашем сервисе.", sender: "noreply@brand.com", link: "https://brand.com/welcome" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, "1 день", undefined,
        { kind: "wait", mode: "duration", durationHours: 24 }),
      n("push", "Push", "push", STEP * 3, 0, "Напоминание", undefined,
        { kind: "push", title: "Новости от бренда", body: "Есть что посмотреть", deeplink: "brand://home" }),
      n("success", "Успех", "success", STEP * 4, 0, "Активирован", { isSuccess: true },
        { kind: "success", goal: "Активация" }),
      n("end", "Конец", "end", STEP * 4, 120, "Без конверсии", undefined,
        { kind: "end", reason: "Без активации" }),
    ],
    edges: [
      e("signal", "email"),
      e("email", "wait"),
      e("wait", "push"),
      e("push", "success"),
    ],
  };
}

function firstDealTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Первая сделка", undefined,
        { kind: "signal", fileName: "сигнал_первая-сделка.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("sms", "СМС", "sms", STEP, 0, "Промо", undefined,
        { kind: "sms", text: "Готовы к первой покупке? Подарок внутри.", alphaName: "BRAND", scheduledAt: "immediate", link: "https://brand.com/first" }),
      n("condition", "Условие", "condition", STEP * 2, 0, "Открыл?", undefined,
        { kind: "condition", trigger: "opened" }),
      n("landing", "Лендинг", "landing", STEP * 3, -80, "Покупка", undefined,
        { kind: "landing", cta: "Купить", offerTitle: "Первый оффер" }),
      n("push", "Push", "push", STEP * 3, 80, "Напомни", undefined,
        { kind: "push", title: "Первая сделка", body: "Не пропустите" }),
      n("success", "Успех", "success", STEP * 4, -80, "Конверсия", { isSuccess: true },
        { kind: "success", goal: "Первая покупка" }),
      n("end", "Конец", "end", STEP * 4, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
    ],
    edges: [
      e("signal", "sms"),
      e("sms", "condition"),
      e("condition", "landing", "YES"),
      e("condition", "push", "NO"),
      e("landing", "success"),
      e("push", "end"),
    ],
  };
}

function upsellTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Апсейл", undefined,
        { kind: "signal", fileName: "сигнал_апсейл.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Сплиттер", "split", STEP, 0, "По сегменту", undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("storefront", "Витрина", "storefront", STEP * 2, -120, "Max", undefined,
        { kind: "storefront", offers: ["Оффер А", "Оффер Б"] }),
      n("email", "Email", "email", STEP * 2, -40, "High", undefined,
        { kind: "email", subject: "Персональное предложение", body: "Специально для вас.", sender: "promo@brand.com", link: "https://brand.com/upsell" }),
      n("sms", "СМС", "sms", STEP * 2, 40, "Mid", undefined,
        { kind: "sms", text: "Скидка 20% для вашего сегмента.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("end", "Конец", "end", STEP * 2, 120, "Low", undefined,
        { kind: "end", reason: "Без апсейла" }),
      n("landing", "Лендинг", "landing", STEP * 3, -40, "Оффер", undefined,
        { kind: "landing", cta: "Забрать скидку", offerTitle: "Апсейл" }),
      n("merge", "Слияние", "merge", STEP * 4, -40, undefined, undefined,
        { kind: "merge" }),
      n("success", "Успех", "success", STEP * 5, -40, "Купил", { isSuccess: true },
        { kind: "success", goal: "Апсейл" }),
    ],
    edges: [
      e("signal", "split"),
      e("split", "storefront", "Макс"),
      e("split", "email", "Выс"),
      e("split", "sms", "Ср"),
      e("split", "end", "Низ"),
      e("storefront", "landing"),
      e("email", "landing"),
      e("sms", "landing"),
      e("landing", "merge"),
      e("merge", "success"),
    ],
  };
}

function reactivationTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Реактивация", undefined,
        { kind: "signal", fileName: "сигнал_реактивация.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("wait", "Задержка", "wait", STEP, 0, "3 дня", undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("sms", "СМС", "sms", STEP * 2, 0, "Оффер", undefined,
        { kind: "sms", text: "Мы скучаем, вот скидка 30% для вас.", alphaName: "BRAND", scheduledAt: "immediate" }),
      n("condition", "Условие", "condition", STEP * 3, 0, "Кликнул?", undefined,
        { kind: "condition", trigger: "clicked" }),
      n("landing", "Лендинг", "landing", STEP * 4, -80, "Оффер", undefined,
        { kind: "landing", cta: "Вернуться", offerTitle: "Реактивация" }),
      n("ivr", "Звонок", "ivr", STEP * 4, 80, "Голосовой", undefined,
        { kind: "ivr", scenario: "Возврат", voiceType: "female" }),
      n("success", "Успех", "success", STEP * 5, -80, "Вернулся", { isSuccess: true },
        { kind: "success", goal: "Реактивация" }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Молчание" }),
    ],
    edges: [
      e("signal", "wait"),
      e("wait", "sms"),
      e("sms", "condition"),
      e("condition", "landing", "YES"),
      e("condition", "ivr", "NO"),
      e("landing", "success"),
      e("ivr", "end"),
    ],
  };
}

function returnTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Возврат", undefined,
        { kind: "signal", fileName: "сигнал_возврат.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("email", "Email", "email", STEP, 0, "Напоминание", undefined,
        { kind: "email", subject: "Мы ценим вас", body: "Вернитесь и получите подарок.", sender: "care@brand.com", link: "https://brand.com/return" }),
      n("wait", "Задержка", "wait", STEP * 2, 0, "3 дня", undefined,
        { kind: "wait", mode: "duration", durationHours: 72 }),
      n("push", "Push", "push", STEP * 3, 0, "Усилить", undefined,
        { kind: "push", title: "Подарок ждёт", body: "Загляните в приложение", deeplink: "brand://return" }),
      n("condition", "Условие", "condition", STEP * 4, 0, "Открыл?", undefined,
        { kind: "condition", trigger: "opened" }),
      n("storefront", "Витрина", "storefront", STEP * 5, -80, "Офферы", undefined,
        { kind: "storefront", offers: ["Возврат", "Бонус"] }),
      n("end", "Конец", "end", STEP * 5, 80, undefined, undefined,
        { kind: "end", reason: "Не открыл" }),
      n("success", "Успех", "success", STEP * 6, -80, "Купил", { isSuccess: true },
        { kind: "success", goal: "Возврат" }),
    ],
    edges: [
      e("signal", "email"),
      e("email", "wait"),
      e("wait", "push"),
      e("push", "condition"),
      e("condition", "storefront", "YES"),
      e("condition", "end", "NO"),
      e("storefront", "success"),
    ],
  };
}

function retentionTemplate(): Template {
  return {
    nodes: [
      n("signal", "Сигнал", "source", 0, 0, "Удержание", undefined,
        { kind: "signal", fileName: "сигнал_удержание.json", count: 0, segments: EMPTY_SEGMENTS }),
      n("split", "Сплиттер", "split", STEP, 0, "По сегменту", undefined,
        { kind: "split", by: "segment", branches: 3 }),
      n("ivr", "Звонок", "ivr", STEP * 2, -100, "Персональный", undefined,
        { kind: "ivr", scenario: "Удержание", voiceType: "neutral" }),
      n("email", "Email", "email", STEP * 2, 0, "Дайджест", undefined,
        { kind: "email", subject: "Ваш дайджест", body: "Самое важное за неделю.", sender: "digest@brand.com" }),
      n("push", "Push", "push", STEP * 2, 100, "Напомни", undefined,
        { kind: "push", title: "Не забудьте заглянуть", body: "Есть новое" }),
      n("merge", "Слияние", "merge", STEP * 3, 0, undefined, undefined,
        { kind: "merge" }),
      n("wait", "Задержка", "wait", STEP * 4, 0, "7 дней", undefined,
        { kind: "wait", mode: "duration", durationHours: 168 }),
      n("success", "Успех", "success", STEP * 5, 0, "Активен", { isSuccess: true },
        { kind: "success", goal: "Удержание" }),
    ],
    edges: [
      e("signal", "split"),
      e("split", "ivr", "Выс"),
      e("split", "email", "Ср"),
      e("split", "push", "Низ"),
      e("ivr", "merge"),
      e("email", "merge"),
      e("push", "merge"),
      e("merge", "wait"),
      e("wait", "success"),
    ],
  };
}

export const TEMPLATE_BY_TYPE: Record<SignalType, () => Template> = {
  "Регистрация": registrationTemplate,
  "Первая сделка": firstDealTemplate,
  "Апсейл": upsellTemplate,
  "Реактивация": reactivationTemplate,
  "Возврат": returnTemplate,
  "Удержание": retentionTemplate,
};

/**
 * Splices a `scoring` node between the entry `source` node and its first
 * downstream node. Used for `new`/`stream` sources (spec §3): collected/streamed
 * audiences must be scored before communication. `own` bases are pre-loaded and
 * skip scoring entirely. The scoring node carries no params (no required human
 * field — `nodeNeedsAttention` returns false), so it never blocks launch.
 */
function withScoring(t: Template): Template {
  const entry = t.nodes[0];
  if (!entry) return t;
  const entryId = entry.id;
  const firstEdge = t.edges.find((edge) => edge.source === entryId);
  if (!firstEdge) return t;

  const scoringNode = n(
    "scoring",
    "Скоринг",
    "scoring",
    entry.position.x + STEP,
    entry.position.y,
    "Качество базы"
  );
  // Shift everything to the right of the entry by STEP to make room.
  const shifted = t.nodes.map((nd) =>
    nd.id === entryId
      ? nd
      : { ...nd, position: { ...nd.position, x: nd.position.x + STEP } }
  );
  const edges = t.edges
    .filter((edge) => edge.id !== firstEdge.id)
    .concat([e(entryId, "scoring"), e("scoring", firstEdge.target)]);
  return { nodes: [...shifted, scoringNode], edges };
}

export function createTemplate(
  signalType: SignalType,
  sourceType: SourceType = "new"
): Template {
  const base = TEMPLATE_BY_TYPE[signalType]();
  return sourceType === "own" ? base : withScoring(base);
}
