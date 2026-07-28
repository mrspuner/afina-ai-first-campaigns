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
 * Синтетический `MessageTemplate` для предпросмотра сценария IVR-ноды.
 *
 * Было нужно, пока у IVR не было своей библиотеки: поле «Текст» было combo
 * (сценарий/голос жили ВНУТРИ ноды, без записи в библиотеку), и «глаз»
 * предпросмотра оборачивал ТЕКУЩИЕ параметры ноды в шаблон-однодневку, чтобы
 * переиспользовать тот же дровер и `IvrRenderer`, что и sms/email/push.
 *
 * После фикса (IVR получила реальные библиотечные шаблоны и поле «Текст»
 * стало «Шаблон» — тем же control:"template", что у остальных трёх каналов)
 * этот путь в продакшн-коде больше не задействован: «глаз» селекта шаблонов
 * теперь всегда резолвит id из библиотеки, как и у sms/email/push (см.
 * `node-card-content.tsx`, ветка `control === "template"`). Функция оставлена
 * экспортированной и покрытой тестом — небольшая самодостаточная утилита,
 * которую нет смысла удалять по одной лишь догадке, что она больше никогда не
 * понадобится (например, узлу с сценарием вне библиотеки, если такой сценарий
 * снова появится).
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
