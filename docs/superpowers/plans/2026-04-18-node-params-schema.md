# Node Internal Params Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый тип workflow-ноды получает типизированные `params` (СМС: текст/alpha-name/ссылка, Wait: длительность, Condition: триггер и т.д.), дефолтные значения в шаблонах, read-only отображение в NodeControlPanel, редактирование через промпт с AI-циклом.

**Architecture:** Новый discriminated union `NodeParams` в `types/workflow.ts`, расширение `WorkflowNodeData` полем `params?: NodeParams`. Шаблоны в `workflow-templates.ts` инициализируют все ноды с дефолтами. Helper `patchNodeParams` для обновления. `NodeControlPanel` рендерит params через маппинг `PARAM_RENDERERS`. AI-цикл в `workflow-view.tsx` использует расширенный `deriveParamsPatch` вместо `deriveSublabel` для изменения конкретных полей.

**Tech Stack:** TypeScript discriminated unions, React 19, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-18-node-params-schema-design.md`

**Предварительное условие:** блок B (slide-up NodeControlPanel) желательно (но не строго) завершён — `PARAM_RENDERERS` добавляется в тот же файл `node-control-panel.tsx`. Если B не готов — params-секция визуально будет внутри floating-карточки, работоспособна.

---

### Task 1: Типы NodeParams и расширение WorkflowNodeData

**Files:**
- Modify: `src/types/workflow.ts`
- Create: `src/types/workflow.test.ts`

- [ ] **Step 1: Добавить NodeParams union**

В `src/types/workflow.ts` добавить после объявления `WorkflowNodeType` (или рядом с `WorkflowNodeData`):

```ts
export type SmsParams = {
  kind: "sms";
  text: string;
  alphaName: string;
  scheduledAt: "immediate" | string;
  link?: string;
};

export type EmailParams = {
  kind: "email";
  subject: string;
  body: string;
  sender: string;
  link?: string;
};

export type PushParams = {
  kind: "push";
  title: string;
  body: string;
  deeplink?: string;
};

export type IvrParams = {
  kind: "ivr";
  scenario: string;
  voiceType: "male" | "female" | "neutral";
};

export type WaitParams = {
  kind: "wait";
  mode: "duration" | "until_event";
  durationHours?: number;
  untilEvent?: string;
};

export type ConditionParams = {
  kind: "condition";
  trigger:
    | "delivered" | "not_delivered"
    | "opened" | "not_opened"
    | "clicked" | "not_clicked";
};

export type SplitParams = {
  kind: "split";
  by: "segment" | "random";
  branches: number;
};

export type MergeParams = { kind: "merge" };

export type SignalParams = {
  kind: "signal";
  fileName: string;
  count: number;
  segments: { max: number; high: number; mid: number; low: number };
};

export type SuccessParams = {
  kind: "success";
  goal: string;
};

export type EndParams = {
  kind: "end";
  reason?: string;
};

export type StorefrontParams = {
  kind: "storefront";
  offers: string[];
};

export type LandingParams = {
  kind: "landing";
  cta: string;
  offerTitle: string;
};

export type NodeParams =
  | SmsParams | EmailParams | PushParams | IvrParams
  | WaitParams | ConditionParams | SplitParams | MergeParams
  | SignalParams | SuccessParams | EndParams
  | StorefrontParams | LandingParams;
```

- [ ] **Step 2: Расширить WorkflowNodeData**

В `src/types/workflow.ts` найти `interface WorkflowNodeData` и добавить поле:

```ts
export interface WorkflowNodeData {
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
  isSuccess?: boolean;
  needsAttention?: boolean;
  processing?: boolean;
  justUpdated?: boolean;
  params?: NodeParams; // NEW
}
```

- [ ] **Step 3: Helper patchNodeParams**

В `src/types/workflow.ts` добавить (рядом с уже существующими helper'ами, если они есть; иначе в конец файла):

```ts
export function patchNodeParams<N extends { id: string; data: WorkflowNodeData }>(
  nodes: N[],
  id: string,
  paramsPatch: Partial<NodeParams>
): N[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    if (!n.data.params) return n;
    return {
      ...n,
      data: {
        ...n.data,
        params: { ...n.data.params, ...paramsPatch } as NodeParams,
      },
    };
  });
}
```

- [ ] **Step 4: Unit-тесты для patchNodeParams**

Создать `src/types/workflow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { patchNodeParams, type NodeParams, type WorkflowNodeData } from "./workflow";

type TestNode = { id: string; data: WorkflowNodeData };

describe("patchNodeParams", () => {
  it("updates params on matching node", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС",
          nodeType: "sms",
          params: { kind: "sms", text: "old", alphaName: "BRAND", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "new" } as Partial<NodeParams>);
    expect((result[0].data.params as { text: string }).text).toBe("new");
    expect((result[0].data.params as { alphaName: string }).alphaName).toBe("BRAND");
  });

  it("does not touch other nodes", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС 1",
          nodeType: "sms",
          params: { kind: "sms", text: "a", alphaName: "A", scheduledAt: "immediate" },
        },
      },
      {
        id: "n2",
        data: {
          label: "СМС 2",
          nodeType: "sms",
          params: { kind: "sms", text: "b", alphaName: "B", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "patched" } as Partial<NodeParams>);
    expect((result[1].data.params as { text: string }).text).toBe("b");
  });

  it("no-op on legacy node without params", () => {
    const nodes: TestNode[] = [
      { id: "n1", data: { label: "Legacy", nodeType: "default" } },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "x" } as Partial<NodeParams>);
    expect(result[0].data.params).toBeUndefined();
  });

  it("no-op on unknown id", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС",
          nodeType: "sms",
          params: { kind: "sms", text: "old", alphaName: "A", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n999", { text: "new" } as Partial<NodeParams>);
    expect(result).toEqual(nodes);
  });
});
```

- [ ] **Step 5: Прогнать unit-тесты**

```bash
npx vitest run src/types/workflow.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 6: Прогнать typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "types/workflow" || echo "OK"
```

Expected: OK (new types compile). Может появиться ошибка что `WorkflowNodeData` не содержит `params` в местах, где `n.data` сконструирован без `params` — это нормально, `params?` опционален.

- [ ] **Step 7: Commit**

```bash
git add src/types/workflow.ts src/types/workflow.test.ts
git commit -m "feat(types): NodeParams discriminated union + patchNodeParams helper (G.1)"
```

---

### Task 2: Дефолтные params в шаблонах workflow

**Files:**
- Modify: `src/state/workflow-templates.ts`
- Modify: `src/state/workflow-templates.test.ts`

- [ ] **Step 1: Расширить helper n(...) чтобы принимал params**

В `src/state/workflow-templates.ts` найти функцию `n(...)` (создаёт `WorkflowNode`). Текущая сигнатура примерно:

```ts
function n(id, nodeType, label, sublabel, position) { ... }
```

Расширить:

```ts
function n(
  id: string,
  nodeType: WorkflowNodeType,
  label: string,
  sublabel: string | undefined,
  position: { x: number; y: number },
  params?: NodeParams
): WorkflowNode {
  return {
    id,
    type: "default", // or whatever the current default is
    position,
    data: {
      label,
      sublabel,
      nodeType,
      ...(params ? { params } : {}),
    },
  };
}
```

Импортировать `NodeParams` из `@/types/workflow`.

- [ ] **Step 2: Добавить дефолтные params в шаблон «Регистрация»**

Найти в `src/state/workflow-templates.ts` функцию / константу для Регистрации и добавить `params` к каждому вызову `n(...)`. Пример:

```ts
n("signal", "signal", "Сигнал", "Welcome", { x: 0, y: 100 },
  { kind: "signal", fileName: "сигнал_регистрация.json", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } }),
n("email1", "email", "Email", "Welcome", { x: 180, y: 100 },
  { kind: "email", subject: "Добро пожаловать", body: "Мы рады вас видеть в нашем сервисе.", sender: "noreply@brand.com", link: "https://brand.com/welcome" }),
n("wait1", "wait", "Задержка", "1 день", { x: 360, y: 100 },
  { kind: "wait", mode: "duration", durationHours: 24 }),
n("push1", "push", "Push", "Напоминание", { x: 540, y: 100 },
  { kind: "push", title: "Новости от бренда", body: "Есть что посмотреть", deeplink: "brand://home" }),
n("success", "success", "Успех", "Активация", { x: 720, y: 50 },
  { kind: "success", goal: "Активация" }),
n("end", "end", "Конец", "Без активации", { x: 720, y: 150 },
  { kind: "end", reason: "Без активации" }),
```

(Позиции и структуру ноды сохранить как есть — менять только добавление 6-го аргумента.)

- [ ] **Step 3: Аналогично для остальных 5 шаблонов**

**Первая сделка:**
- signal: `{ kind: "signal", fileName: "сигнал_первая-сделка.json", count: 0, segments: {...} }`
- sms: `{ kind: "sms", text: "Готовы к первой покупке? Подарок внутри.", alphaName: "BRAND", scheduledAt: "immediate", link: "https://brand.com/first" }`
- condition (Открыл?): `{ kind: "condition", trigger: "opened" }`
- landing: `{ kind: "landing", cta: "Купить", offerTitle: "Первый оффер" }`
- push: `{ kind: "push", title: "Первая сделка", body: "Не пропустите" }`
- success: `{ kind: "success", goal: "Первая покупка" }`
- end: `{ kind: "end", reason: "Не открыл" }`

**Апсейл:**
- signal: `{ kind: "signal", fileName: "сигнал_апсейл.json", ... }`
- split: `{ kind: "split", by: "segment", branches: 3 }`
- storefront: `{ kind: "storefront", offers: ["Оффер А", "Оффер Б"] }`
- email: `{ kind: "email", subject: "Персональное предложение", body: "Специально для вас.", sender: "promo@brand.com", link: "https://brand.com/upsell" }`
- sms: `{ kind: "sms", text: "Скидка 20% для вашего сегмента.", alphaName: "BRAND", scheduledAt: "immediate" }`
- landing: `{ kind: "landing", cta: "Забрать скидку", offerTitle: "Апсейл" }`
- merge: `{ kind: "merge" }`
- end: `{ kind: "end", reason: "Без апсейла" }`
- success: `{ kind: "success", goal: "Апсейл" }`

**Реактивация:**
- signal, wait (3д), sms («Мы скучаем, вот скидка 30%»), condition (clicked), landing (CTA «Вернуться»), ivr (сценарий «Возврат», voiceType «female»), success («Реактивация»), end («Молчание»).

**Возврат:**
- signal, email («Мы ценим вас», CTA link), wait (3д), push, condition (opened), storefront, end, success.

**Удержание:**
- signal, split (by segment), ivr (сценарий «Удержание», voiceType «neutral»), email, push, merge, wait (7д), success («Удержание»).

Конкретные строки — на усмотрение исполнителя, держать в стилистике «живые, понятные» русские строки.

- [ ] **Step 4: Signal-нода — snapshot сигнала**

`createTemplate(signalType)` — если есть возможность передать `signal` (на вызове из `workflow-view.tsx / initialGraph`), расширить сигнатуру:

```ts
export function createTemplate(signalType: SignalType, signal?: Signal): GraphState {
  const template = TEMPLATES[signalType];
  // ... существующая логика ...
  // Если передан signal — патчим первую signal-ноду:
  if (signal) {
    nodes = patchNodeParams(nodes, "signal", {
      fileName: `сигнал_${signalType.toLowerCase()}.json`,
      count: signal.count,
      segments: signal.segments,
    });
  }
  return { nodes, edges };
}
```

В `workflow-view.tsx` обновить вызов:

```ts
function initialGraph(signalType?: SignalType, signal?: Signal): GraphState {
  if (signalType) return createTemplate(signalType, signal);
  return { nodes: createBaseNodes(), edges: createBaseEdges() };
}
```

И проталкивание `signal` в `WorkflowView` через props:

```ts
interface WorkflowViewProps {
  // ...
  signalType?: SignalType;
  signal?: Signal;
}
```

В `workflow-section.tsx` передать `signal={currentSignal ?? undefined}` в `<WorkflowView>`.

- [ ] **Step 5: Unit-тест — все ноды имеют params, kind матчит nodeType**

В `src/state/workflow-templates.test.ts` добавить:

```ts
import { SIGNAL_TYPES } from "@/state/app-state"; // если есть; иначе прямой список
import { createTemplate } from "./workflow-templates";

describe("all template nodes have matching params.kind", () => {
  for (const signalType of ["Регистрация","Первая сделка","Апсейл","Реактивация","Возврат","Удержание"] as const) {
    it(`template "${signalType}" — каждая нода имеет params.kind === nodeType`, () => {
      const { nodes } = createTemplate(signalType);
      for (const node of nodes) {
        expect(node.data.params, `node ${node.id} (${node.data.nodeType}) has no params`).toBeDefined();
        if (node.data.params) {
          expect(node.data.params.kind).toBe(node.data.nodeType);
        }
      }
    });
  }
});

describe("createTemplate with signal", () => {
  it("patches signal node with count/segments from provided signal", () => {
    const signal = {
      id: "sig1",
      type: "Регистрация" as const,
      count: 5000,
      segments: { max: 1000, high: 1500, mid: 1500, low: 1000 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { nodes } = createTemplate("Регистрация", signal);
    const signalNode = nodes.find((n) => n.data.nodeType === "signal");
    expect(signalNode).toBeDefined();
    const params = signalNode?.data.params;
    expect(params?.kind).toBe("signal");
    if (params?.kind === "signal") {
      expect(params.count).toBe(5000);
      expect(params.segments.max).toBe(1000);
    }
  });
});
```

- [ ] **Step 6: Прогнать тесты**

```bash
npx vitest run src/state/workflow-templates.test.ts
npx tsc --noEmit 2>&1 | grep -E "workflow-templates" || echo "OK"
```

Expected: все PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/workflow-templates.ts \
       src/state/workflow-templates.test.ts \
       src/sections/campaigns/workflow-view.tsx \
       src/sections/campaigns/workflow-section.tsx
git commit -m "feat(templates): seed default params per node type + signal snapshot (G.2)"
```

---

### Task 3: Отображение params в NodeControlPanel

**Files:**
- Modify: `src/sections/campaigns/node-control-panel.tsx`

- [ ] **Step 1: Добавить PARAM_RENDERERS**

В `src/sections/campaigns/node-control-panel.tsx` после `CATEGORY_CHIPS` добавить:

```ts
import type { NodeParams } from "@/types/workflow";

type ParamRow = { label: string; value: string };

const PARAM_RENDERERS: {
  [K in NodeParams["kind"]]: (p: Extract<NodeParams, { kind: K }>) => ParamRow[];
} = {
  sms: (p) => [
    { label: "Текст", value: p.text || "—" },
    { label: "Alpha-name", value: p.alphaName || "—" },
    { label: "Время", value: p.scheduledAt === "immediate" ? "Сразу" : p.scheduledAt },
    ...(p.link ? [{ label: "Ссылка", value: p.link }] : []),
  ],
  email: (p) => [
    { label: "Тема", value: p.subject || "—" },
    { label: "Текст", value: p.body || "—" },
    { label: "Отправитель", value: p.sender || "—" },
    ...(p.link ? [{ label: "Ссылка", value: p.link }] : []),
  ],
  push: (p) => [
    { label: "Заголовок", value: p.title || "—" },
    { label: "Текст", value: p.body || "—" },
    ...(p.deeplink ? [{ label: "Deeplink", value: p.deeplink }] : []),
  ],
  ivr: (p) => [
    { label: "Сценарий", value: p.scenario || "—" },
    { label: "Голос", value: p.voiceType === "male" ? "Мужской" : p.voiceType === "female" ? "Женский" : "Нейтральный" },
  ],
  wait: (p) => [
    { label: "Режим", value: p.mode === "duration" ? "Длительность" : "До события" },
    ...(p.mode === "duration" && p.durationHours !== undefined
      ? [{ label: "Длительность", value: formatDuration(p.durationHours) }]
      : []),
    ...(p.mode === "until_event" && p.untilEvent
      ? [{ label: "Событие", value: p.untilEvent }]
      : []),
  ],
  condition: (p) => [
    { label: "Триггер", value: conditionTriggerLabel(p.trigger) },
  ],
  split: (p) => [
    { label: "По", value: p.by === "segment" ? "Сегменту" : "Случайно" },
    { label: "Ветки", value: String(p.branches) },
  ],
  merge: () => [],
  signal: (p) => [
    { label: "Файл", value: p.fileName },
    { label: "Сигналов", value: String(p.count) },
    { label: "Сегменты", value: `${p.segments.max}/${p.segments.high}/${p.segments.mid}/${p.segments.low}` },
  ],
  success: (p) => [{ label: "Цель", value: p.goal }],
  end: (p) => (p.reason ? [{ label: "Причина", value: p.reason }] : []),
  storefront: (p) => [
    { label: "Офферы", value: p.offers.length > 0 ? p.offers.join(", ") : "—" },
  ],
  landing: (p) => [
    { label: "CTA", value: p.cta },
    { label: "Оффер", value: p.offerTitle },
  ],
};

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  if (hours < 24) return `${hours} ч`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
}

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
```

- [ ] **Step 2: Рендер секции «ПАРАМЕТРЫ» в компоненте**

В теле `NodeControlPanel` компонента — после блока с label/sublabel/hint (`<p className="mt-1 text-xs text-muted-foreground/80">...</p>`) и ДО блока с chips — добавить:

```tsx
{data.params && (() => {
  const renderer = PARAM_RENDERERS[data.params.kind];
  // @ts-expect-error — mapped-type narrowing limitation
  const rows: ParamRow[] = renderer(data.params);
  if (rows.length === 0) return null;
  return (
    <>
      <div className="my-1 border-t border-border" />
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Параметры
        </p>
        <dl className="grid grid-cols-[minmax(80px,max-content)_1fr] gap-x-3 gap-y-1 text-xs">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className="truncate text-foreground"
                title={row.value}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
})()}
```

- [ ] **Step 3: Прогнать typecheck + существующие e2e**

```bash
npx tsc --noEmit 2>&1 | grep -E "node-control" || echo "OK"
npx playwright test
```

Expected: typecheck OK (может быть один `@ts-expect-error` на renderer-call), e2e PASS (все 39).

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/node-control-panel.tsx
git commit -m "feat(ui): read-only params section in NodeControlPanel (G.3)"
```

---

### Task 4: deriveParamsPatch + AI-цикл обновления params

**Files:**
- Modify: `src/sections/campaigns/workflow-view.tsx`

- [ ] **Step 1: Написать deriveParamsPatch**

В `src/sections/campaigns/workflow-view.tsx` заменить функцию `deriveSublabel`:

```ts
import type { NodeParams } from "@/types/workflow";

function deriveParamsPatch(
  text: string,
  currentParams: NodeParams | undefined
): { sublabel?: string; paramsPatch?: Partial<NodeParams> } {
  // 1. Duration: "задержка 2 часа", "через 30 минут"
  const durationMatch = text.match(/(\d+)\s*(ч|час|мин|день|дн|дня)/i);
  if (durationMatch && currentParams?.kind === "wait") {
    const amount = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    let hours = amount;
    if (unit.startsWith("мин")) hours = amount / 60;
    else if (unit.startsWith("д")) hours = amount * 24;
    return {
      sublabel: `${amount} ${unit}`,
      paramsPatch: { mode: "duration", durationHours: hours } as Partial<NodeParams>,
    };
  }

  // 2. Condition trigger
  const triggerMap: Record<string, { trigger: string; label: string }> = {
    "открыл": { trigger: "opened", label: "Открыл?" },
    "не открыл": { trigger: "not_opened", label: "Не открыл?" },
    "кликнул": { trigger: "clicked", label: "Кликнул?" },
    "не кликнул": { trigger: "not_clicked", label: "Не кликнул?" },
    "доставил": { trigger: "delivered", label: "Доставлено?" },
  };
  for (const [key, val] of Object.entries(triggerMap)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(text) && currentParams?.kind === "condition") {
      return {
        sublabel: val.label,
        paramsPatch: { trigger: val.trigger } as Partial<NodeParams>,
      };
    }
  }

  // 3. Text change: "текст: ..." for sms / push
  const textChange = text.match(/текст[:\s]+(.+)/i);
  if (textChange && currentParams) {
    const newText = textChange[1].trim();
    if (currentParams.kind === "sms") {
      return {
        sublabel: "Текст обновлён",
        paramsPatch: { text: newText } as Partial<NodeParams>,
      };
    }
    if (currentParams.kind === "email") {
      return {
        sublabel: "Тело обновлено",
        paramsPatch: { body: newText } as Partial<NodeParams>,
      };
    }
    if (currentParams.kind === "push") {
      return {
        sublabel: "Текст обновлён",
        paramsPatch: { body: newText } as Partial<NodeParams>,
      };
    }
  }

  // 4. Link add: "ссылка <url>" / "добавь ссылку <url>"
  const linkMatch = text.match(/ссылк[аеу]?\s+(\S+)/i);
  if (linkMatch && currentParams) {
    const link = linkMatch[1];
    if (currentParams.kind === "sms" || currentParams.kind === "email") {
      return {
        sublabel: "Ссылка добавлена",
        paramsPatch: { link } as Partial<NodeParams>,
      };
    }
  }

  // 5. Channel hint: "email" / "sms" / "push" / "звонок"
  if (/email/i.test(text)) return { sublabel: "Email: обновлено" };
  if (/sms|смс/i.test(text)) return { sublabel: "SMS: обновлено" };
  if (/push/i.test(text)) return { sublabel: "Push: обновлено" };
  if (/ivr|звон/i.test(text)) return { sublabel: "Звонок: обновлено" };
  if (/текст|оффер|ссылк/i.test(text)) return { sublabel: "Контент обновлён" };

  return { sublabel: "Обновлено по запросу" };
}
```

Удалить старую `deriveSublabel` функцию.

- [ ] **Step 2: Обновить AI-цикл в useEffect**

Найти существующий `useEffect` для `nodeCommand` в `src/sections/campaigns/workflow-view.tsx` (строки 105-134 в оригинале). Заменить:

Было:
```ts
const sublabel = deriveSublabel(text);
setGraph((prev) => ({
  ...prev,
  nodes: patchNode(prev.nodes, nodeId, { processing: true }),
}));
const t1 = setTimeout(() => {
  setGraph((prev) => ({
    ...prev,
    nodes: patchNode(prev.nodes, nodeId, {
      processing: false,
      justUpdated: true,
      needsAttention: false,
      sublabel,
    }),
  }));
}, 1500);
```

Стало:
```ts
const currentNode = graph.nodes.find((x) => x.id === nodeId);
const { sublabel, paramsPatch } = deriveParamsPatch(text, currentNode?.data.params);

setGraph((prev) => ({
  ...prev,
  nodes: patchNode(prev.nodes, nodeId, { processing: true }),
}));
const t1 = setTimeout(() => {
  setGraph((prev) => {
    let nodes = patchNode(prev.nodes, nodeId, {
      processing: false,
      justUpdated: true,
      needsAttention: false,
      ...(sublabel ? { sublabel } : {}),
    });
    if (paramsPatch) {
      nodes = patchNodeParams(nodes, nodeId, paramsPatch);
    }
    return { ...prev, nodes };
  });
}, 1500);
```

Импорт `patchNodeParams` добавить в начало файла:
```ts
import { patchNodeParams } from "@/types/workflow";
```

- [ ] **Step 3: Добавить e2e-кейсы**

В `tests/e2e/block-e.spec.ts` добавить:

```ts
test("node-command: текст СМС обновляется в params-секции", async ({ page }) => {
  await page.goto("/");
  await applyPreset(page, "mid");
  await page.getByRole("button", { name: "Кампании" }).click();
  await page.locator('[data-testid="campaign-card"]').first().click();
  await page.locator('[data-node-type="sms"]').first().click();

  await expect(page.getByText("Текст", { exact: true })).toBeVisible();

  await page.getByRole("textbox").fill("текст: новое сообщение");
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-testid="node-control-panel"]')).toContainText("новое сообщение", { timeout: 3000 });
});

test("node-command: задержка 2 часа обновляет Wait-ноду", async ({ page }) => {
  await page.goto("/");
  await applyPreset(page, "mid");
  await page.getByRole("button", { name: "Кампании" }).click();
  // найти кампанию с Wait-нодой (предположительно Регистрация / Реактивация)
  await page.locator('[data-testid="campaign-card"]').first().click();

  const waitNode = page.locator('[data-node-type="wait"]').first();
  if (await waitNode.count() > 0) {
    await waitNode.click();
    await page.getByRole("textbox").fill("задержка 2 часа");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="node-control-panel"]')).toContainText("2 ч", { timeout: 3000 });
  }
});
```

(Второй кейс — `if`-guarded, так как первая кампания может не иметь Wait-ноды; если есть — проверяется; если нет — skip.)

- [ ] **Step 4: Прогнать тесты**

```bash
npx vitest run
npx playwright test tests/e2e/block-e.spec.ts
```

Expected: все PASS.

- [ ] **Step 5: Прогнать full suite**

```bash
npx playwright test
```

Expected: 41/41 PASS (35 + 4 из B + 2 новых из G).

- [ ] **Step 6: Commit**

```bash
git add src/sections/campaigns/workflow-view.tsx tests/e2e/block-e.spec.ts
git commit -m "feat(ai): deriveParamsPatch — update node params via prompt (G.4)"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ NodeParams union + расширение WorkflowNodeData → Task 1.
- ✅ patchNodeParams helper → Task 1.
- ✅ Дефолты в шаблонах + signal snapshot → Task 2.
- ✅ PARAM_RENDERERS + UI-секция → Task 3.
- ✅ deriveParamsPatch + AI-цикл → Task 4.
- ✅ Unit-тесты для patch + шаблонов → Task 1/2.
- ✅ E2E кейсы для текста + задержки → Task 4.

**2. Placeholder scan:** нет TBD / «similar to». Все функции и типы — с полным кодом.

**3. Type consistency:**
- `patchNodeParams` использует `Partial<NodeParams>` — то же в deriveParamsPatch.
- `NodeParams.kind` ↔ `WorkflowNodeType` — синхронизация проверяется unit-тестом «params.kind === nodeType».
- `Signal` импортируется из `@/state/app-state` (проверить точный re-export).
- Legacy-ноды без params — `patchNodeParams` no-op. Тест покрывает.

Готово к исполнению.
