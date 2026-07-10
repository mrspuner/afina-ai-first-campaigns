import type { NodeParams } from "@/types/workflow";

/**
 * A single editable action for a node type.
 *
 * Each action has:
 *   - a short chipLabel used as the quick-action chip in NodeControlPanel,
 *   - a promptTemplate inserted into the PromptBar when the chip is clicked,
 *   - a parse function that extracts the user value from a prompt segment.
 *
 * The same list drives both the UI hints and the AI-cycle applier —
 * single source of truth.
 */
export interface ParamAction<K extends NodeParams["kind"]> {
  chipLabel: string;
  promptTemplate: string;
  parse: (
    text: string,
    current: Extract<NodeParams, { kind: K }>
  ) => Partial<NodeParams> | null;
  /** Optional fallback sublabel if no dynamic one is computed. */
  sublabelOnApply?: string;
}

type ActionsForAll = {
  [K in NodeParams["kind"]]: ParamAction<K>[];
};

/**
 * Match `key: value` or `key value` in a prompt segment, greedy to end.
 * Returns value trimmed, or null.
 */
function captureAfter(key: string, input: string): string | null {
  const re = new RegExp(`(?:^|\\s)(?:${key})[:\\s]+(.+?)\\s*$`, "i");
  const m = input.match(re);
  return m ? m[1].trim().replace(/[.,;]+$/, "") : null;
}

export const NODE_ACTIONS: ActionsForAll = {
  sms: [
    {
      chipLabel: "Текст",
      promptTemplate: "текст: ",
      sublabelOnApply: "Текст обновлён",
      parse: (t) => {
        const v = captureAfter("текст", t);
        return v ? ({ text: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Alpha-name",
      promptTemplate: "alpha-name: ",
      sublabelOnApply: "Alpha-name обновлён",
      parse: (t) => {
        const v = captureAfter("alpha-name|альфа", t);
        return v ? ({ alphaName: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Ссылка",
      promptTemplate: "ссылка: ",
      sublabelOnApply: "Ссылка добавлена",
      parse: (t) => {
        const v = captureAfter("ссылк[аеу]?", t);
        return v ? ({ link: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Время",
      promptTemplate: "время: ",
      sublabelOnApply: "Время изменено",
      parse: (t) => {
        const v = captureAfter("время|отправк[аи]", t);
        if (!v) return null;
        const val = /сразу|immediate/i.test(v) ? "immediate" : v;
        return { scheduledAt: val } as Partial<NodeParams>;
      },
    },
  ],
  email: [
    {
      chipLabel: "Тема",
      promptTemplate: "тема: ",
      sublabelOnApply: "Тема обновлена",
      parse: (t) => {
        const v = captureAfter("тема|subject", t);
        return v ? ({ subject: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Текст",
      promptTemplate: "текст: ",
      sublabelOnApply: "Тело обновлено",
      parse: (t) => {
        const v = captureAfter("текст|тело|body", t);
        return v ? ({ body: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Отправитель",
      promptTemplate: "отправитель: ",
      sublabelOnApply: "Отправитель обновлён",
      parse: (t) => {
        const v = captureAfter("отправитель|sender", t);
        return v ? ({ sender: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Ссылка",
      promptTemplate: "ссылка: ",
      sublabelOnApply: "Ссылка добавлена",
      parse: (t) => {
        const v = captureAfter("ссылк[аеу]?", t);
        return v ? ({ link: v } as Partial<NodeParams>) : null;
      },
    },
  ],
  push: [
    {
      chipLabel: "Заголовок",
      promptTemplate: "заголовок: ",
      sublabelOnApply: "Заголовок обновлён",
      parse: (t) => {
        const v = captureAfter("заголовок|title", t);
        return v ? ({ title: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Текст",
      promptTemplate: "текст: ",
      sublabelOnApply: "Текст обновлён",
      parse: (t) => {
        const v = captureAfter("текст|body", t);
        return v ? ({ body: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Deeplink",
      promptTemplate: "deeplink: ",
      sublabelOnApply: "Deeplink обновлён",
      parse: (t) => {
        const v = captureAfter("deeplink", t);
        return v ? ({ deeplink: v } as Partial<NodeParams>) : null;
      },
    },
  ],
  ivr: [
    {
      chipLabel: "Сценарий",
      promptTemplate: "сценарий: ",
      sublabelOnApply: "Сценарий обновлён",
      parse: (t) => {
        const v = captureAfter("сценарий", t);
        return v ? ({ scenario: v } as Partial<NodeParams>) : null;
      },
    },
    {
      chipLabel: "Голос",
      promptTemplate: "голос: ",
      sublabelOnApply: "Голос обновлён",
      parse: (t) => {
        const v = captureAfter("голос", t);
        if (!v) return null;
        const l = v.toLowerCase();
        const voiceType = l.startsWith("муж")
          ? "male"
          : l.startsWith("жен")
            ? "female"
            : "neutral";
        return { voiceType } as Partial<NodeParams>;
      },
    },
  ],
  wait: [
    {
      chipLabel: "Длительность",
      promptTemplate: "задержка ",
      // sublabel computed dynamically from amount + unit.
      parse: (t) => {
        const m = t.match(/(\d+)\s*(ч|час|мин|минут|день|дн|дня|дней)/i);
        if (!m) return null;
        const amount = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        let hours = amount;
        if (unit.startsWith("мин")) hours = amount / 60;
        else if (unit.startsWith("д")) hours = amount * 24;
        return { mode: "duration", durationHours: hours } as Partial<NodeParams>;
      },
    },
    {
      chipLabel: "До события",
      promptTemplate: "до события: ",
      sublabelOnApply: "До события",
      parse: (t) => {
        const v = captureAfter("до события", t);
        if (!v) return null;
        return { mode: "until_event", untilEvent: v } as Partial<NodeParams>;
      },
    },
  ],
  condition: [
    {
      chipLabel: "Триггер",
      promptTemplate: "триггер: ",
      parse: (t) => {
        const l = t.toLowerCase();
        if (/не\s+открыл/.test(l)) return { trigger: "not_opened" } as Partial<NodeParams>;
        if (/открыл/.test(l)) return { trigger: "opened" } as Partial<NodeParams>;
        if (/не\s+кликнул/.test(l)) return { trigger: "not_clicked" } as Partial<NodeParams>;
        if (/кликнул/.test(l)) return { trigger: "clicked" } as Partial<NodeParams>;
        if (/не\s+доставил/.test(l)) return { trigger: "not_delivered" } as Partial<NodeParams>;
        if (/доставил/.test(l)) return { trigger: "delivered" } as Partial<NodeParams>;
        return null;
      },
    },
  ],
  split: [
    {
      chipLabel: "По",
      promptTemplate: "по: ",
      sublabelOnApply: "Разделение обновлено",
      parse: (t) => {
        const v = captureAfter("по", t);
        if (!v) return null;
        if (/сегмент/i.test(v)) return { by: "segment" } as Partial<NodeParams>;
        if (/случайн|рандом/i.test(v)) return { by: "random" } as Partial<NodeParams>;
        if (/поровну|равномерн|поделить поровну|equal/i.test(v))
          return { by: "equal" } as Partial<NodeParams>;
        return null;
      },
    },
    {
      chipLabel: "Ветки",
      promptTemplate: "ветки: ",
      sublabelOnApply: "Ветки обновлены",
      parse: (t) => {
        const m = t.match(/ветк[аиу]?[:\s]+(\d+)/i);
        if (!m) return null;
        const n = Math.min(5, Math.max(2, parseInt(m[1], 10)));
        return { branches: n } as Partial<NodeParams>;
      },
    },
  ],
  scoring: [],
  signal: [],
  success: [
    {
      chipLabel: "Цель",
      promptTemplate: "цель: ",
      sublabelOnApply: "Цель обновлена",
      parse: (t) => {
        const v = captureAfter("цель", t);
        return v ? ({ goal: v } as Partial<NodeParams>) : null;
      },
    },
  ],
  end: [
    {
      chipLabel: "Причина",
      promptTemplate: "причина: ",
      sublabelOnApply: "Причина обновлена",
      parse: (t) => {
        const v = captureAfter("причина", t);
        return v ? ({ reason: v } as Partial<NodeParams>) : null;
      },
    },
  ],
};

/**
 * Apply every matching action in order; merge their patches.
 * Returns null if nothing matched.
 */
export function matchActions(
  text: string,
  currentParams: NodeParams
): { paramsPatch: Partial<NodeParams>; appliedSublabels: string[] } | null {
  const actions =
    NODE_ACTIONS[currentParams.kind as NodeParams["kind"]] ?? [];
  const patch: Partial<NodeParams> = {};
  const subs: string[] = [];
  for (const action of actions) {
    const p = (action.parse as (t: string, c: NodeParams) => Partial<NodeParams> | null)(
      text,
      currentParams
    );
    if (p) {
      Object.assign(patch, p);
      if (action.sublabelOnApply) subs.push(action.sublabelOnApply);
    }
  }
  return Object.keys(patch).length > 0
    ? { paramsPatch: patch, appliedSublabels: subs }
    : null;
}
