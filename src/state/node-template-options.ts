import type { Channel } from "@/types/campaign";
import type { NodeParams } from "@/types/workflow";
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
