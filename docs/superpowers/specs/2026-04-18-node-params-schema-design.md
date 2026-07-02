# Node Internal Params Schema — Design

**Дата:** 2026-04-18
**Скоуп:** Блок G — внутренние параметры нод workflow.
**Статус:** design (pre-plan)

## Цель

Добавить типизированные параметры внутрь каждой ноды workflow так, чтобы:

1. Каждый тип ноды (13 активных типов) получил свою параметризованную схему (СМС: текст / alpha-name / ссылка; Wait: длительность; Condition: триггер + инверсия; и т.д.).
2. Шаблоны workflow (`workflow-templates.ts`) сразу создавали ноды с дефолтными параметрами.
3. `NodeControlPanel` (интегрированный в PromptBar после B2) отображал параметры **read-only** — как компактный список key-value.
4. Редактирование параметров — **через промпт** с AI-циклом (текущий механизм `workflow_node_command_submit` + `deriveSublabel` расширяется до изменения конкретных полей `params`).

Пользовательское поведение workflow не меняется на уровне навигации / рендеринга графа; обогащается только содержимое каждой ноды.

## Что уже есть (переиспользуем)

- `src/types/workflow.ts` — `WorkflowNodeType` (discriminated enum), `WorkflowNodeData` (с `label`, `sublabel`, `nodeType`, `isSuccess`, `needsAttention`, `processing`, `justUpdated`). Расширяем `WorkflowNodeData` новым полем `params`.
- `src/state/workflow-templates.ts` — 6 шаблонов по `SignalType`, helper `n(...)` для создания ноды. Правим helper чтобы принимал `params`.
- `src/sections/campaigns/node-control-panel.tsx` — после B2 это slide-up панель в PromptBar. Добавляем секцию «Параметры» ниже label/sublabel.
- `src/sections/campaigns/workflow-view.tsx` — AI-цикл (`nodeCommand` → `processing` → `justUpdated`). Расширяем `deriveSublabel` до `deriveParamsPatch` — возвращает частичный patch над `params`, а не только строку sublabel.
- `src/types/workflow.ts` — `parseWorkflowCommand` / `patchNode` для локальных патчей графа. Добавляем `patchNodeParams`.

## Модель данных

### Базовая структура

Добавляем discriminated union `NodeParams` в `src/types/workflow.ts`:

```ts
export type SmsParams = {
  kind: "sms";
  text: string;
  alphaName: string;
  scheduledAt: "immediate" | string; // ISO
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
  scenario: string; // id или название сценария
  voiceType: "male" | "female" | "neutral";
};

export type WaitParams = {
  kind: "wait";
  mode: "duration" | "until_event";
  durationHours?: number;         // для mode="duration"
  untilEvent?: string;            // для mode="until_event"
};

export type ConditionParams = {
  kind: "condition";
  trigger: "delivered" | "not_delivered" | "opened" | "not_opened" | "clicked" | "not_clicked";
};

export type SplitParams = {
  kind: "split";
  by: "segment" | "random";
  branches: number; // 2 или 3
};

export type MergeParams = { kind: "merge" };

export type SignalParams = {
  kind: "signal";
  fileName: string;    // "сигнал_<тип>.json"
  count: number;
  segments: { max: number; high: number; mid: number; low: number };
};

export type SuccessParams = {
  kind: "success";
  goal: string; // "Конверсия", "Покупка", "Подписка"
};

export type EndParams = {
  kind: "end";
  reason?: string; // "Без конверсии" | "Не ответил"
};

export type StorefrontParams = {
  kind: "storefront";
  offers: string[]; // id/названия лендингов
};

export type LandingParams = {
  kind: "landing";
  cta: string; // "Купить", "Подписаться", "Забрать"
  offerTitle: string;
};

export type NodeParams =
  | SmsParams | EmailParams | PushParams | IvrParams
  | WaitParams | ConditionParams | SplitParams | MergeParams
  | SignalParams | SuccessParams | EndParams
  | StorefrontParams | LandingParams;
```

Legacy типы (`default / channel / retarget / result / new`) остаются БЕЗ params — их `params` опционален (`params?: NodeParams`).

### Интеграция с WorkflowNodeData

`WorkflowNodeData` (из `src/types/workflow.ts`) расширяется:

```ts
export interface WorkflowNodeData {
  // существующие:
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
  isSuccess?: boolean;
  needsAttention?: boolean;
  processing?: boolean;
  justUpdated?: boolean;
  // НОВОЕ:
  params?: NodeParams;
}
```

`params.kind` должен матчить `nodeType` (инвариант). Legacy-типы могут идти без `params`.

**Инвариант:** `data.params?.kind === data.nodeType` или `data.params === undefined`. Unit-тест обеспечивает.

## Дефолтные значения в шаблонах

Каждая нода в `workflow-templates.ts` получает `params` с разумными дефолтами. Примеры для шаблона «Регистрация»:

| Нода | params |
|---|---|
| Сигнал | `{ kind: "signal", fileName: "сигнал_регистрация.json", count: <из signal>, segments: <из signal> }` |
| Email | `{ kind: "email", subject: "Добро пожаловать", body: "Мы рады вас видеть...", sender: "noreply@brand.com", link: "https://brand.com/welcome" }` |
| Задержка | `{ kind: "wait", mode: "duration", durationHours: 24 }` |
| Push | `{ kind: "push", title: "Новости от бренда", body: "Узнай что нового" }` |
| Успех | `{ kind: "success", goal: "Активация" }` |
| Конец | `{ kind: "end", reason: "Без активации" }` |

Аналогично — для остальных 5 шаблонов. Дефолты подбираются **под контекст signal-type**: Регистрация → «Добро пожаловать», Реактивация → «Мы скучаем», и т.п.

**Важно:** helper `n(id, type, label, sublabel, position)` в `workflow-templates.ts` расширяется до принимающего `params` как 6-й аргумент (опциональный). Существующий вызовной код добавляет params per-call.

### Signal-нода — динамические params

У Signal-ноды `count` и `segments` берутся из привязанного `signal` (не из шаблона). Решение: `createTemplate(signalType, signal?)` принимает опциональный `Signal` и подставляет его параметры в первую ноду. Если `signal === undefined` (graph создаётся без привязанного сигнала, например, через `campaign_from_signal`) — передаётся snapshot на момент создания.

## UI — отображение параметров

### В NodeControlPanel (после B2)

Секция «Параметры» добавляется в slide-up панель после блока с label/sublabel + выше чипов:

```
┌────────────────────────────────────┐
│ [СМС] @СМС · communication · id:n2 │
│ СМС                                │
│ Mid segment messaging              │
│ Изменить через промпт ниже.        │
│ ──────────────────────────────────  │
│ ПАРАМЕТРЫ                          │
│ Текст:         Привет, у нас оффер │
│ Alpha-name:    BRAND               │
│ Время:         Сразу               │
│ Ссылка:        brand.com/promo     │
│ ──────────────────────────────────  │
│ [Изменить текст] [Добавить ссылку] │
└────────────────────────────────────┘
```

Рендеринг key-value:

- Маппинг `kind → Array<{label, value}>` в `node-control-panel.tsx` (константа `PARAM_RENDERERS`).
- Каждый renderer получает `params` конкретного типа и возвращает `Array<{label: string; value: string}>`.
- Для `SmsParams`:
  ```ts
  sms: (p) => [
    { label: "Текст", value: p.text || "—" },
    { label: "Alpha-name", value: p.alphaName || "—" },
    { label: "Время", value: p.scheduledAt === "immediate" ? "Сразу" : formatDate(p.scheduledAt) },
    ...(p.link ? [{ label: "Ссылка", value: p.link }] : []),
  ]
  ```
- Значения `truncate` (ellipsis) на длинном тексте, полная версия — в `title` атрибуте (tooltip на hover).

### Read-only, не редактируемое

Пользователь НЕ может кликнуть/отредактировать поле напрямую. Edit — только через промпт. Подсказка «Изменить через промпт ниже» уже есть в текущей панели, остаётся.

## AI-цикл — расширение

Сейчас в `workflow-view.tsx::deriveSublabel(text)` возвращает строку для `sublabel` patch'а. Расширяем до `deriveParamsPatch(text, currentParams): { sublabel?: string; paramsPatch?: Partial<NodeParams> }`.

### Примеры mapping'а

| Пользовательский текст | Patch |
|---|---|
| «поменяй СМС на Email» | `paramsPatch: { kind: "email", subject: "Новое предложение", body: "—", sender: "—" }` + изменение nodeType (сложнее — out of scope MVP) |
| «текст: привет у нас скидка 20%» | `paramsPatch: { text: "привет у нас скидка 20%" }` (для SMS); `sublabel: "Текст обновлён"` |
| «задержка 2 часа» | `paramsPatch: { mode: "duration", durationHours: 2 }` (для Wait); `sublabel: "2 часа"` |
| «триггер открыл» | `paramsPatch: { trigger: "opened" }` (для Condition); `sublabel: "Открыл?"` |
| «добавь ссылку brand.com/promo» | `paramsPatch: { link: "https://brand.com/promo" }` (для SMS / Email); `sublabel: "Ссылка добавлена"` |

Логика парсинга — расширяется постепенно. Для MVP реализуем 4-5 основных паттернов (text, duration, trigger, link). Неопознанные команды — fallback на текущий `deriveSublabel` без params-patch.

### Patch-механика

```ts
function patchNodeParams(
  nodes: WorkflowNode[],
  id: string,
  paramsPatch: Partial<NodeParams>
): WorkflowNode[] {
  return nodes.map(n => {
    if (n.id !== id) return n;
    if (!n.data.params) return n; // legacy node без params — skip
    return {
      ...n,
      data: {
        ...n.data,
        params: { ...n.data.params, ...paramsPatch } as NodeParams
      }
    };
  });
}
```

Вызов внутри AI-цикла в `workflow-view.tsx` — после `processing: true` и до `justUpdated: true`.

## Что НЕ делаем в этом блоке

- Смена типа ноды через промпт (например, «поменяй СМС на Email») — требует пересоздания node + edges.
- Inline-редактирование параметров в UI (клик → форма).
- Persistence (сохранение параметров в `Campaign.workflow`) — остаётся in-memory. Для workflow-to-state см. Block H (если будет).
- Валидация параметров перед запуском кампании — текущий `validateWorkflow` проверяет только структуру графа. Расширение до валидации params (например, «SMS.text не пустой») — future work.

## Структура файлов

**Модифицируется:**
- `src/types/workflow.ts` — добавить `NodeParams` union, расширить `WorkflowNodeData`, helper `patchNodeParams`.
- `src/state/workflow-templates.ts` — helper `n(...)` принимает `params`, все 6 шаблонов получают дефолтные params per-node.
- `src/state/workflow-templates.test.ts` — unit-тест: все ноды в шаблонах имеют `params`, `params.kind === nodeType`.
- `src/sections/campaigns/node-control-panel.tsx` — секция «Параметры» с `PARAM_RENDERERS`.
- `src/sections/campaigns/workflow-view.tsx` — `deriveSublabel` → `deriveParamsPatch`, применение `paramsPatch` через `patchNodeParams`.
- `tests/e2e/block-e.spec.ts` — дополнить кейсы: изменение текста СМС через промпт проверяет обновление отображения в params-секции.

**Новых файлов нет.**

## Тесты

**Unit (vitest):**

1. `src/types/workflow.test.ts` (новый или расширение существующего):
   - `patchNodeParams` обновляет params только целевой ноды.
   - `patchNodeParams` на legacy-ноде без `params` — no-op.
   - Type invariant: `params.kind === nodeType` после patch'а.

2. `src/state/workflow-templates.test.ts`:
   - Каждая нода в каждом шаблоне имеет `params`.
   - `params.kind` соответствует `nodeType`.
   - Signal-нода получает динамические `count` и `segments` если передан `signal` в `createTemplate`.

**E2E (playwright):**

3. `tests/e2e/block-e.spec.ts` расширение:
   - При клике на СМС-ноду в slide-up панели виден блок «ПАРАМЕТРЫ» с полями Текст / Alpha-name / Время.
   - После промпта «текст: новое сообщение» поле «Текст» в панели обновляется.
   - После промпта «задержка 2 часа» на Wait-ноде поле «Длительность» показывает «2 ч».

## Open Questions / Risk Mitigation

- **Риск:** Signal-нода params динамические (`count`, `segments` из `signal`), но `signal` может смениться (рестарт на другой signal). **Mitigation:** при `campaign_from_signal` или `campaign_selected` — снимок `signal` попадает в `SignalParams` на момент создания. Последующие изменения signal'а не ретроактивны. Документируем в коде.
- **Риск:** `deriveParamsPatch` regex-парсер хрупок. **Mitigation:** MVP покрывает 5-6 паттернов; остальное — fallback на sublabel-only (текущее поведение). Постепенно расширяем.
- **Риск:** Объём UI в slide-up панели растёт (особенно у Email с body). **Mitigation:** `truncate` + tooltip на полное значение; длинные значения (>60 символов) показываем как «Показать полный текст» с expand.

## Порядок имплементации (для будущего plan)

1. Типы: `NodeParams` union в `types/workflow.ts`, расширение `WorkflowNodeData`, helper `patchNodeParams` + unit-тесты.
2. Шаблоны: helper `n(...)` принимает `params`; все 6 шаблонов обновлены с дефолтными params. Signal-нода — через `createTemplate(type, signal?)`. Unit-тесты.
3. UI: `PARAM_RENDERERS` в `NodeControlPanel`, секция «ПАРАМЕТРЫ».
4. AI: `deriveParamsPatch`, применение `patchNodeParams` в AI-цикле. 5-6 паттернов (text, duration, trigger, link, subject).
5. E2E: 3 новых кейса в `block-e.spec.ts`.

План пишется отдельным документом: `docs/superpowers/plans/2026-04-18-node-params-schema.md`.
