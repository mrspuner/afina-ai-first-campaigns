import type { NodeParams, WorkflowNode } from "@/types/workflow";
import { splitSummary } from "./split-segments";
import { pluralRu } from "@/lib/plural-ru";

/** «Открыто»/«Кликнуто»/«Доставлено» из события-триггера condition (12c). */
function conditionTriggerLabel(t: string): string {
  switch (t) {
    case "delivered": return "Доставлено";
    case "not_delivered": return "Не доставлено";
    case "opened": return "Открыто";
    case "not_opened": return "Не открыто";
    case "clicked": return "Кликнуто";
    case "not_clicked": return "Не кликнуто";
    default: return t;
  }
}

function waitSublabel(p: Extract<NodeParams, { kind: "wait" }>): string {
  if (p.mode === "until_event") return p.untilEvent ? `До: ${p.untilEvent}` : "До события";
  const h = p.durationHours ?? 0;
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 24) return `${h} ч`;
  const days = Math.round(h / 24);
  return `${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
}

/**
 * 12c — единый маппер тип→подзаголовок, выводит подзаголовок из контента узла.
 * Возвращает null для типов без содержательного подзаголовка (легаси-ноды
 * попадают сюда только без params и отсеиваются в computeSublabels).
 */
export function computeNodeSublabel(params: NodeParams): string | null {
  switch (params.kind) {
    case "wait": return waitSublabel(params);
    case "condition": return conditionTriggerLabel(params.trigger);
    case "split": return splitSummary(params);
    case "success": return params.goal || "—";
    case "end": return params.reason || "—";
    case "scoring": {
      const i = params.interests.length;
      const t = params.triggers.length;
      return `${i} ${pluralRu(i, ["интерес", "интереса", "интересов"])}`
        + ` · ${t} ${pluralRu(t, ["триггер", "триггера", "триггеров"])}`;
    }
    case "signal": {
      const name = params.fileName?.trim() || "Готовая аудитория";
      return params.count > 0 ? `${name} · ${params.count.toLocaleString("ru-RU")}` : name;
    }
    // Коммуникационные ноды — без подзаголовка: заголовок канала самодостаточен.
    case "sms":
    case "push":
    case "email":
    case "ivr": return null;
    case "statistics": return "Результаты после запуска";
  }
}

/** Пересчитывает data.sublabel из params для каждой ноды (стабильная
 *  идентичность: возвращает ту же ссылку, когда подзаголовок не изменился). */
export function computeSublabels<N extends WorkflowNode>(nodes: N[]): N[] {
  return nodes.map((n) => {
    if (!n.data.params) return n;
    const next = computeNodeSublabel(n.data.params);
    if (next === null) {
      // Тип без подзаголовка (каналы): гасим ранее выставленный, если был.
      if (n.data.sublabel === undefined) return n;
      return { ...n, data: { ...n.data, sublabel: undefined } };
    }
    if (n.data.sublabel === next) return n;
    return { ...n, data: { ...n.data, sublabel: next } };
  });
}
