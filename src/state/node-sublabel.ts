import type { NodeParams, WorkflowNode } from "@/types/workflow";
import { splitSummary } from "./split-segments";
import { pluralRu } from "@/lib/plural-ru";

/**
 * «Открыто»/«Кликнуто»/«Доставлено» из события-триггера condition (12c).
 *
 * Экспортирована (V-Task 3 review): раньше существовала в приватной копии ЗДЕСЬ
 * и в `node-card-content.tsx` — карточка кампании (`description-tag.tsx`,
 * поповер условия) стала бы третьим потребителем/третьей копией, поэтому обе
 * копии сведены к одной, а `node-card-content.tsx` теперь импортирует отсюда.
 * Единственный источник перевода легаси-кода триггера («opened» → «Открыто») —
 * без него поповер условия показывал бы сырой английский код (баг: расходится
 * с тем же значением на канвасе, который его уже переводил).
 */
export function conditionTriggerLabel(t: string): string {
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

/**
 * Подпись ветки условия для ◈-подзаголовка описания. Отдельна от
 * `conditionTriggerLabel` (та даёт статус ноды на канвасе — «Открыто»), потому
 * что ветке нужна пара «сделал / не сделал», а не состояние.
 */
export function conditionBranchLabel(trigger: string, yes: boolean): string {
  switch (trigger) {
    case "delivered": return yes ? "Доставлено" : "Не доставлено";
    case "not_delivered": return yes ? "Не доставлено" : "Доставлено";
    case "opened": return yes ? "Открыл письмо" : "Не открыл письмо";
    case "not_opened": return yes ? "Не открыл письмо" : "Открыл письмо";
    case "clicked": return yes ? "Нажал ссылку" : "Не нажал ссылку";
    case "not_clicked": return yes ? "Не нажал ссылку" : "Нажал ссылку";
    // События справочника (`eventCatalog`) приходят готовой фразой — отрицание
    // для них не выводится грамматически, поэтому вторая ветка нейтральна.
    default: return yes ? trigger : "Иначе";
  }
}

/** «открыл письмо?» — значение пилюли в «расходится по условию […]». */
export function conditionQuestionLabel(trigger: string): string {
  return `${conditionBranchLabel(trigger, true).toLowerCase()}?`;
}

/**
 * Подзаголовок ноды ожидания в мини-превью графа. Недельная ветка мирроит
 * `waitPhrase` (graph-description.ts) и `splitDuration` (wait-fields.tsx) —
 * та же лестница «крупнейшая точная единица» (168 → 24 → 1). Найдено при
 * проверке fix round 1, Finding 1: мини-превью рендерится на той же карточке
 * кампании, что и пилюля+поповер паузы, и без этой ветки давало ТРЕТЬЕ
 * значение («35 дней») рядом с уже согласованными пилюлей и полем («5
 * недель») — тот же класс бага, просто ещё не названный ревьюером явно.
 */
function waitSublabel(p: Extract<NodeParams, { kind: "wait" }>): string {
  if (p.mode === "until_event") return p.untilEvent ? `До: ${p.untilEvent}` : "До события";
  const h = p.durationHours ?? 0;
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 24) return `${h} ч`;
  if (h >= 168 && h % 168 === 0) {
    const weeks = h / 168;
    return `${weeks} ${pluralRu(weeks, ["неделя", "недели", "недель"])}`;
  }
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
