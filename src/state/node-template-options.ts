import type { Channel } from "@/types/campaign";
import type { IvrParams, NodeParams, WorkflowNodeType } from "@/types/workflow";
import type { MessageTemplate } from "./app-state";

/**
 * Строковый kind коммуникационной ноды — вызывающие приходят и с
 * `NodeParams["kind"]` (params самой ноды), и с `WorkflowNodeType` (тип ноды
 * графа, который несёт тег описания — у него params нет, только тип). Для
 * sms/email/push/ivr оба типа используют РОВНО одни и те же строковые
 * литералы, поэтому один справочник обслуживает оба контекста без приведения
 * типов на стороне вызывающего.
 */
type CommKind = NodeParams["kind"] | WorkflowNodeType;

/** Коммуникационные kind нод → канал шаблонов (правка 9: единый источник). */
const KIND_TO_CHANNEL: Partial<Record<CommKind, Channel>> = {
  sms: "sms",
  email: "email",
  push: "push",
  ivr: "ivr",
};

export function channelForNodeKind(kind: CommKind): Channel | undefined {
  return KIND_TO_CHANNEL[kind];
}

/**
 * Шаблоны, доступные ноде данного kind: фильтр по каналу.
 * Единый источник — `app-state.templates` (тот же массив, что карточки Артефактов).
 */
export function templateOptionsForKind(
  templates: MessageTemplate[],
  kind: CommKind
): MessageTemplate[] {
  const channel = channelForNodeKind(kind);
  if (!channel) return [];
  return templates.filter((t) => t.channel === channel);
}

/**
 * Поле params, по которому нода коммуникации привязывается к шаблону
 * библиотеки — единый источник и для текста описания (`graph-description.ts`
 * читает имя шаблона), и для поповера выбора шаблона у тега названия
 * (`description-tag.tsx` пишет через него). Раньше жил приватной картой прямо
 * в `graph-description.ts`; вынесен сюда, когда тот же ключ понадобился и
 * пилюле — чтобы не заводить третью копию (карточка узла графа берёт его
 * иначе, через `NODE_FIELD_EDITABILITY.paramKey`, но значения те же самые).
 */
const TEMPLATE_PARAM_KEY: Partial<Record<CommKind, string>> = {
  sms: "text",
  email: "body",
  push: "body",
};

export function templateParamKeyForKind(kind: CommKind): string | undefined {
  return TEMPLATE_PARAM_KEY[kind];
}

/**
 * Синтетический `MessageTemplate` для предпросмотра сценария IVR-ноды.
 *
 * У sms/email/push поле «Шаблон» — селект из библиотеки `app-state.templates`,
 * поэтому «глаз» открывает предпросмотр по id шаблона. У IVR же поле «Текст» —
 * combo, а сценарий/голос живут ВНУТРИ ноды (без записи в библиотеку). Чтобы
 * «глаз» переиспользовал ТОТ ЖЕ дровер и `IvrRenderer`, оборачиваем текущие
 * параметры ноды в шаблон-однодневку: id косметический (дровер предпочтёт этот
 * объект поиску по библиотеке), канал — «ivr», контент — параметры ноды as is.
 */
export function ivrNodePreviewTemplate(
  nodeId: string,
  params: IvrParams
): MessageTemplate {
  return {
    id: `ivr_node_preview_${nodeId}`,
    channel: "ivr",
    name: "Сценарий звонка",
    content: { kind: "ivr", scenario: params.scenario, voiceType: params.voiceType },
    usedInCampaigns: 0,
  };
}
