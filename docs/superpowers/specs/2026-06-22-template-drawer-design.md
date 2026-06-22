# AI-drawer сборки шаблона диалогом (#15) — Design

**Дата:** 2026-06-22
**Статус:** дизайн утверждён (брейншторм с визуальным компаньоном), готов к написанию плана.
**Источник:** aim batch 3 правка #15; скоупинг — `docs/superpowers/specs/2026-06-22-workflow-ai-backlog.md` §3.
**Терминология:** «drawer» (не «ровер»/«rover») — корректировка пользователя.

## Проблема

«Создать шаблон» (`src/sections/artifacts/templates-tab.tsx`, `onCreateManual`) сейчас диспатчит `start_campaign_flow` — открывает визард, шаблон не создаётся. Шаблоны не создаются в рантайме: `templates` сидируется из `PRESET_TEMPLATES` (`src/state/app-state.ts:108`); экшна `template_added` нет (единственное касание `templates` — инкремент `usedInCampaigns` в `campaign_launched`). `MessageTemplate = { id, channel, name, content: NodeParams, usedInCampaigns }` (`:93`).

## Решения брейншторма

1. **Тип взаимодействия — структурированный drawer** (не живой чат): канал-чипы → поле интента → карточки вариантов. Зеркалит паттерн email-editor (`EmailEditorState`). Предсказуемо и тестируемо.
2. **Генерация вариантов — реальная модель** (не canned/regex): через сервер (route/ai-sdk) по `(channel, intent)` возвращаются ~3 варианта копии. (`generateEmailDraft` — canned-прецедент — здесь НЕ используется.)
3. **Маскот** появляется на шаге генерации (AI-момент, по PRODUCT.md), не как фоновый декор.

## Поток drawer'а

```
[Создать шаблон] → open_template_drawer
  Шаг 1 — Канал:  чипы SMS / Email / Push / IVR
  Шаг 2 — Интент: свободный текст «что донести» (тема, тон, оффер)
  Шаг 3 — Варианты: модель возвращает ~3 варианта → выбрать / доредактировать
  Шаг 4 — Готово: template_added + close_template_drawer
```

Число вариантов — 3 (дефолт; не конфигурируется на этом этапе).

## Архитектура / компоненты

### Состояние drawer'а
Новый слайс `templateDrawer` на `ChatState` (параллельно `EmailEditorState`, `src/state/chat-context.tsx:34`):
```
templateDrawer: {
  open: boolean;
  step: "channel" | "intent" | "variants";
  channel: Channel | null;
  intent: string;
  variants: <вариант копии>[];     // форма зависит от канала (NodeParams-подобная)
  selectedId: string | null;
}
```
Экшены `open_template_drawer` / `close_template_drawer` (по образцу `open_email_editor`/`close_email_editor`). `resetChat` (`useScopeReset`) дополнительно закрывает template-drawer при смене scope — паритет с авто-закрытием email-editor.

### Генерация (реальная модель)
Серверный путь (route/ai-sdk): по `(channel, intent)` → ~3 варианта `content: NodeParams` для выбранного канала. Новый `AssistResult` kind (`src/lib/ai/assist-contract.ts`) + tool/endpoint `create_template`. Поскольку drawer структурированный (не свободный промпт-бар), вызов идёт за один заход за кадром. **Тестируем контракт** (форма ответа: N вариантов, корректный `kind` под канал), не точный текст (недетерминизм).

### Фиксация в стейте
Новый reducer-экшн **`template_added`** (`src/state/app-state.ts`): добавляет `MessageTemplate { id, channel, name, content: NodeParams, usedInCampaigns: 0 }` в начало `templates`. `usedInCampaigns` стартует с 0 (в отличие от node-derived шаблонов в `campaign_launched`, которые уже в использовании).

### UI
Компонент template-drawer (презентационный + connected), смонтированный там же, где drawer-инфраструктура (`chat-drawer.tsx` / artifacts-section). Кнопка «Создать шаблон» переключается с `start_campaign_flow` на `open_template_drawer`.

## Тестирование

- `template_added` — чистый reducer: добавление, дедуп по id, `usedInCampaigns: 0`, порядок (в начало).
- Контракт генерации: ответ содержит ~3 варианта, `content.kind` соответствует выбранному каналу.
- Машина состояний drawer'а: переходы channel→intent→variants, выбор варианта, «Готово» → `template_added` + закрытие; `resetChat` закрывает drawer.
- Кнопка «Создать шаблон» открывает drawer (а не визард).

## Затронутые файлы (карта)

- **Изменить:** `src/state/app-state.ts` (экшн+тип `template_added`), `src/state/chat-context.tsx` (`templateDrawer` слайс + экшены + `resetChat`), `src/lib/ai/assist-contract.ts` (новый kind), роут/эндпоинт оркестратора (генерация), `src/sections/artifacts/templates-tab.tsx` (кнопка), drawer-монтаж (`chat-drawer.tsx` / artifacts-section).
- **Создать:** компонент template-drawer (+ тесты), модуль контракта генерации вариантов (+ тест).

## Кросс-cutting заметка

#15 — самый изолированный из трёх: трогает шаблоны/чат/оркестратор, НЕ трогает граф-генерацию (`workflow-templates.ts`, `rebuild-schema.ts`, `structural-commands.ts`). `app-state.ts` (reducer) — в единоличном владении #15, ни #6, ни #7 его не правят.
