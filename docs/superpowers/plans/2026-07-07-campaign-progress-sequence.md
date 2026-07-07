# Последовательный прогресс кампании после запуска — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** После запуска кампания проходит этапы по очереди во времени (Отправка 8с → Проверка 8с → Обработка базы 30с → Коммуникация), артефакт появляется после «Обработки базы», а статистика пустая (нули/«—») до «Коммуникации».

**Architecture:** Текущий этап выводится чистой функцией `campaignStageAt(stages, elapsedMs)` от `launchedAt`. Хук `useCampaignClock` перерисовывает карточку на границах этапов. Персистентную часть (артефакт + флаг «коммуникация») ставит один пост-лонч таймер через существующий `campaign_phase_advanced`. Пред-лонч сбор (`isCollecting`, `SCORING_WINDOW`) удаляется.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-07-campaign-progress-sequence-design.md`

---

## File Structure

- **Create** `src/hooks/use-campaign-clock.ts` — хук-часы: `elapsedMs` + перерисовка на границах.
- **Modify** `src/sections/campaigns/campaign-progress.tsx` — `STAGE_DURATION_MS`, `campaignStageList`, `campaignStageAt`, `communicatingThresholdMs`, `stageBoundariesMs`; компонент берёт `currentIndex` из времени.
- **Modify** `src/state/app-state.ts` — `campaign_launched`: `phase: "scoring"`, без артефакта на запуске; `campaign_phase_advanced`: guard для stream.
- **Modify** `src/sections/campaigns/campaign-screen.tsx` — убрать пред-лонч сбор; пост-лонч таймер перехода; гейты артефакта/статистики.
- **Modify** `src/sections/campaigns/campaign-stats-block.tsx` — проп `populated`; нули/«—» когда `false`.
- **Modify** `src/sections/campaigns/campaign-launch-gate.ts` — удалить `isCollecting`.
- **Modify** тесты: `campaign-progress.test.tsx`, `campaign-screen.test.tsx`, `campaign-launch-gate.test.ts`; создать `use-campaign-clock.test.tsx`.

---

## Task 1: Чистое ядро таймингов этапов

**Files:**
- Modify: `src/sections/campaigns/campaign-progress.tsx`
- Test: `src/sections/campaigns/campaign-progress.test.tsx`

- [ ] **Step 1: Write failing tests for the new pure functions**

Добавь в конец `src/sections/campaigns/campaign-progress.test.tsx` (импорт функций добавь к существующему `import { ... } from "./campaign-progress"`):

```ts
import {
  campaignStageList,
  campaignStageAt,
  communicatingThresholdMs,
  stageBoundariesMs,
} from "./campaign-progress";

describe("campaignStageAt — time-derived stage index", () => {
  const nonStream = campaignStageList({
    sourceType: "new", channels: ["sms"], phase: "scoring", status: "active",
  });

  it("walks send→verify→process→communicate by elapsed (non-stream)", () => {
    expect(campaignStageAt(nonStream, 0)).toBe(0); // Отправка
    expect(campaignStageAt(nonStream, 7999)).toBe(0);
    expect(campaignStageAt(nonStream, 8000)).toBe(1); // Проверка
    expect(campaignStageAt(nonStream, 15999)).toBe(1);
    expect(campaignStageAt(nonStream, 16000)).toBe(2); // Обработка базы
    expect(campaignStageAt(nonStream, 45999)).toBe(2);
    expect(campaignStageAt(nonStream, 46000)).toBe(3); // Коммуникация (терминальный ongoing)
    expect(campaignStageAt(nonStream, 999999)).toBe(3); // не доходит до «завершена»
  });

  it("completed (Infinity) → all stages done", () => {
    expect(campaignStageAt(nonStream, Infinity)).toBe(nonStream.length);
  });

  it("stream: connect→process(terminal) by elapsed", () => {
    const stream = campaignStageList({
      sourceType: "stream", channels: [], phase: "scoring", status: "active",
    });
    expect(campaignStageAt(stream, 0)).toBe(0); // Подключение
    expect(campaignStageAt(stream, 7999)).toBe(0);
    expect(campaignStageAt(stream, 8000)).toBe(1); // Обработка и коммуникация (terminal)
    expect(campaignStageAt(stream, 999999)).toBe(1);
  });
});

describe("communicatingThresholdMs", () => {
  it("non-stream = 46000, stream = 8000", () => {
    const nonStream = campaignStageList({ sourceType: "new", channels: ["sms"], phase: "scoring", status: "active" });
    const stream = campaignStageList({ sourceType: "stream", channels: [], phase: "scoring", status: "active" });
    expect(communicatingThresholdMs(nonStream)).toBe(46000);
    expect(communicatingThresholdMs(stream)).toBe(8000);
  });
});

describe("stageBoundariesMs", () => {
  it("non-stream boundaries = [8000, 16000, 46000]", () => {
    const nonStream = campaignStageList({ sourceType: "new", channels: ["sms"], phase: "scoring", status: "active" });
    expect(stageBoundariesMs(nonStream)).toEqual([8000, 16000, 46000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sections/campaigns/campaign-progress.test.tsx`
Expected: FAIL — `campaignStageList`/`campaignStageAt`/... are not exported.

- [ ] **Step 3: Add the pure functions to `campaign-progress.tsx`**

После блока с `STREAM`/`NON_STREAM_*` константами (≈ строка 47) добавь:

```ts
/** Длительность этапа по id (ms). Этапы без записи и последний этап списка —
 *  терминальные (текущий «ongoing», без авто-перехода). */
const STAGE_DURATION_MS: Record<string, number> = {
  send: 8000,
  verify: 8000,
  connect: 8000,
  process: 30000,
};

/** Список этапов кампании (без индекса) — по типу источника + наличию comm. */
export function campaignStageList(c: ProgressCampaign): ProgressStage[] {
  const streaming = c.sourceType === "stream";
  if (streaming) return STREAM;
  const hasComm = (c.channels?.length ?? 0) > 0;
  return hasComm ? NON_STREAM_COMM : NON_STREAM_NO_COMM;
}

/**
 * Индекс текущего этапа по прошедшему времени с запуска. Терминальный этап
 * (последний в списке или без длительности — communicate/process-stream/done)
 * «залипает» как ongoing. `elapsedMs === Infinity` (completed) → все done.
 */
export function campaignStageAt(stages: ProgressStage[], elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) return stages.length;
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) return i;
    acc += dur;
    if (elapsedMs < acc) return i;
  }
  return stages.length;
}

/** Момент (ms с запуска) старта коммуникации/артефакта — начало терминального
 *  этапа. Не-stream = 46000, stream = 8000. */
export function communicatingThresholdMs(stages: ProgressStage[]): number {
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) return acc;
    acc += dur;
  }
  return acc;
}

/** Границы этапов (кумулятивные ms) для перерисовки часами. */
export function stageBoundariesMs(stages: ProgressStage[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < stages.length; i++) {
    const isLast = i === stages.length - 1;
    const dur = STAGE_DURATION_MS[stages[i].id];
    if (isLast || dur === undefined) break;
    acc += dur;
    out.push(acc);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sections/campaigns/campaign-progress.test.tsx`
Expected: PASS (все, включая существующие).

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-progress.tsx src/sections/campaigns/campaign-progress.test.tsx
git commit -m "feat(progress): чистое ядро таймингов этапов (campaignStageAt/threshold/boundaries)"
```

---

## Task 2: Хук-часы `useCampaignClock`

**Files:**
- Create: `src/hooks/use-campaign-clock.ts`
- Test: `src/hooks/use-campaign-clock.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-campaign-clock.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCampaignClock } from "./use-campaign-clock";
import type { Campaign } from "@/state/app-state";

function base(over: Partial<Campaign>): Campaign {
  return {
    id: "c1", name: "C", status: "active", sourceType: "new", channels: ["sms"],
    phase: "scoring", scenario: undefined, createdAt: "2026-06-01T00:00:00.000Z",
    launchedAt: "2026-06-01T00:00:00.000Z", budget: 1000, templateIds: [],
    ...over,
  } as Campaign;
}

describe("useCampaignClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("active → elapsed = now - launchedAt", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z")); // +20s
    const { result } = renderHook(() => useCampaignClock(base({})));
    expect(result.current).toBe(20000);
  });

  it("completed → Infinity", () => {
    vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z"));
    const { result } = renderHook(() =>
      useCampaignClock(base({ status: "completed" })),
    );
    expect(result.current).toBe(Infinity);
  });

  it("paused → frozen at pausedAt - launchedAt", () => {
    vi.setSystemTime(new Date("2026-06-01T00:05:00.000Z"));
    const { result } = renderHook(() =>
      useCampaignClock(base({ status: "paused", pausedAt: "2026-06-01T00:00:10.000Z" })),
    );
    expect(result.current).toBe(10000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/use-campaign-clock.test.tsx`
Expected: FAIL — module `./use-campaign-clock` not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-campaign-clock.ts`:

```ts
"use client";

import { useEffect, useReducer } from "react";
import type { Campaign } from "@/state/app-state";
import { campaignStageList, stageBoundariesMs } from "@/sections/campaigns/campaign-progress";

/**
 * Прошедшее время с запуска кампании (ms) для вывода текущего этапа прогресса.
 * `active` → now − launchedAt (перерисовка на границах этапов), `paused` →
 * заморожено на pausedAt, `completed` → Infinity (все этапы done), иначе 0.
 */
export function useCampaignClock(campaign: Campaign): number {
  const [version, tick] = useReducer((n: number) => n + 1, 0);
  const { status, launchedAt, pausedAt } = campaign;

  const elapsed = computeElapsed(status, launchedAt, pausedAt);

  useEffect(() => {
    if (status !== "active" || !launchedAt) return;
    const now = Math.max(0, Date.now() - Date.parse(launchedAt));
    const next = stageBoundariesMs(campaignStageList(campaign)).find((b) => b > now);
    if (next === undefined) return;
    const t = setTimeout(() => tick(), next - now + 50);
    return () => clearTimeout(t);
    // version: перевзвод таймера на следующую границу после каждой перерисовки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, launchedAt, version, campaign.sourceType, campaign.channels?.length]);

  return elapsed;
}

function computeElapsed(
  status: Campaign["status"],
  launchedAt: string | undefined,
  pausedAt: string | undefined,
): number {
  if (status === "completed") return Infinity;
  if (!launchedAt) return 0;
  const end = status === "paused" && pausedAt ? Date.parse(pausedAt) : Date.now();
  return Math.max(0, end - Date.parse(launchedAt));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/use-campaign-clock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-campaign-clock.ts src/hooks/use-campaign-clock.test.tsx
git commit -m "feat(progress): хук useCampaignClock — elapsed + перерисовка на границах этапов"
```

---

## Task 3: app-state — запуск в «scoring», без артефакта на запуске; guard для stream

**Files:**
- Modify: `src/state/app-state.ts:1078-1096` (case `campaign_launched`) и `campaign_phase_advanced`
- Test: `src/state/app-state.test.ts` (существующий; при отсутствии нужного describe — добавить)

- [ ] **Step 1: Write failing tests**

Добавь в `src/state/app-state.test.ts` (подгони импорт `reducer`/`INITIAL`/фабрику кампании под существующие в файле; ниже — форма):

```ts
describe("campaign_launched → post-launch sequence", () => {
  it("launch ставит phase 'scoring' и НЕ создаёт артефакт сразу", () => {
    const s0 = withDraftCampaign("c1", { sourceType: "own", channels: ["sms"] });
    const s1 = reducer(s0, {
      type: "campaign_launched", id: "c1",
      timestamp: "2026-06-01T00:00:00.000Z", budget: 1000, dailyBudget: null,
      templateIds: [],
    });
    const c = s1.campaigns.find((x) => x.id === "c1")!;
    expect(c.status).toBe("active");
    expect(c.phase).toBe("scoring");
    expect(s1.artifacts.filter((a) => a.campaignId === "c1")).toHaveLength(0);
  });

  it("campaign_phase_advanced создаёт артефакт для не-stream", () => {
    let s = withDraftCampaign("c1", { sourceType: "own", channels: ["sms"] });
    s = reducer(s, { type: "campaign_launched", id: "c1", timestamp: "2026-06-01T00:00:00.000Z", budget: 1000, dailyBudget: null, templateIds: [] });
    s = reducer(s, { type: "campaign_phase_advanced", id: "c1" });
    const c = s.campaigns.find((x) => x.id === "c1")!;
    expect(c.phase).toBe("communicating");
    expect(s.artifacts.filter((a) => a.campaignId === "c1")).toHaveLength(1);
  });

  it("campaign_phase_advanced НЕ создаёт single-артефакт для stream", () => {
    let s = withDraftCampaign("c2", { sourceType: "stream", channels: [] });
    s = reducer(s, { type: "campaign_launched", id: "c2", timestamp: "2026-06-01T00:00:00.000Z", budget: 1000, dailyBudget: null, templateIds: [] });
    s = reducer(s, { type: "campaign_phase_advanced", id: "c2" });
    const c = s.campaigns.find((x) => x.id === "c2")!;
    expect(c.phase).toBe("communicating");
    expect(s.artifacts.filter((a) => a.campaignId === "c2" && a.variant === "single")).toHaveLength(0);
  });
});
```

> Если в тест-файле нет хелпера `withDraftCampaign`, добавь его локально: создаёт state c одной draft-кампанией нужного типа (`status: "draft"`, `phase: "scoring"`, заданные `sourceType`/`channels`). Опирайся на существующий способ конструирования state в этом файле.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/app-state.test.ts -t "post-launch sequence"`
Expected: FAIL — сейчас launch ставит `communicating` и создаёт артефакт.

- [ ] **Step 3: Change `campaign_launched` reducer**

В `src/state/app-state.ts`, в case `campaign_launched` (≈1078-1096) замени блок вычисления `phase`/артефакта:

Было:
```ts
      const phase: Campaign["phase"] = "communicating";
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const makeArtifact = !alreadyHasArtifact && !isStreamingCampaign(c);
      const launchMatched = estimateArtifactCount(c);
      const newArtifacts: Artifact[] = makeArtifact
        ? [{
            id: `art_${nanoid(8)}`,
            campaignId: c.id,
            kind: artifactKindForCampaign(c),
            count: launchMatched,
            createdAt: action.timestamp,
            variant: "single",
          }]
        : [];
```

Стало (артефакт создаётся ПОСЛЕ «обработки базы» в `campaign_phase_advanced`):
```ts
      // Последовательность прогресса теперь ПОСЛЕ запуска: стартуем в «scoring»
      // (Отправка → Проверка → Обработка базы), а артефакт + переход в
      // «communicating» ставит пост-лонч campaign_phase_advanced.
      const phase: Campaign["phase"] = "scoring";
      const newArtifacts: Artifact[] = [];
```

- [ ] **Step 4: Add stream guard to `campaign_phase_advanced`**

В case `campaign_phase_advanced` замени вычисление `newArtifacts`:

Было:
```ts
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const advanceMatched = estimateArtifactCount(c);
      const newArtifacts: Artifact[] = alreadyHasArtifact
        ? []
        : [{
```

Стало:
```ts
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const advanceMatched = estimateArtifactCount(c);
      const makeArtifact = !alreadyHasArtifact && !isStreamingCampaign(c);
      const newArtifacts: Artifact[] = !makeArtifact
        ? []
        : [{
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/state/app-state.test.ts -t "post-launch sequence"`
Expected: PASS.

- [ ] **Step 6: Run the whole app-state suite (catch regressions)**

Run: `npx vitest run src/state/app-state.test.ts`
Expected: PASS. Если что-то падает из-за смены launch-поведения — обнови ассерты (launch → `scoring`, артефакт не на запуске).

- [ ] **Step 7: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(progress): запуск в phase 'scoring' без артефакта; артефакт на пороге коммуникации (guard stream)"
```

---

## Task 4: CampaignProgress — индекс этапа из времени

**Files:**
- Modify: `src/sections/campaigns/campaign-progress.tsx` (компонент)
- Test: `src/sections/campaigns/campaign-progress.test.tsx`

- [ ] **Step 1: Wire the clock into the component**

В `src/sections/campaigns/campaign-progress.tsx`:

1. Добавь импорт хука вверху:
```ts
import { useCampaignClock } from "@/hooks/use-campaign-clock";
```

2. В компоненте `CampaignProgress` замени вывод прогресса. Было:
```ts
  const [expanded, setExpanded] = useState(defaultExpanded);
  const progress = campaignProgressStages(campaign);
  const summary = currentStageLabel(progress);
```

Стало (список этапов — по типу, индекс — из времени):
```ts
  const [expanded, setExpanded] = useState(defaultExpanded);
  const elapsed = useCampaignClock(campaign);
  const stages = campaignStageList(campaign);
  const progress: CampaignProgress = {
    stages,
    currentIndex: campaignStageAt(stages, elapsed),
  };
  const summary = currentStageLabel(progress);
```

> `campaignProgressStages` (phase-derived) остаётся экспортированной чистой функцией для юнит-тестов, но компонент её больше не использует.

- [ ] **Step 2: Update the component test to drive via launchedAt**

В `src/sections/campaigns/campaign-progress.test.tsx` найди тесты, что рендерят `<CampaignProgress>` и опираются на phase-derived индекс. Замени их на управление через `launchedAt` + фейковые таймеры. Пример (адаптируй под существующий стиль рендера в файле):

```tsx
import { render, screen } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("свежий запуск non-stream: текущий этап «Обработка базы» на 20-й секунде", () => {
  vi.setSystemTime(new Date("2026-06-01T00:00:20.000Z"));
  render(<CampaignProgress defaultExpanded campaign={{
    id: "c1", name: "C", status: "active", sourceType: "new", channels: ["sms"],
    phase: "scoring", launchedAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z", budget: 1000, templateIds: [],
  } as any} />);
  // 20с → этап «Обработка базы» текущий (провайдеры видны)
  expect(screen.getByText("Билайн")).toBeInTheDocument();
});
```

> Чисто phase-derived тесты `campaignProgressStages(...)` (без рендера компонента) НЕ трогай — они всё ещё валидны.

- [ ] **Step 3: Run the test file**

Run: `npx vitest run src/sections/campaigns/campaign-progress.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sections/campaigns/campaign-progress.tsx src/sections/campaigns/campaign-progress.test.tsx
git commit -m "feat(progress): CampaignProgress берёт индекс этапа из времени (useCampaignClock)"
```

---

## Task 5: campaign-screen — убрать пред-лонч сбор, пост-лонч таймер, гейт артефакта

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- Test: `src/sections/campaigns/campaign-screen.test.tsx`

- [ ] **Step 1: Replace the pre-launch collecting effect with a post-launch phase-advance timer**

В `src/sections/campaigns/campaign-screen.tsx`:

1. Удали константу `SCORING_WINDOW_MS` (≈ строки 26-28).
2. Замени эффект пред-лонч сбора (≈50-59) на пост-лонч переход:

Было:
```ts
  const campaignId = campaign?.id;
  const collecting = campaign ? isCollecting(campaign) : false;
  useEffect(() => {
    if (!campaignId) return;
    if (!collecting) return;
    const t = setTimeout(() => {
      dispatch({ type: "campaign_phase_advanced", id: campaignId });
    }, SCORING_WINDOW_MS);
    return () => clearTimeout(t);
  }, [campaignId, collecting, dispatch]);
```

Стало:
```ts
  const campaignId = campaign?.id;
  // Пост-лонч: на пороге коммуникации (после «Обработки базы») переводим фазу и
  // создаём артефакт. Старые кампании (elapsed > порога) — сразу без таймера.
  const launchedAtMs =
    campaign?.launchedAt ? Date.parse(campaign.launchedAt) : null;
  const needsAdvance =
    !!campaign && campaign.status === "active" && campaign.phase === "scoring";
  useEffect(() => {
    if (!campaignId || !needsAdvance || launchedAtMs === null) return;
    const stages = campaignStageList(campaign!);
    const remaining =
      communicatingThresholdMs(stages) - (Date.now() - launchedAtMs);
    const t = setTimeout(
      () => dispatch({ type: "campaign_phase_advanced", id: campaignId }),
      Math.max(0, remaining),
    );
    return () => clearTimeout(t);
  }, [campaignId, needsAdvance, launchedAtMs, campaign, dispatch]);
```

3. Обнови импорты вверху файла: убери `isCollecting` из `import { canLaunchWithGraph, isCollecting } from "./campaign-launch-gate"` → `import { canLaunchWithGraph } from "./campaign-launch-gate"`. Добавь `import { campaignStageList, communicatingThresholdMs } from "./campaign-progress";` (или дополни существующий импорт из `./campaign-progress`).

- [ ] **Step 2: Drop `collectingNow` and its gates**

1. Удали `const collectingNow = isCollecting(campaign);` (≈74).
2. `started`: было `collectingNow || isActive || status === "paused" || isCompleted` → `isActive || status === "paused" || isCompleted`.
3. `showLaunch`: было `(status === "draft" && !collectingNow) || status === "paused"` → `status === "draft" || status === "paused"`.
4. Секция «Артефакты» (≈245): было `{(campaignArtifacts.length > 0 || collectingNow) && (` → `{campaignArtifacts.length > 0 && (`. Внутри `CampaignArtifactsBlock` убери проп `forming={collectingNow}` (или передай `forming={false}` — сверься с сигнатурой; если проп обязателен, ставь `false`).

- [ ] **Step 3: Update campaign-screen tests for the new gates**

В `src/sections/campaigns/campaign-screen.test.tsx`:
- Тест на пред-лонч «collecting»/`isCollecting` (если есть) — удали или перепиши: свеже-запущенная (active, phase "scoring", свежий `launchedAt`) показывает степпер с ранним этапом и БЕЗ артефакта.
- Добавь:

```tsx
import { vi, beforeEach, afterEach } from "vitest";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("свеже-запущенная (phase scoring) — артефакт скрыт до порога коммуникации", () => {
  vi.setSystemTime(new Date("2026-06-01T00:00:10.000Z")); // +10с (< 46с)
  renderCampaign(baseCampaign({
    id: "cmp_fresh", status: "active", sourceType: "new", channels: ["sms"],
    phase: "scoring", launchedAt: "2026-06-01T00:00:00.000Z",
  }));
  expect(screen.queryByText("Артефакты")).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the test file**

Run: `npx vitest run src/sections/campaigns/campaign-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(progress): пост-лонч переход фазы; артефакт скрыт до «Обработки базы»; убран пред-лонч сбор"
```

---

## Task 6: Статистика пустая до коммуникации

**Files:**
- Modify: `src/sections/campaigns/campaign-stats-block.tsx`
- Modify: `src/sections/campaigns/campaign-screen.tsx` (проброс `populated`)
- Test: `src/sections/campaigns/campaign-screen.test.tsx`

- [ ] **Step 1: Write failing test**

Добавь в `src/sections/campaigns/campaign-screen.test.tsx`:

```tsx
it("статистика пустая (—) до коммуникации, наполняется после", () => {
  vi.setSystemTime(new Date("2026-06-01T00:00:10.000Z")); // scoring
  const { rerender } = renderCampaign(baseCampaign({
    id: "cmp_stat", status: "active", sourceType: "new", channels: ["sms"],
    phase: "scoring", launchedAt: "2026-06-01T00:00:00.000Z",
  }));
  // до коммуникации: секция есть, но метрики отправок = «—»
  expect(screen.getByText("Статистика")).toBeInTheDocument();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sections/campaigns/campaign-screen.test.tsx -t "статистика пустая"`
Expected: FAIL — сейчас метрики считаются из `status` (не пустые).

- [ ] **Step 3: Add `populated` prop to `CampaignStatsBlock`**

В `src/sections/campaigns/campaign-stats-block.tsx`:

1. Расширь props:
```ts
interface CampaignStatsBlockProps {
  campaign: Campaign;
  artifact?: Artifact;
  /** false → метрики отправок/кликов/действий/CR пустые («—») до коммуникации. */
  populated?: boolean;
}
```

2. В компоненте:
```ts
export function CampaignStatsBlock({ campaign, artifact, populated = true }: CampaignStatsBlockProps) {
  const stats = buildCampaignStats(campaign, artifact);
  if (!stats) return null;
  const isDegenerate = (campaign.channels?.length ?? 0) === 0;
  const dash = "—";
```

3. В funnel-гриде подставляй `dash` когда `!populated`:
```tsx
          <div className="grid grid-cols-4 gap-2">
            <Metric label="Отправки" value={populated ? formatNumber(stats.sends) : dash} />
            <Metric label="Клики" value={populated ? formatNumber(Math.round(stats.sends * 0.18)) : dash} />
            <Metric label="Действия" value={populated ? formatNumber(Math.round(stats.sends * 0.07)) : dash} />
            <Metric label="CR" value={populated ? `${stats.crPct.toFixed(1)}%` : dash} />
          </div>
```

(Строки бюджета оставь как есть — расчётный/факт бюджет не гейтим.)

- [ ] **Step 4: Pass `populated` from campaign-screen**

В `src/sections/campaigns/campaign-screen.tsx`, в секции «Статистика» (≈238-242):
```tsx
      {hasStats && (
        <CardSection label="Статистика">
          <CampaignStatsBlock
            campaign={campaign}
            artifact={campaignArtifact}
            populated={campaign.phase === "communicating" || isCompleted}
          />
        </CardSection>
      )}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/sections/campaigns/campaign-screen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sections/campaigns/campaign-stats-block.tsx src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-screen.test.tsx
git commit -m "feat(progress): статистика пустая (—) до коммуникации (populated), наполняется после"
```

---

## Task 7: Удалить `isCollecting` и почистить хвосты

**Files:**
- Modify: `src/sections/campaigns/campaign-launch-gate.ts`
- Test: `src/sections/campaigns/campaign-launch-gate.test.ts`

- [ ] **Step 1: Remove `isCollecting`**

В `src/sections/campaigns/campaign-launch-gate.ts` удали функцию `isCollecting` (строки ≈9-11) и любое её упоминание в `canLaunchCampaign` (строка ≈15: `if (c.status === "draft") return c.sourceType === "new" ? !isCollecting(c) : true;`). Т.к. пред-лонч сбора больше нет, черновик готов к запуску всегда: замени эту ветку на:
```ts
  if (c.status === "draft") return true;
```

- [ ] **Step 2: Update the launch-gate tests**

В `src/sections/campaigns/campaign-launch-gate.test.ts` удали тесты, завязанные на `isCollecting` (сбор перед запуском), либо перепиши под «draft → можно запускать». Убедись, что импорт `isCollecting` удалён.

- [ ] **Step 3: Grep for leftover references**

Run: `grep -rn "isCollecting\|collectingNow\|SCORING_WINDOW" src/`
Expected: пусто (кроме, возможно, комментариев — удали и их).

- [ ] **Step 4: Run type-check, lint, full suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"   # ожидаем базовые 13, без новых
npx eslint src/sections/campaigns/campaign-screen.tsx src/sections/campaigns/campaign-progress.tsx src/hooks/use-campaign-clock.ts src/sections/campaigns/campaign-stats-block.tsx src/sections/campaigns/campaign-launch-gate.ts
npm test 2>&1 | tail -4
```
Expected: tsc — без новых ошибок; eslint — чисто; все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-launch-gate.ts src/sections/campaigns/campaign-launch-gate.test.ts
git commit -m "chore(progress): удалить пред-лонч isCollecting/SCORING_WINDOW"
```

---

## Task 8: Живая проверка (browser)

**Files:** нет (ручная/скриптовая проверка на :3000)

- [ ] **Step 1: Verify the sequence live**

Через throwaway Playwright-спек (как в прошлых ревью) или руками на :3000:
- Засеять кампанию `active`, `phase: "scoring"`, `launchedAt = now`.
- t≈4с → текущий этап «Отправка провайдерам»; t≈12с → «Проверка провайдерами»; t≈30с → «Обработка базы» с провайдерами (Билайн→Мегафон→МТС); t≈50с → «Коммуникация по сигналам».
- Артефакт: секции нет до ~46с, появляется после.
- Статистика: отправки/клики/действия/CR = «—» до ~46с, затем числа.

- [ ] **Step 2: Скрин в компаньон (визуальное ревью)** и показать пользователю.

---

## Self-review notes (спека → план)

- Модель от `launchedAt` — Task 1 (`campaignStageAt`) + Task 2 (часы) + Task 4 (компонент). ✓
- Тайминг 8/8/30, порог 46/8 — Task 1 (`STAGE_DURATION_MS`, `communicatingThresholdMs`). ✓
- Пред-лонч сбор убран — Task 5 (эффект) + Task 7 (`isCollecting`). ✓
- Все типы (stream порог 8с) — Task 1 (`isLast`-терминал), Task 3 (stream guard артефакта). ✓
- Провайдеры под «process» — без изменений (существующий `isProcess && current`). ✓
- Артефакт после «Обработки базы» — Task 3 (создаётся в phase_advanced) + Task 5 (гейт секции). ✓
- Статистика пустая до коммуникации — Task 6 (`populated`). ✓
- Пауза замораживает elapsed — Task 2 (`computeElapsed` через pausedAt). ✓
