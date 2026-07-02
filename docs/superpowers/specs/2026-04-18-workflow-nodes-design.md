# Block D — Workflow Nodes + Visual States (design spec)

**Source:** `docs/2026-04-18-ui-improvements.md` → раздел «Доступные ноды» + «Состояния ноды» + «Шаблон workflow по типу сигнала».

**Goal:** Canvas получает полный каталог типов нод, 6 предзаданных шаблонов workflow (по одному на тип сигнала), и визуальные состояния нод (idle / selected / needs-attention / processing / just-updated / ready). Шаблон выбирается автоматически при открытии/создании кампании по `signal.type`.

## 1. Reusable (прежде чем добавлять новое)

- `WorkflowNode`, `WorkflowEdge`, `WorkflowNodeData` (`src/types/workflow.ts`) — расширяем, не переписываем.
- `createBaseNodes` / `createBaseEdges` / `parseWorkflowCommand` — легаси, кидаем за `/workflow-templates/base.ts`, остальной код продолжает работать.
- `WorkflowNodeComponent` (`src/sections/campaigns/workflow-node.tsx`) — расширяем рендер; `motion.div` и `Handle` из `@xyflow/react` остаются.
- `SignalType` enum (`src/state/app-state.ts`) — six значений, используем как ключ template-mapping.
- `validateWorkflow` (`src/state/workflow-validation.ts`) — уже поддерживает `needsAttention`/`isSuccess`, работает без изменений.
- `WorkflowSection` → `WorkflowView` — принимает `signalName`, начнёт принимать `signalType`.

## 2. Scope

**In:**
- Расширенный `WorkflowNodeType` (13 типов, см. §3.1).
- Новые состояния на `WorkflowNodeData`: `processing?: boolean`, `justUpdated?: boolean` (дефолт false). `needsAttention`, `isSuccess` — уже добавлены в C.
- Цветовая/иконочная схема рендера per node type.
- Стили-оверлеи per state (selected/needsAttention/processing/justUpdated/ready).
- 6 шаблонов `createTemplate(signalType)` — по одному на `SignalType`.
- Auto-selection шаблона в `WorkflowView` при первом mount для campaign.signalId → signal.type.
- Сохранение обратной совместимости с `parseWorkflowCommand` (работает на legacy ids; при необходимости добавим парсинги для новых типов — TBD per case).

**Out (в Block E):**
- Форма параметров ноды при клике.
- Промпт-бар @тег, AI-цикл, триггеры processing/justUpdated.
- Перегенерация шаблона AI.

## 3. Type system

### 3.1 `WorkflowNodeType`

```ts
export type WorkflowNodeType =
  // Endpoints
  | "signal"     // Входная нода (signal + сегменты)
  | "success"    // Успех
  | "end"        // Конец
  // Logic / Flow
  | "split"      // Сплиттер
  | "wait"       // Wait (задержка)
  | "condition"  // If / Branch
  | "merge"      // Merge
  // Communication (активные)
  | "sms"
  | "email"
  | "push"
  | "ivr"
  // Web / passive
  | "storefront" // Витрина
  | "landing"    // Лендинг
  // Back-compat (Block A-C legacy shape)
  | "default"
  | "channel"
  | "retarget"
  | "result"
  | "new";
```

Legacy types остаются в union — базовый граф и `parseWorkflowCommand` их используют. Новые templates используют new names; миграция постепенная.

### 3.2 `WorkflowNodeData`

```ts
export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  nodeType: WorkflowNodeType;
  needsAttention?: boolean;
  isSuccess?: boolean;
  processing?: boolean;
  justUpdated?: boolean;
}
```

### 3.3 Категории

```ts
export type NodeCategory = "endpoint" | "logic" | "communication" | "web" | "legacy";

export const NODE_CATEGORY: Record<WorkflowNodeType, NodeCategory> = {
  signal: "endpoint", success: "endpoint", end: "endpoint",
  split: "logic", wait: "logic", condition: "logic", merge: "logic",
  sms: "communication", email: "communication", push: "communication", ivr: "communication",
  storefront: "web", landing: "web",
  default: "legacy", channel: "legacy", retarget: "legacy", result: "legacy", new: "legacy",
};

export function isCommunicationNode(t: WorkflowNodeType) {
  return NODE_CATEGORY[t] === "communication";
}
```

`isCommunicationNode` потребуется в E для проверки «все communication-ноды заполнены».

## 4. Rendering

`WorkflowNodeComponent` перерисовывается:

- Цвет рамки и фона по типу (палитра см. ниже).
- Иконка сверху-слева (Lucide) per type: `signal → SignalLow`, `split → GitFork`, `wait → Clock`, `condition → GitBranch`, `merge → Merge`, `sms → MessageSquare`, `email → Mail`, `push → Smartphone`, `ivr → Phone`, `storefront → Store`, `landing → Layout`, `success → CheckCircle`, `end → X`.
- Если `selected` (из ReactFlow NodeProps) → синяя подсветка рамки (см. §5).
- Если `needsAttention` → оранжевая пульсирующая рамка.
- Если `processing` → вращающаяся рамка (css-grad).
- Если `justUpdated` → 1.2s зелёная вспышка (css keyframes).
- Если `isSuccess` или `!needsAttention && !processing && !justUpdated` — decorative зелёная точка в углу как «ready» (опционально; показываем только если нода не требует внимания и у неё есть sublabel).

### Палитра (`STYLES` map)

| Type        | border   | bg       | color    | icon         |
|-------------|----------|----------|----------|--------------|
| signal      | #1e3a8a  | #050815  | #93c5fd  | SignalLow    |
| success     | #14532d  | #030d06  | #4ade80  | CheckCircle2 |
| end         | #374151  | #0a0a0a  | #9ca3af  | CircleStop   |
| split       | #4c1d95  | #0d0819  | #a78bfa  | GitFork      |
| wait        | #713f12  | #0f0a03  | #fbbf24  | Clock        |
| condition   | #065f46  | #052e23  | #34d399  | GitBranch    |
| merge       | #3730a3  | #0a0920  | #818cf8  | Merge        |
| sms         | #134e4a  | #030f0e  | #5eead4  | MessageSquare|
| email       | #155e75  | #03141a  | #67e8f9  | Mail         |
| push        | #1e40af  | #050c1e  | #93c5fd  | Bell         |
| ivr         | #6d28d9  | #0e051b  | #c4b5fd  | Phone        |
| storefront  | #9a3412  | #1a0806  | #fb923c  | Store        |
| landing     | #b45309  | #1a0f03  | #fbbf24  | Layout       |

Легаси-типы оставляют старые стили (перемапятся на ближайший новый: `channel → sms`, `retarget → condition`, `result → success`, `new → (highlight)`, `default → signal`).

## 5. Visual states

CSS keyframes встраиваем локально в `workflow-node.tsx`:

```css
@keyframes wf-needs-attention {
  0%,100% { box-shadow: 0 0 0 0 rgba(251,146,60,0.4); }
  50%     { box-shadow: 0 0 0 6px rgba(251,146,60,0);  }
}
@keyframes wf-processing {
  from { background-position: 0% 50%; }
  to   { background-position: 100% 50%; }
}
@keyframes wf-just-updated {
  0%   { box-shadow: 0 0 0 2px rgba(74,222,128,0.9); }
  100% { box-shadow: 0 0 0 2px rgba(74,222,128,0);   }
}
```

Применение — через className/style:
- selected: добавляем `outline: 2px solid #3b82f6; outline-offset: 2px;`.
- needsAttention: анимация `wf-needs-attention 1.4s infinite` + рамка оранжевая.
- processing: градиентная рамка-контур через `border-image` + анимация `wf-processing 1.2s linear infinite`.
- justUpdated: animation `wf-just-updated 1.2s ease-out` без loop.
- ready — зелёная точка 6×6 position:absolute top-1 right-1 с bg-#4ade80.

## 6. Templates

`src/state/workflow-templates.ts`:

```ts
import type { SignalType } from "./app-state";
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from "@/types/workflow";

export interface Template {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function createTemplate(signalType: SignalType): Template { ... }
```

Шаблоны (каждый ≤10 нод; id'ы префиксуем чтобы не конфликтовать с parseWorkflowCommand legacy):

### Регистрация
`signal` → `email`(Welcome) → `wait`(1d) → `push`(Напомни) → `success`(Активирован) + `end`(Не открыл)
Path: success через email→wait→push→success; end после push условия — упрощённо без condition: push → success; end остаётся одиночной concept-нодой чтобы присутствовала end-нода.
Реально: signal → email → wait → push → success; plus end node isolated (demo-only, unused).

### Первая сделка
signal → sms(Промо) → condition(Открыл?) → yes: landing(Покупка) → success / no: push(Напомни) → end

### Апсейл (split по сегменту)
signal → split → storefront(max) → landing → success
                → email(high) → landing (same) → success
                → sms(mid) → landing (same) → success
                → end(low)
Edges: split labels Макс/Выс/Ср/Низ.

### Реактивация
signal → wait(3d) → sms(Оффер) → condition(Кликнул?) → yes: landing(Оффер) → success / no: ivr(Звонок) → end

### Возврат
signal → email(Напомни) → wait(3d) → push(Усилить) → condition(Открыл?) → yes: storefront → success / no: end

### Удержание
signal → split → ivr(high) → success
              → email(mid) → success
              → push(low) → success

Все шаблоны ставят `isSuccess: true` на `success` ноду(ы). `needsAttention` дефолт `false` — в D ничто его не взводит.

## 7. Integration

- В `workflow-view.tsx` — `createBaseNodes(signalName)` меняется на `createTemplate(signalType)` когда `signalType` задан; иначе fallback на legacy base (чтобы sidebar-bottom-bar и happy-path сохранили поведение).
- `workflow-section.tsx` — прокидывает `signalType={currentSignal?.type}` в `WorkflowView`.
- `parseWorkflowCommand` оставляем как есть; существующие команды могут ничего не менять в новых шаблонах — это приемлемо (AI в блоке E введёт новые handlers).

## 8. Files

**Create:**
- `src/state/workflow-templates.ts` — 6 templates + `createTemplate`.
- `src/state/workflow-templates.test.ts` — sanity tests (каждый шаблон: хотя бы одна success-node; все ноды уникальные id; edges валидны).
- `src/sections/campaigns/node-icons.ts` (или добавить в workflow-node.tsx) — map of icons per type.

**Modify:**
- `src/types/workflow.ts` — extend `WorkflowNodeType`, `WorkflowNodeData`; export `NODE_CATEGORY` + `isCommunicationNode`.
- `src/sections/campaigns/workflow-node.tsx` — color palette per type + icon + state overlays + CSS keyframes.
- `src/sections/campaigns/workflow-view.tsx` — принимает `signalType?`, используется `createTemplate` при наличии; иначе legacy base.
- `src/sections/campaigns/workflow-section.tsx` — прокидывает `signalType`.

**Delete:** nothing.

## 9. Tests

**Unit (vitest):**
- `workflow-templates.test.ts`:
  - для каждого `SignalType` → `createTemplate(t)` возвращает граф с ≥1 `isSuccess` нодой.
  - Все node id'ы уникальны.
  - Все edge.source/target ссылаются на существующие ноды.
  - `validateWorkflow(template, true).ok === true` для каждого шаблона.
- `workflow-validation.test.ts` — уже есть, проверяем что `isCommunicationNode` экспортирован корректно: add 1 кейс.

**Integration (Playwright) — `tests/e2e/block-d.spec.ts`:**
- Открыть кампанию типа «Апсейл» (из mid preset) → увидеть минимум 4 типа нод (по data-slot="wf-node-type=split|email|sms|success" или по тексту label вроде «Успех»).
- Открыть кампанию типа «Удержание» → увидеть IVR-ноду.
- Lisp-light: assertions по тексту labels внутри canvas. Точечно не проверяем пиксели, только наличие.

## 10. Acceptance

1. При открытии draft-кампании Canvas отображает шаблон, соответствующий `signal.type`.
2. Ноды разных типов видны с разным цветом и иконкой (visual check).
3. `validateWorkflow(template, true).ok === true` для всех 6 шаблонов.
4. Happy-path + block-b + block-c остаются зелёными.
5. Если у кампании нет привязанного сигнала (legacy / fallback) — рендерится legacy base graph.
