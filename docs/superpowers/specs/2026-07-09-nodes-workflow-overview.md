# Обзор: доработки нод и воркфлоу кампаний (2026-07-09)

Переписанная и **сверенная с кодом `integration`** версия спеки `afina-nodes-workflow-spec.md`.
Все факты, пути и номера строк проверены аудитом против рабочего дерева на `integration`.
Оригинальная спека содержала ошибки (перечислены ниже в «Исправления против оригинала») — эта версия их устраняет.

## Разбиение на 3 параллельных спека

Пункты переплетены по файлам, поэтому разбиение сделано **по владению файлами**, а не по темам —
чтобы каждый «горячий» файл правил ровно один агент. Каждый агент работает в **своём git worktree off `integration`**.

| Спека | Пункты | Тема | Документ |
|---|---|---|---|
| **A** | 12a, 12b, 12c | Бэкенд графа: удаление `merge`, нода-сток «Статистика» (без параметров), формализация заголовков/подзаголовков | `2026-07-09-spec-A-graph-backend-design.md` |
| **B** | 2, 3, 4, 5, 6, 9 | UI нод-карты: крестики тегов, сворачивание сплиттера, pencil→chevron, dirtyDot→label, глаз, кнопка удаления узла | `2026-07-09-spec-B-node-card-ui-design.md` |
| **C** | 1, 10, 11 | Сигнал-фича (полная) + дневной бюджет на карточке + welcome-экран | `2026-07-09-spec-C-signal-feature-screens-design.md` |

> Исключено из работы (по решению из оригинала): п.7 и п.8.

## Владение файлами (кто главный по файлу)

| Файл | Владелец | Кто ещё трогает (регион) |
|---|---|---|
| `src/sections/campaigns/node-card-content.tsx` | **B** | A/B: 1-строчное удаление рендерера `merge` + добавление `statistics: () => []`; C: спец-кейс монтажа `<SignalFiles/>` в ветке `signal` |
| `src/state/structural-commands.ts` | **A** | — (guard-хелпер для п.9 живёт здесь, B импортирует) |
| `src/sections/campaigns/node-visuals.ts` | **A** | C: `NODE_ICON.signal` → `Radar` (другой ключ, чем `merge`/`statistics` у A) |
| `src/state/workflow-validation.ts`, `node-actions.ts`, `node-field-editability.ts` | **A** | — |
| `src/lib/ai-workflow-schema.ts`, `src/lib/ai/rebuild-schema.ts`, `src/lib/ai/afina-knowledge.ts`, `suggestion-registry/node-context.ts`, `channel-nodes.ts` | **A** | — |
| `src/state/split-segments.ts` | **A** | B (п.3) импортирует `splitSummary` |
| `src/types/workflow.ts` | **shared A/C** | A: `merge`/`statistics`; C: `SignalParams.files`, удаление legacy `signals` |
| `src/state/workflow-templates.ts` | **shared A/C** | A: рёбра `statistics`, титулы; C: signal-узел |
| `src/sections/campaigns/workflow-view.tsx` | **shared A/C** | A: `computeDynamicSublabel`/`fallbackParamsPatch`; C: ветка `initialGraph` при пустом `signalType` |
| Все `node-*.tsx`, `*-fields.tsx`, `chip-editable-input.tsx`, `prompt-chips-context.tsx`, `workflow-node.tsx` | **B** | — |
| Экраны: `artifact-screen.tsx`, `app-state.ts` (origin), `signals-tab.tsx`, `campaign-screen.tsx`, `workflow-mini-preview.tsx`, `campaign-card.tsx`, `welcome-view.tsx`, `onboarding-step-cards.tsx` | **C** | — |

## Порядок мержа: A → B → C

Причина порядка — компиляция TypeScript:
1. **A** первым: меняет `WorkflowNodeType`/`NodeParams` (убирает `merge`, добавляет `statistics`). Пока это не влито, `node-card-content.tsx` (владелец B) содержит `merge`-рендерер, который станет ошибкой exhaustive-типа.
2. **B** ребейзится на A. После A `PARAM_RENDERERS` в `node-card-content.tsx` перестанет компилиться (лишний ключ `merge`, недостающий ключ `statistics`) — B **удаляет строку** `merge: () => []` и **добавляет** `statistics: () => []`. Это единственная A↔B точка связи в этом файле.
3. **C** ребейзится на B. Конфликты в `types/workflow.ts` / `workflow-templates.ts` / `workflow-view.tsx` — разные регионы, резолвятся вручную при мерже.

Внутри-спековые зависимости: **п.6 зависит от п.4** (см. спеку B) — стрелка раскрытия появляется только после замены Pencil→ChevronDown.

## Исправления против оригинальной спеки (ключевые «глупости»)

- **П.1:** оригинал целил в `source`/`Database`-узел, но `createTemplate()`→`withSignalPath()` его выкидывает и рендерит `nodeType: "signal"` (иконка `SignalLow`). Radar → в `NODE_ICON.signal`. `SignalParams` несёт один `fileName`, не массив — для «списка файлов» нужна новая модель. Origin-плюминга «Назад» нет. Строки: backLabel L73 (не 78), onBack L183 (не 194).
- **П.9:** `scoring` **не** защищён в `applyRemove` (нужен guard). «реконнект уже сделан для merge» — **ложь**: merge убрали на уровне генерации шаблонов, рантайм-`applyRemove` (удаление+реконнект) есть, но не «для merge». Путь редьюсера `src/state/workflow-view.tsx` **не существует**.
- **П.10:** «вернуть» неверно — на карточке дневного бюджета **никогда** не было (git). `Campaign.dailyBudget` в `app-state.ts:75`, не `campaign.ts:59` (там `StepData`). Формат — точный «12 000 ₽».
- **П.12a:** оригинал пропустил `structural-commands.ts:101` (`слияние:` алиас) и **`lib/ai/afina-knowledge.ts:24`** (пользовательский AI-текст всё ещё описывает узел «слияние»). Удаление сломает 4 теста.
- **П.12b:** экран статистики уже есть (`goto_stats(campaignId)`). Нода — **без параметров** (по решению), footprint симметричен удаляемому `merge`.
- **П.12c:** заголовок condition сейчас **«Условие»**, не «Проверка». Плюс реальные ренеймы: `split` «Сплиттер»→«Ветвление», `ivr` «Звонок»→«IVR». У `sms`/`push` нет поля шаблона → подзаголовок «—».
