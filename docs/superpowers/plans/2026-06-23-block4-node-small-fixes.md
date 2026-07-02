# Мелочи нод: таймаут сохранения, карандаш, миниатюра — Implementation Plan

Блок 4 декомпозиции AIM-правок 2026-06-23 (см. `docs/superpowers/specs/2026-06-23-aim-batch-decomposition-design.md`, строки 50, 85–88). Три **независимых** мелких фикса на канвасе workflow:

- **Правка 13** — карандаш в `SelectRow` сплиттера (`split-fields.tsx`).
- **Правка 12** — «Сохранение…» висит вечно; ввести таймаут 10 с (`workflow-section.tsx` + новый хук + `canvas-header.tsx` без изменений строк).
- **Правка 8** — миниатюра workflow на карточке кампании не совпадает с реальным графом (`workflow-mini-preview.tsx` + `campaign-screen.tsx`).

Файлы не пересекаются → три задачи **полностью независимы** и могут вестись подпараллельно (разными агентами), но **в одном worktree** (по `AGENTS.md` — один worktree на блок). Тесты колокейтятся рядом с исходником (`src/**/*.test.tsx`, runner — vitest, jsdom).

---

## Подготовка worktree (один раз, до любых задач)

```bash
git worktree add .worktrees/block4-node-fixes -b feature/block4-node-fixes main
cd .worktrees/block4-node-fixes
npm install
```

Ожидаемо: worktree создан на новой ветке `feature/block4-node-fixes` от `main`; `npm install` завершается без ошибок. Все команды ниже выполняются из `.worktrees/block4-node-fixes`. Dev-сервер при необходимости — `npm run dev -- -p 3001` (порт 3000 может держать основной checkout). Для проверки достаточно lint + vitest.

Базовая проверка, что зелёный старт:

```bash
npm test
```

Ожидаемо: все существующие тесты проходят (`vitest run --passWithNoTests`).

---

## Задача 13 — карандаш в `SelectRow` сплиттера

**Файл:** `src/sections/campaigns/split-fields.tsx`
**Эталон:** `src/sections/campaigns/node-field-combobox.tsx:4` (импорт) и `:111` (рендер `<Pencil aria-hidden className="h-3 w-3 shrink-0" />` внутри icon-span триггера, строки 101–112).

Сейчас редактируемый `SelectRow` (строки 193–210) в icon-span (строки 207–209) рендерит **только** dirty-точку, без карандаша. Readonly-ветка (181–191) карандаш получать **не должна**. `Pencil` в `split-fields.tsx` сейчас **не импортирован**.

### 13.1 — Тест (red)

Создать `src/sections/campaigns/split-fields.test.tsx`. Конвенции — как в `template-card.test.tsx:1–3` (`render`, `screen` из `@testing-library/react`). Карандаш у `lucide-react` рендерится как `<svg>` с `aria-hidden` — селектим по контейнеру триггера, чтобы отличить от dirty-точки.

`SplitFields` дёргает `useAppDispatch` (строка 53) и `splitSegmentBranches` (строка 54), поэтому в тесте оборачиваем в провайдер стейта **или** мокаем эти зависимости. Самый дешёвый путь — мок модулей:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SplitFields } from "./split-fields";
import type { SplitParams } from "@/types/workflow";

vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/state/split-segments", () => ({
  splitSegmentBranches: () => [],
}));

const params: SplitParams = { by: "equal", branches: 2 };

describe("SplitFields — карандаш в SelectRow", () => {
  it("рендерит иконку-карандаш в редактируемом поле «По»", () => {
    const { container } = render(
      <SplitFields
        nodeId="n1"
        params={params}
        readOnly={false}
        onAiHandoff={vi.fn()}
      />,
    );
    // lucide Pencil → <svg class="lucide lucide-pencil ...">
    expect(container.querySelector("svg.lucide-pencil")).not.toBeNull();
  });

  it("НЕ рендерит карандаш в readonly-режиме", () => {
    const { container } = render(
      <SplitFields
        nodeId="n1"
        params={params}
        readOnly
        onAiHandoff={vi.fn()}
      />,
    );
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
```

> Проверка перед фиксацией текста теста: запустить `npm test -- split-fields` и подтвердить, что lucide добавляет класс `lucide-pencil` на `<svg>` (так рендерит lucide-react в этой версии). Если класс иной — поправить селектор (например `[class*="pencil"]`) по фактическому output из первого прогона.

Запуск:

```bash
npm test -- split-fields
```

Ожидаемо (red): первый тест падает — `querySelector("svg.lucide-pencil")` возвращает `null`, т.к. карандаша ещё нет. Второй тест зелёный (карандаша и так нет в readonly).

### 13.2 — Реализация (green)

В `src/sections/campaigns/split-fields.tsx`:

1. Добавить импорт после строки 3 (`import Image from "next/image";`):

```tsx
import { Pencil } from "lucide-react";
```

2. В редактируемой ветке `SelectRow`, icon-span (строки 207–209), добавить карандаш после dirty-точки, зеркаля combobox (`node-field-combobox.tsx:109–111`):

```tsx
<span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
  {isDirty && <DirtyDot />}
  {/* Индикатор «поле редактируемо» — клик по нему открывает тот же
      попап, что и вся строка-триггер (как в NodeFieldCombobox). */}
  <Pencil aria-hidden className="h-3 w-3 shrink-0" />
</span>
```

Readonly-ветку (строки 181–191) **не трогаем**.

```bash
npm test -- split-fields
```

Ожидаемо (green): оба теста проходят.

### 13.3 — Коммит

```bash
npm run lint
git add -A && git commit
```

Сообщение:

```
fix(split-fields): add Pencil affordance to editable SelectRow (aim #13)

SelectRow trigger showed only the dirty dot; mirror NodeFieldCombobox
and render <Pencil> in the editable branch (readonly stays icon-free).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Задача 12 — таймаут «Сохранение…» (макс 10 с)

**Симптом:** в `canvas-header.tsx:243–248` строка `"Сохранение…"` рендерится, пока `saveState === "unsaved"`. Реального async-сохранения нет — лейбл висит вечно для любого несохранённого диффа, пока юзер не нажмёт «Сохранить».

**`saveState` вычисляется в** `workflow-section.tsx:265–277` (сравнение `currentSig` vs `savedSig` через `graphSignature`). **`handleSave`** (строки 279–286) обновляет `savedSigRef` и диспатчит `campaign_saved_draft` (reducer `app-state.ts:517`, no-op в глобальном стейте).

### Выбранный механизм (зафиксировано)

Прототип, real async save нет → правильная семантика правки — «лейбл не должен висеть дольше 10 с». Чистейший фикс: **таймер авто-разрешения в saved-состояние**. Когда `saveState === "unsaved"`, запускаем 10-секундный таймер; по срабатыванию вызываем тот же `handleSave` (он переписывает базовую подпись `savedSigRef` на текущую → diff исчезает → `saveState` пересчитывается в `"saved"` → лейбл становится «Изменения сохранены», строка `canvas-header.tsx:246`). Таймер **сбрасывается при каждом новом изменении графа** (новая `currentSig` → новый 10-секундный отсчёт), поэтому активная правка не «съедается» преждевременно, но и не висит вечно.

Реализуем выделенным хуком `useSaveTimeout` (по образцу `useAiReplyAutoDismiss` — он тестируется через `renderHook` + fake timers, см. `use-ai-reply-auto-dismiss.test.ts`). Хук **тестируем изолированно** (логику таймера), затем подключаем в `workflow-section.tsx`. `canvas-header.tsx` **не меняем** — он уже корректно реагирует на `saveState`.

Триггер хука — `currentSig` (меняется на каждое изменение графа) + `saveState`. При `saveState !== "unsaved"` или отсутствии диффа таймер не ставится. По таймауту вызываем переданный `onTimeout` (= `handleSave`). RU-строки не добавляются (лейблы уже в `canvas-header.tsx`).

### 12.1 — Тест хука (red)

Создать `src/sections/campaigns/use-save-timeout.ts` **только сигнатуру-заглушку** (чтобы тест компилился), затем тест. Хук:

```ts
export function useSaveTimeout(
  active: boolean,
  resetKey: string | null,
  onTimeout: () => void,
): void;
```

- `active` = `saveState === "unsaved"`.
- `resetKey` = текущая подпись графа (`currentSig`); смена → перезапуск окна.
- `onTimeout` вызывается один раз через 10000 мс, если `active` всё ещё true.

Заглушка (red-фаза, тело пустое):

```ts
"use client";
export function useSaveTimeout(
  _active: boolean,
  _resetKey: string | null,
  _onTimeout: () => void,
): void {}
```

Тест `src/sections/campaigns/use-save-timeout.test.ts` (структура — копия `use-ai-reply-auto-dismiss.test.ts:1–13`):

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSaveTimeout } from "./use-save-timeout";

describe("useSaveTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("вызывает onTimeout через 10000мс когда active", () => {
    const onTimeout = vi.fn();
    renderHook(() => useSaveTimeout(true, "sigA", onTimeout));
    vi.advanceTimersByTime(9999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("не ставит таймер когда не active", () => {
    const onTimeout = vi.fn();
    renderHook(() => useSaveTimeout(false, "sigA", onTimeout));
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("сбрасывает таймер при смене resetKey (новая правка → новые 10с)", () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useSaveTimeout(true, key, onTimeout),
      { initialProps: { key: "sigA" } },
    );
    vi.advanceTimersByTime(7000);
    rerender({ key: "sigB" }); // новая правка
    vi.advanceTimersByTime(9999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("очищает таймер при unmount", () => {
    const onTimeout = vi.fn();
    const { unmount } = renderHook(() => useSaveTimeout(true, "sigA", onTimeout));
    vi.advanceTimersByTime(5000);
    unmount();
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
```

```bash
npm test -- use-save-timeout
```

Ожидаемо (red): тесты 1 и 3 падают (`onTimeout` не вызван — тело пустое); 2 и 4 зелёные.

### 12.2 — Реализация хука (green)

Заполнить `src/sections/campaigns/use-save-timeout.ts`:

```ts
"use client";

import { useEffect } from "react";

/** Макс. длительность лейбла «Сохранение…» до авто-разрешения в «сохранено». */
export const SAVE_TIMEOUT_MS = 10000;

/**
 * Не даёт лейблу «Сохранение…» висеть вечно (aim #12): пока есть
 * несохранённый дифф (`active`), запускает таймер на {@link SAVE_TIMEOUT_MS};
 * по срабатыванию вызывает `onTimeout` (= сохранить, см. WorkflowSection).
 * Любая новая правка (смена `resetKey`) перезапускает окно.
 */
export function useSaveTimeout(
  active: boolean,
  resetKey: string | null,
  onTimeout: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(onTimeout, SAVE_TIMEOUT_MS);
    return () => clearTimeout(id);
    // resetKey в deps: новая правка → новый 10-секундный отсчёт.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resetKey]);
}
```

> Примечание: `onTimeout` намеренно не в deps (как в `useAiReplyAutoDismiss`), чтобы пересоздание колбэка на каждый рендер не перезапускало таймер; перезапуск завязан только на `active`/`resetKey`. Колбэк актуальный замыкается на момент постановки — допустимо, т.к. он читает рефы (`savedSigRef`/`currentSig`).

```bash
npm test -- use-save-timeout
```

Ожидаемо (green): все 4 теста проходят.

### 12.3 — Подключение в `workflow-section.tsx`

Хук должен встать **после** объявления `currentSig`/`saveState`/`handleSave` (строки 265–286), но хуки нельзя вызывать после раннего `return` (строка 178) и после условного `return` на строке 252. **Проблема:** `useSaveTimeout` — хук, а `currentSig`/`saveState` вычисляются ниже ранних `return`'ов → нарушение правил хуков, если вызвать там.

**Решение:** вынести таймер так, чтобы хук вызывался безусловно до любого `return`, передав в него значения через рефы/lazy-computed. Конкретно — добавить вызов `useSaveTimeout` рядом с другими `useMemo`/`useCallback` (до строки 178 `if (view.kind !== "workflow") return null;`), питая его из мемоизированных значений, которые тоже считаются до ранних return. Реорганизация:

1. Подняли вычисление `saveState`-предиката в `useMemo` над ранними return'ами **нельзя** напрямую (зависит от `currentCampaign`, который резолвится после `view.kind` guard). Поэтому используем **ref-зеркало** + безусловный хук:

   Добавить рефы рядом с существующими (после строки 74):

   ```ts
   const saveTimeoutStateRef = useRef<{ active: boolean; sig: string | null }>({
     active: false,
     sig: null,
   });
   const handleSaveRef = useRef<() => void>(() => {});
   ```

2. Безусловный вызов хука сразу после объявления рефов/колбэков (например после `handleGraphChange`, строка 100), читая из рефов:

   ```ts
   // aim #12: таймаут лейбла «Сохранение…». Питается из рефов, т.к. сами
   // currentSig/saveState/handleSave вычисляются ниже ранних return'ов.
   useSaveTimeout(
     saveTimeoutStateRef.current.active,
     saveTimeoutStateRef.current.sig,
     () => handleSaveRef.current(),
   );
   ```

   > ⚠️ Чтение `ref.current` в аргументах хука не сделает его реактивным — `useEffect` внутри хука перезапустится только при ре-рендере с другими значениями. Ре-рендер случается на каждое `setGraphTick`/`setSaveTick`, и к моменту ре-рендера рефы уже обновлены (см. шаг 3, рефы пишутся в теле рендера ниже). Этого достаточно: каждое изменение графа → ре-рендер → хук видит новый `sig`. Подтвердить ручным прогоном (шаг 12.5).

3. В теле рендера, **сразу после** вычисления `saveState` (после строки 277) и определения `handleSave` (после строки 286), синхронизировать рефы:

   ```ts
   saveTimeoutStateRef.current = {
     active: saveState === "unsaved",
     sig: currentSig,
   };
   handleSaveRef.current = handleSave;
   ```

4. Импорт хука вверху файла (после строки 11, рядом с локальными импортами):

   ```ts
   import { useSaveTimeout } from "./use-save-timeout";
   ```

> **Альтернатива, если ref-зеркало окажется хрупким при ручной проверке:** разместить `useSaveTimeout` внутри `CanvasHeader` (`canvas-header.tsx`), где `saveState` приходит пропсом и нет ранних return'ов — но тогда `onTimeout` надо пробрасывать новым пропом `onSaveTimeout` из секции. Зафиксированный выбор — ref-зеркало в `workflow-section.tsx` (не трогает публичный API `CanvasHeader`). Переключиться на альтернативу только если шаг 12.5 покажет, что таймер не срабатывает.

### 12.4 — Тест интеграции (опционально, лёгкий)

Логика таймера уже покрыта 12.1. Поведение секции (рефы → хук) проверяется вручную в 12.5 — полноценный рендер `WorkflowSection` требует всего стейт-провайдера и xyflow, что дорого и хрупко для unit-теста. Не добавляем тяжёлый render-тест; покрытие = unit-тест хука + ручная проверка.

### 12.5 — Ручная проверка

```bash
npm run dev -- -p 3001
```

Открыть кампанию-черновик в редакторе workflow, изменить параметр ноды → появляется «Сохранение…». Не нажимать «Сохранить». Через ≤10 с лейбл должен смениться на «Изменения сохранены». Подтвердить, что новая правка снова показывает «Сохранение…» и снова разрешается за 10 с.

### 12.6 — Коммит

```bash
npm run lint
npm test -- use-save-timeout
git add -A && git commit
```

Сообщение:

```
fix(workflow): cap "Сохранение…" label at 10s via useSaveTimeout (aim #12)

No async save exists, so an unsaved diff kept the label forever. Add a
10s auto-resolve timer (resets on each edit) that calls handleSave,
flipping saveState to "saved" → "Изменения сохранены".

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Задача 8 — миниатюра workflow читает живой граф

**Симптом:** миниатюра на карточке кампании не совпадает с реальным графом в полном редакторе.

**Корень:** `workflow-mini-preview.tsx:36–42` (`useMemo`) **пересобирает свежий шаблон** через `createTemplate(signalType, undefined, channels)` (строка 38) / `createBaseNodes()`+`createBaseEdges()` (строка 41), вместо чтения живого графа. Полный редактор читает `getCachedGraph(campaignId) ?? initialGraph(...)` (`workflow-view.tsx:289–291`) из `src/sections/campaigns/workflow-graph-cache.ts`. Плюс строка 38 передаёт `sourceType = undefined` против реального `sourceType` в полном графе (`workflow-section.tsx:331` → `currentCampaign.sourceType`).

**Фикс:** миниатюра читает тот же кэш — `getCachedGraph(campaignId)`; если кэша нет (граф ни разу не открывали) — fallback на построенный шаблон с **реальным** `sourceType`. Пробросить `campaignId` и `sourceType` через единственного вызывающего (`campaign-screen.tsx:169`).

### 8.1 — Тест (red)

Создать `src/sections/campaigns/workflow-mini-preview.test.tsx`. Мокаем `workflow-graph-cache` и `workflow-graph` (xyflow тяжёл — мокаем `WorkflowGraph`, чтобы вытащить переданные `nodes`).

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowMiniPreview } from "./workflow-mini-preview";
import type { CachedGraph } from "./workflow-graph-cache";

const cached: CachedGraph = {
  nodes: [
    {
      id: "live-1",
      type: "card",
      position: { x: 0, y: 0 },
      data: { label: "Живая нода", nodeType: "source" },
    },
  ] as CachedGraph["nodes"],
  edges: [],
};

vi.mock("./workflow-graph-cache", () => ({
  getCachedGraph: vi.fn(() => cached),
}));

// Перехватываем пропсы, переданные в WorkflowGraph.
const graphProps = vi.fn();
vi.mock("./workflow-graph", () => ({
  WorkflowGraph: (props: { nodes: unknown[] }) => {
    graphProps(props);
    return null;
  },
}));

describe("WorkflowMiniPreview", () => {
  it("рендерит граф из кэша (getCachedGraph), а не пересобирает шаблон", () => {
    render(
      <WorkflowMiniPreview
        campaignId="camp-1"
        signalType="mortgage"
      />,
    );
    expect(graphProps).toHaveBeenCalled();
    const passed = graphProps.mock.calls[0][0] as { nodes: { id: string }[] };
    expect(passed.nodes).toHaveLength(1);
    expect(passed.nodes[0].id).toBe("live-1");
  });
});
```

> Перед фиксацией: подставить валидный `signalType` (любой член `SignalType`, напр. реальный из `src/state/app-state.ts` — проверить grep'ом `type SignalType`). `data.nodeType` и форма ноды должны удовлетворять `WorkflowNode` (см. `src/types/workflow.ts`); если тип ругается — привести фикстуру через `createBaseNodes()` из `@/types/workflow` вместо ручного литерала.

```bash
npm test -- workflow-mini-preview
```

Ожидаемо (red): падает — текущий компонент игнорирует кэш (и `campaignId` ему даже не передаётся в типах), `WorkflowGraph` получает свежесобранный шаблон, `nodes[0].id !== "live-1"`. Если TS-ошибка на `campaignId` проп — это ожидаемо до реализации; тест красный на компиляции — допустимо в red-фазе.

### 8.2 — Реализация (green)

В `src/sections/campaigns/workflow-mini-preview.tsx`:

1. Добавить импорты (после строки 6):

```tsx
import { getCachedGraph } from "./workflow-graph-cache";
import type { SourceType } from "@/types/campaign";
```

2. Расширить пропсы (`WorkflowMiniPreviewProps`, строки 10–21):

```tsx
interface WorkflowMiniPreviewProps {
  /** Кампания, чей живой граф показываем; читаем по нему кэш редактора. */
  campaignId?: string;
  signalType?: SignalType;
  /** Тип источника — нужен для fallback-шаблона (как в полном графе). */
  sourceType?: SourceType;
  /** Selected communication channels — passed to createTemplate for accurate preview. */
  channels?: Channel[];
  onClick?: () => void;
}
```

3. Деструктуризация (строки 31–35) + `useMemo` (строки 36–42):

```tsx
export function WorkflowMiniPreview({
  campaignId,
  signalType,
  sourceType,
  channels,
  onClick,
}: WorkflowMiniPreviewProps) {
  const graph = useMemo(() => {
    // Живой граф из кэша редактора — то же, что читает WorkflowView
    // (workflow-view.tsx:289–291). Так миниатюра совпадает с полным графом.
    const cached = getCachedGraph(campaignId);
    if (cached) return { nodes: cached.nodes, edges: cached.edges };
    // Fallback: граф ни разу не открывали — строим шаблон с РЕАЛЬНЫМ
    // sourceType (раньше передавали undefined → расхождение, aim #8).
    if (signalType) {
      const t = createTemplate(signalType, sourceType, channels);
      return { nodes: t.nodes, edges: t.edges };
    }
    return { nodes: createBaseNodes(), edges: createBaseEdges() };
  }, [campaignId, signalType, sourceType, channels]);
```

Остальное тело (innerGraph / button) без изменений.

```bash
npm test -- workflow-mini-preview
```

Ожидаемо (green): тест проходит — `WorkflowGraph` получает ноды из кэша (`live-1`).

### 8.3 — Прокинуть `campaignId` + `sourceType` у вызывающего

В `src/sections/campaigns/campaign-screen.tsx:169`:

```tsx
<WorkflowMiniPreview
  campaignId={campaign.id}
  signalType={signalType}
  sourceType={campaign.sourceType}
  channels={campaign.channels}
  onClick={openWorkflow}
/>
```

(`campaign.id`, `campaign.sourceType`, `campaign.channels` доступны — это `Campaign`, см. `src/types/campaign.ts:17–19`; `signalType` уже выводится на `campaign-screen.tsx:58–59`.)

> Подтвердить grep'ом, что других вызовов `WorkflowMiniPreview` нет — на момент разведки единственный caller: `campaign-screen.tsx:169`. Если появился ещё — добавить `campaignId`/`sourceType` и там.

### 8.4 — Ручная проверка

```bash
npm run dev -- -p 3001
```

Открыть кампанию, в полном редакторе изменить структуру графа (добавить/изменить ноду), вернуться на карточку кампании → миниатюра отражает изменённый граф (а не дефолтный шаблон).

### 8.5 — Коммит

```bash
npm run lint
npm test -- workflow-mini-preview
git add -A && git commit
```

Сообщение:

```
fix(mini-preview): render live cached graph instead of rebuilt template (aim #8)

WorkflowMiniPreview rebuilt a fresh template (createTemplate with
undefined sourceType), diverging from the editor. Read getCachedGraph
(same source as WorkflowView), thread campaignId + real sourceType from
CampaignScreen; fall back to the template only when no cached graph.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Финальная проверка блока

```bash
npm run lint
npm test
```

Ожидаемо: lint без ошибок; полный прогон vitest зелёный (включая 3 новых файла тестов: `split-fields.test.tsx`, `use-save-timeout.test.ts`, `workflow-mini-preview.test.tsx`).

Отчитаться пользователю: путь worktree `.worktrees/block4-node-fixes`, ветка `feature/block4-node-fixes`, 3 коммита (aim #13, #12, #8). Слияние/очистка — за пользователем (`AGENTS.md`: не пушить в `main` напрямую).

---

## Замечания по соответствию спеке (self-review)

- **RU-строки:** ни одна задача не вводит новых пользовательских строк, кроме уже существующих RU-лейблов в `canvas-header.tsx` («Сохранение…», «Изменения сохранены») — не меняем. ✓
- **Независимость:** 3 задачи трогают 3 разных файла (+ 2 новых: хук, 3 теста) + 1 caller (`campaign-screen.tsx`, только задача 8). Пересечений нет → порядок свободен, подпараллелизация возможна. ✓
- **«Not the Next.js you know»:** API React Flow напрямую не трогаем (мокаем `WorkflowGraph` в тесте 8; реализация лишь меняет источник `nodes`/`edges`). motion не задействован. ✓
- **Один worktree:** все три задачи в `.worktrees/block4-node-fixes`. ✓
- **TDD + конвенции репозитория:** тесты колокейтятся (`src/**/*.test.tsx`), runner vitest+jsdom, fake-timers по образцу `use-ai-reply-auto-dismiss.test.ts`, render-тесты по образцу `template-card.test.tsx`. ✓
- **Риск задачи 12:** ref-зеркало для безусловного вызова хука над ранними return'ами — задокументирован fallback (хук в `CanvasHeader`) на случай хрупкости; ручная проверка 12.5 — gate.
