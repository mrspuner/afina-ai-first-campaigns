import type { Channel } from "@/types/campaign";
import type { IvrParams, NodeParams } from "@/types/workflow";
import type { MessageTemplate } from "./app-state";

/** Коммуникационные kind нод → канал шаблонов (правка 9: единый источник). */
const KIND_TO_CHANNEL: Partial<Record<NodeParams["kind"], Channel>> = {
  sms: "sms",
  email: "email",
  push: "push",
  ivr: "ivr",
};

export function channelForNodeKind(kind: NodeParams["kind"]): Channel | undefined {
  return KIND_TO_CHANNEL[kind];
}

/**
 * Шаблоны, доступные ноде данного kind: фильтр по каналу.
 * Единый источник — `app-state.templates` (тот же массив, что карточки Артефактов).
 */
export function templateOptionsForKind(
  templates: MessageTemplate[],
  kind: NodeParams["kind"]
): MessageTemplate[] {
  const channel = channelForNodeKind(kind);
  if (!channel) return [];
  return templates.filter((t) => t.channel === channel);
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
