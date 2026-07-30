import type { Channel } from "@/types/campaign";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";
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
  // Fix: ivr раньше не имело записи здесь вовсе — «Шаблон» этого канала не мог
  // резолвиться ни при каких обстоятельствах, потому что не было ключа, по
  // которому сравнивать params ноды с содержимым библиотеки (см. ivr-запись в
  // NODE_FIELD_EDITABILITY — теперь тоже control:"template", как у остальных
  // трёх каналов).
  ivr: "scenario",
};

export function templateParamKeyForKind(kind: CommKind): string | undefined {
  return TEMPLATE_PARAM_KEY[kind];
}

/**
 * Синтетический `MessageTemplate` из ТЕКУЩИХ params коммуникационной ноды —
 * предпросмотр, когда шаблон библиотеки не резолвится («не выбран»). Обобщение
 * снятой `ivrNodePreviewTemplate` на все четыре канала.
 *
 * `usedInCampaigns: 1` — не факт об использовании, а способ сказать дроверу
 * «только просмотр»: у синтетического шаблона нет записи в библиотеке, и
 * «Сохранить» ушло бы в `template_content_updated` с несуществующим id, молча
 * потеряв правку.
 */
export function nodePreviewTemplate(nodeId: string, params: NodeParams): MessageTemplate | null {
  const channel = channelForNodeKind(params.kind);
  if (!channel) return null;
  const name =
    params.kind === "email" ? params.subject || "Письмо"
    : params.kind === "push" ? params.title || "Push"
    : params.kind === "ivr" ? "Сценарий звонка"
    : "SMS";
  return { id: `node_preview_${nodeId}`, channel, name, content: params, usedInCampaigns: 1 };
}
