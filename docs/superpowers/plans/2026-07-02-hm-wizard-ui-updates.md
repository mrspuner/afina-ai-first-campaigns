# HM Wizard — пакет UI-правок — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Внести семь независимых UI-правок в визард создания кампании, экран артефакта, ноды workflow и карточки кампании.

**Architecture:** Каждая правка локальна (1–2 файла) и не зависит от остальных. TDD: сначала падающий тест (vitest / react-testing-library), потом минимальная реализация. Каждая правка — отдельный коммит. В конце — обновление визуальных Playwright-бейзлайнов.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, vitest + @testing-library/react (юнит), Playwright (e2e/visual), lucide-react, motion/react.

**Спек:** `docs/superpowers/specs/2026-07-02-hm-wizard-ui-updates-design.md`

**Команды:**
- Юнит-тест одного файла: `npm test -- src/path/to/file.test.tsx`
- Все юнит-тесты: `npm test`
- Lint: `npm run lint`
- Визуальные снапшоты (обновление): `npm run test:visual:update` (браузер: см. примечание ниже)

**Примечание про Playwright.** В окружении версия браузера расходится с pinned playwright. Для визуальных снапшотов задать `executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome` (через временный `test.use({ launchOptions })` или переменную). Если снапшоты обновить не удаётся в этом окружении — зафиксировать это в отчёте, не блокируя юнит-часть.

---

## Task 1: Кнопка «Назад» на экране «Интересы»

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-2-interests.tsx`

**Контекст.** `StepFooter` рендерит «Назад» при наличии `onBack`. `campaign-workspace.tsx` уже передаёт `onBack` во все шаги. Все шаги, кроме `Step2Interests`, уже пробрасывают его в футер. `Step2Interests` деструктурирует `{ data, onNext, active }` без `onBack`.

- [ ] **Step 1: Написать падающий тест**

Создать/дополнить `src/sections/campaigns/wizard/steps/step-2-interests.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Step2Interests } from "./step-2-interests";
import { initialStepData } from "@/types/campaign";

describe("Step2Interests — кнопка «Назад»", () => {
  it("рендерит «Назад» и вызывает onBack по клику", async () => {
    const onBack = vi.fn();
    render(
      <Step2Interests data={initialStepData} onNext={vi.fn()} onBack={onBack} active />,
    );
    const back = await screen.findByRole("button", { name: "Назад" });
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-2-interests.test.tsx`
Expected: FAIL — кнопки «Назад» нет.

- [ ] **Step 3: Реализация**

В `step-2-interests.tsx` принять `onBack` и передать в футер:

```tsx
export function Step2Interests({ data, onNext, onBack, active }: StepProps) {
```

и в `StepFooter`:

```tsx
        <StepFooter
          onBack={onBack}
          onContinue={handleContinue}
          continueDisabled={!canContinue}
        />
```

(проп `hint` тут же удаляется в Task 2 — можно сделать сразу или в Task 2.)

- [ ] **Step 4: Запустить тест — PASS**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-2-interests.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-2-interests.tsx src/sections/campaigns/wizard/steps/step-2-interests.test.tsx
git commit -m "feat(wizard): кнопка «Назад» на шаге «Интересы»"
```

---

## Task 2: Подсказка «если нужного нет — напишите в чат» → под заголовок

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/step-2-interests.tsx`

- [ ] **Step 1: Написать падающий тест**

Дополнить `step-2-interests.test.tsx`:

```tsx
it("показывает подсказку про чат в подзаголовке, а не в футере", () => {
  render(<Step2Interests data={initialStepData} onNext={vi.fn()} onBack={vi.fn()} active />);
  expect(
    screen.getByText(/Если нужного нет в списке — напишите в поле чата\./),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-2-interests.test.tsx`
Expected: FAIL — точка в конце / текст в подзаголовке отсутствует (сейчас в hint без точки).

- [ ] **Step 3: Реализация**

Убрать `hint=...` из `StepFooter`; дописать предложение в `subtitle`:

```tsx
    <StepContent
      title="Какие интересы и триггеры вы ищете?"
      subtitle="Мы уже сгенерили настройки под вас — выберите интересы и триггеры в любом порядке. Если нужного нет в списке — напишите в поле чата."
    >
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/campaigns/wizard/steps/step-2-interests.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/wizard/steps/step-2-interests.tsx src/sections/campaigns/wizard/steps/step-2-interests.test.tsx
git commit -m "feat(wizard): подсказку про чат перенесли в подзаголовок шага «Интересы»"
```

---

## Task 3: Каденс-хелпер + чипы «Разовая/Потоковая»

**Files:**
- Create: `src/sections/campaigns/campaign-cadence.ts`
- Create: `src/sections/campaigns/campaign-cadence.test.ts`
- Modify: `src/sections/campaigns/campaign-card.tsx`
- Modify: `src/sections/campaigns/campaign-screen.tsx`

- [ ] **Step 1: Написать падающий тест хелпера**

`src/sections/campaigns/campaign-cadence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { campaignCadenceLabel } from "./campaign-cadence";

describe("campaignCadenceLabel", () => {
  it("stream → Потоковая", () => expect(campaignCadenceLabel("stream")).toBe("Потоковая"));
  it("new → Разовая", () => expect(campaignCadenceLabel("new")).toBe("Разовая"));
  it("own → Разовая", () => expect(campaignCadenceLabel("own")).toBe("Разовая"));
  it("undefined → null", () => expect(campaignCadenceLabel(undefined)).toBeNull());
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/campaign-cadence.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализация хелпера**

`src/sections/campaigns/campaign-cadence.ts`:

```ts
import type { SourceType } from "@/types/campaign";

/** Каденс кампании для чипа карточки. stream → потоковая; new/own → разовая;
 *  не определён → null (чип не показываем). Тип источника пользователю не
 *  показываем — только разовая/потоковая. */
export function campaignCadenceLabel(
  sourceType: SourceType | undefined,
): "Разовая" | "Потоковая" | null {
  if (!sourceType) return null;
  return sourceType === "stream" ? "Потоковая" : "Разовая";
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/campaigns/campaign-cadence.test.ts`
Expected: PASS.

- [ ] **Step 5: Тест карточки-списка**

Дополнить `src/sections/campaigns/campaign-card.tsx` использованием хелпера. Тест (создать `campaign-card.test.tsx`, если нет):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignCard } from "./campaign-card";
import type { Campaign } from "@/state/app-state";

const base: Campaign = {
  id: "c1", name: "Кампания", status: "draft", createdAt: "2026-06-01T00:00:00Z",
  sourceType: "stream", channels: ["sms"],
  scenario: { id: "base-registration", name: "Регистрация" },
} as Campaign;

describe("CampaignCard — чип каденса", () => {
  it("stream → «Потоковая», без чипа источника", () => {
    render(<CampaignCard campaign={base} onOpen={vi.fn()} />);
    expect(screen.getByText("Потоковая")).toBeInTheDocument();
    expect(screen.queryByText("Поток")).not.toBeInTheDocument();
  });
  it("new → «Разовая»", () => {
    render(<CampaignCard campaign={{ ...base, sourceType: "new" }} onOpen={vi.fn()} />);
    expect(screen.getByText("Разовая")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/campaign-card.test.tsx`
Expected: FAIL — сейчас чип «Поток», а не «Потоковая».

- [ ] **Step 7: Реализация в `campaign-card.tsx`**

Удалить `SOURCE_LABEL` и `sourceLabel`; импортировать хелпер; заменить блок чипа источника на каденс:

```tsx
import { campaignCadenceLabel } from "./campaign-cadence";
// ...
  const cadenceLabel = campaignCadenceLabel(campaign.sourceType);
// ... в разметке, вместо блока sourceLabel:
          {cadenceLabel && (
            <span className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {cadenceLabel}
            </span>
          )}
```

Удалить неиспользуемый импорт `SourceType`, если он больше не нужен.

- [ ] **Step 8: Реализация в `campaign-screen.tsx`**

В блок `tags` добавить каденс-чип рядом со «Сценарий»:

```tsx
import { campaignCadenceLabel } from "./campaign-cadence";
// ... внутри компонента:
  const cadenceLabel = campaignCadenceLabel(campaign.sourceType);
// ... в tags:
      tags={
        <>
          <CardTag>Сценарий: {scenarioName}</CardTag>
          {cadenceLabel && <CardTag>{cadenceLabel}</CardTag>}
        </>
      }
```

- [ ] **Step 9: Запустить тесты — PASS**

Run: `npm test -- src/sections/campaigns/campaign-card.test.tsx src/sections/campaigns/campaign-cadence.test.ts`
Expected: PASS. Также `npm run lint` — нет неиспользуемых импортов.

- [ ] **Step 10: Commit**

```bash
git add src/sections/campaigns/campaign-cadence.ts src/sections/campaigns/campaign-cadence.test.ts src/sections/campaigns/campaign-card.tsx src/sections/campaigns/campaign-card.test.tsx src/sections/campaigns/campaign-screen.tsx
git commit -m "feat(campaigns): чип «Разовая/Потоковая» вместо типа источника"
```

---

## Task 4: «Создать новый шаблон» — маскот Афина ИИ вместо плюса

**Files:**
- Modify: `src/sections/campaigns/node-template-select.tsx`
- Test: `src/sections/campaigns/node-template-select.test.tsx`

- [ ] **Step 1: Написать падающий тест**

Дополнить `node-template-select.test.tsx`:

```tsx
it("пункт «Создать новый шаблон» показывает маскот, а не плюс", async () => {
  // отрисовать селект, открыть попап (как в существующих тестах файла)
  // затем:
  const item = await screen.findByText("Создать новый шаблон");
  const row = item.closest("[cmdk-item], [role='option']") ?? item.parentElement!;
  expect(row.querySelector("img")).toBeTruthy(); // маскот-иконка <Image>/<img>
});
```

(Подстроить открытие попапа под существующий паттерн в этом тест-файле.)

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/node-template-select.test.tsx`
Expected: FAIL — сейчас там `<Plus>` (svg), не `img`.

- [ ] **Step 3: Реализация**

В `node-template-select.tsx`: импортировать `Image`, заменить иконку пункта:

```tsx
import Image from "next/image";
// ...
              <CommandItem value="__create__" onSelect={() => { onCreate(); setOpen(false); }}>
                <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
                <span>Создать новый шаблон</span>
              </CommandItem>
```

Убрать `Plus` из импорта `lucide-react` (в этом файле он больше не используется — проверить).

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/campaigns/node-template-select.test.tsx`
Expected: PASS. `npm run lint` — нет неиспользуемого `Plus`.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/node-template-select.tsx src/sections/campaigns/node-template-select.test.tsx
git commit -m "feat(workflow): маскот Афина ИИ на пункте «Создать новый шаблон»"
```

---

## Task 5: Гейт запуска — незаполненная нода блокирует «Запустить»

**Files:**
- Modify: `src/sections/campaigns/campaign-screen.tsx`
- Test: `src/sections/campaigns/campaign-screen.test.tsx` (или новый фокус-тест логики)

**Контекст.** Кнопка «Запустить» в карточке гейтится только `canLaunchCampaign(campaign)` и не учитывает валидацию графа. Граф кампании доступен через `getCachedGraph(campaign.id) ?? createTemplate(signalType, sourceType, channels)` (тот же приём, что в `campaign-payment-screen.tsx`). `validateWorkflow(graph, true)` пересчитывает `needsAttention` сам, поэтому дополнительный `computeNeedsAttention` не нужен.

- [ ] **Step 1: Написать падающий тест логики гейта**

Проще всего протестировать чистую комбинацию. Добавить в `campaign-screen.tsx` экспортируемый хелпер и покрыть его:

`src/sections/campaigns/campaign-launch-gate.ts` — расширить:

```ts
import { validateWorkflow } from "@/state/workflow-validation";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

/** Полный гейт кнопки «Запустить» в карточке: базовый статус-гейт И валидность
 *  графа (нет нод needs-attention / есть success-путь). Граф передаёт вызывающий
 *  (из durable-кэша либо шаблона). null-граф → не блокируем по графу. */
export function canLaunchWithGraph(
  c: GateCampaign,
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null,
): boolean {
  if (!canLaunchCampaign(c)) return false;
  if (!graph) return true;
  return validateWorkflow(graph, true).ok;
}
```

Тест `src/sections/campaigns/campaign-launch-gate.test.ts` (дополнить):

```ts
import { canLaunchWithGraph } from "./campaign-launch-gate";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

function graphWith(nodes: WorkflowNode[], edges: WorkflowEdge[] = []) {
  return { nodes, edges };
}
const successNode = { id: "s", data: { nodeType: "success", isSuccess: true, params: { kind: "success", goal: "Оплата" } } } as unknown as WorkflowNode;
const emptySms = { id: "m", data: { nodeType: "sms", params: { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" } } } as unknown as WorkflowNode;
const filledSms = { id: "m", data: { nodeType: "sms", params: { kind: "sms", text: "Привет", alphaName: "A", scheduledAt: "immediate" } } } as unknown as WorkflowNode;

describe("canLaunchWithGraph", () => {
  const draftStream = { status: "draft", sourceType: "stream" } as const;
  it("пустой шаблон (needs-attention) блокирует запуск", () => {
    expect(canLaunchWithGraph(draftStream, graphWith([emptySms, successNode], [{ id: "e", source: "m", target: "s" } as WorkflowEdge]))).toBe(false);
  });
  it("заполненный шаблон + success-путь → запуск разрешён", () => {
    expect(canLaunchWithGraph(draftStream, graphWith([filledSms, successNode], [{ id: "e", source: "m", target: "s" } as WorkflowEdge]))).toBe(true);
  });
  it("нет графа → базовый гейт", () => {
    expect(canLaunchWithGraph(draftStream, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/campaign-launch-gate.test.ts`
Expected: FAIL — `canLaunchWithGraph` не существует.

- [ ] **Step 3: Реализация хелпера**

Добавить `canLaunchWithGraph` в `campaign-launch-gate.ts` (код из Step 1).

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/campaigns/campaign-launch-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Подключить в `campaign-screen.tsx`**

```tsx
import { canLaunchWithGraph, isCollecting } from "./campaign-launch-gate";
import { getCachedGraph } from "./workflow-graph-cache";
import { createTemplate } from "@/state/workflow-templates";
// ... где считается canLaunch (строка ~68):
  const launchGraph =
    getCachedGraph(campaign.id) ??
    (signalType
      ? createTemplate(signalType, campaign.sourceType, campaign.channels ?? [])
      : null);
  const canLaunch = canLaunchWithGraph(campaign, launchGraph);
```

Заменить старую строку `const canLaunch = canLaunchCampaign(campaign);`. Оставить существующий импорт `canLaunchCampaign` только если он ещё используется; иначе убрать (проверить lint). `isCollecting` продолжает использоваться.

- [ ] **Step 6: Проверка сборки/линта и юнитов**

Run: `npm run lint && npm test -- src/sections/campaigns/campaign-launch-gate.test.ts`
Expected: чисто, PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sections/campaigns/campaign-launch-gate.ts src/sections/campaigns/campaign-launch-gate.test.ts src/sections/campaigns/campaign-screen.tsx
git commit -m "fix(campaigns): незаполненная нода (шаблон) блокирует запуск кампании из карточки"
```

---

## Task 6: Экран артефакта — динамический статус + убрать «Об артефакте»

**Files:**
- Modify: `src/sections/artifacts/artifact-screen.tsx`
- Test: `src/sections/artifacts/artifact-screen.test.tsx`

**Контекст.** `ArtifactScreenView` получает `campaign` и `artifact`. `isCollection = artifact.variant === "cumulative"`. Динамический статус: коллекция + кампания не завершена → «собирается»; иначе → «собран». Секция «Об артефакте» (label="Об артефакте") удаляется целиком; хелпер `SummaryRow` остаётся (используется в «Настройки кампании-источника»).

- [ ] **Step 1: Написать падающие тесты**

Дополнить `artifact-screen.test.tsx`:

```tsx
it("активная потоковая коллекция → статус «собирается, обновляется каждый день в 00:00»", () => {
  render(
    <ArtifactScreenView
      artifact={{ id: "a", campaignId: "c", kind: "signals_conversions", count: 10, createdAt: "2026-06-14T09:00:00Z", variant: "cumulative" } as any}
      campaign={{ id: "c", name: "Поток", status: "active" } as any}
      campaignName="Поток"
      dailies={[]}
      onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.getByText(/Артефакт собирается, обновляется каждый день в 00:00/)).toBeInTheDocument();
});

it("завершённая коллекция → «Артефакт собран»", () => {
  render(
    <ArtifactScreenView
      artifact={{ id: "a", campaignId: "c", kind: "signals_conversions", count: 10, createdAt: "2026-06-14T09:00:00Z", variant: "cumulative" } as any}
      campaign={{ id: "c", name: "Поток", status: "completed" } as any}
      campaignName="Поток" dailies={[]}
      onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.getByText(/Артефакт собран/)).toBeInTheDocument();
});

it("секция «Об артефакте» удалена", () => {
  render(
    <ArtifactScreenView
      artifact={{ id: "a", campaignId: "c", kind: "signals", count: 10, createdAt: "2026-06-14T09:00:00Z" } as any}
      campaign={{ id: "c", name: "К", status: "active" } as any}
      campaignName="К" onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByText("Об артефакте")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/artifacts/artifact-screen.test.tsx`
Expected: FAIL (нет «собирается»; есть «Об артефакте»).

- [ ] **Step 3: Реализация — динамический статус в `meta`**

Заменить `meta={...}` на:

```tsx
      meta={
        isCollection && campaign?.status !== "completed" ? (
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
            Артефакт собирается, обновляется каждый день в 00:00
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
            Артефакт собран · {new Date(artifact.createdAt).toLocaleString("ru-RU")}
          </span>
        )
      }
```

Импорт: добавить `RefreshCw` в импорт из `lucide-react` (рядом с `CheckCircle2, Download, Trash2`).

- [ ] **Step 4: Реализация — удалить секцию «Об артефакте»**

Удалить блок:

```tsx
      <CardSection label="Об артефакте"> ... </CardSection>
```

(целиком, между секцией «Дневные выжимки» и «Настройки кампании-источника»). `SummaryRow` не трогать.

- [ ] **Step 5: Запустить — PASS**

Run: `npm test -- src/sections/artifacts/artifact-screen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sections/artifacts/artifact-screen.tsx src/sections/artifacts/artifact-screen.test.tsx
git commit -m "feat(artifacts): динамический статус артефакта потока; убрали секцию «Об артефакте»"
```

---

## Task 7: Дневные выжимки — скрытие >5 + «Показать все (N)» (экран артефакта)

**Files:**
- Modify: `src/sections/artifacts/artifact-screen.tsx`
- Test: `src/sections/artifacts/artifact-screen.test.tsx`

**Контекст.** Секция «Дневные выжимки» рендерит `dailies.map(...)` целиком. Ввести локальный `expanded`-стейт: при `dailies.length > 5` показывать `slice(0,5)` + кнопку-тоггл. `ArtifactScreenView` — функциональный компонент; добавить `useState`.

- [ ] **Step 1: Написать падающий тест**

Дополнить `artifact-screen.test.tsx` (сгенерировать 7 выжимок):

```tsx
function daily(i: number) {
  return { id: `d${i}`, campaignId: "c", kind: "signals_conversions", count: 100 + i, createdAt: `2026-06-${10 + i}T09:00:00Z`, variant: "daily", periodDate: `2026-06-${10 + i}` } as any;
}

it("выжимок >5 → показаны 5 и кнопка «Показать все (7)», клик разворачивает", async () => {
  const dailies = Array.from({ length: 7 }, (_, i) => daily(i));
  render(
    <ArtifactScreenView
      artifact={{ id: "a", campaignId: "c", kind: "signals_conversions", count: 999, createdAt: "2026-06-20T09:00:00Z", variant: "cumulative" } as any}
      campaign={{ id: "c", name: "Поток", status: "active" } as any}
      campaignName="Поток" dailies={dailies}
      onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(5);
  const btn = screen.getByRole("button", { name: "Показать все (7)" });
  btn.click();
  expect(await screen.findAllByText(/^Выжимка · /)).toHaveLength(7);
  expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
});

it("выжимок ≤5 → кнопки нет", () => {
  const dailies = Array.from({ length: 4 }, (_, i) => daily(i));
  render(
    <ArtifactScreenView
      artifact={{ id: "a", campaignId: "c", kind: "signals_conversions", count: 1, createdAt: "2026-06-20T09:00:00Z", variant: "cumulative" } as any}
      campaign={{ id: "c", name: "Поток", status: "active" } as any}
      campaignName="Поток" dailies={dailies}
      onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: /Показать все/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/artifacts/artifact-screen.test.tsx`
Expected: FAIL — показаны все 7, кнопки нет.

- [ ] **Step 3: Реализация**

`ArtifactScreenView` сделать stateful. В начало функции:

```tsx
import { useState } from "react";
// ...
export function ArtifactScreenView({ ... }: ArtifactScreenViewProps) {
  const kindLabel = ARTIFACT_KIND_LABEL[artifact.kind];
  const isCollection = artifact.variant === "cumulative";
  const [dailiesExpanded, setDailiesExpanded] = useState(false);
```

Секцию «Дневные выжимки» заменить на:

```tsx
      {isCollection && dailies && (
        <CardSection label="Дневные выжимки">
          <div className="flex flex-col">
            {(dailiesExpanded ? dailies : dailies.slice(0, 5)).map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-t border-border/40 py-2.5 text-sm first:border-t-0">
                <span className="flex-1 text-foreground">
                  Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}
                  <span className="ml-2 tabular-nums text-muted-foreground">{d.count.toLocaleString("ru-RU")}</span>
                </span>
                <Button variant="outline" size="icon" aria-label="Скачать выжимку" onClick={() => onDownloadDaily?.(d.id)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {dailies.length > 5 && (
            <button
              type="button"
              onClick={() => setDailiesExpanded((v) => !v)}
              className="mt-2 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {dailiesExpanded ? "Свернуть" : `Показать все (${dailies.length})`}
            </button>
          )}
        </CardSection>
      )}
```

(Кнопка — простой тоггл; height-анимацию можно опустить на экране артефакта: список короткий, а PRODUCT.md запрещает анимировать height. Достаточно мгновенного показа. Компактный блок карточки в Task 8 анимируется через уже готовый `collapseMotion`-паттерн, если требуется.)

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/artifacts/artifact-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifact-screen.tsx src/sections/artifacts/artifact-screen.test.tsx
git commit -m "feat(artifacts): скрытие дневных выжимок >5 + «Показать все (N)» на экране артефакта"
```

---

## Task 8: Компактный блок карточки — порог 5 + «Показать все (N)»

**Files:**
- Modify: `src/sections/campaigns/campaign-artifacts-block.tsx`
- Test: `src/sections/campaigns/campaign-artifacts-block.test.tsx`

**Контекст.** Компонент сейчас показывает cumulative-строку + `dailies.slice(0, 3)` + статичный текст `…ещё N выжимок`. Правка: порог `slice(0, 5)`, статичный текст заменить на кликабельный тоггл «Показать все (N)» / «Свернуть» с локальным `expanded`. `N` = общее число выжимок (`dailies.length`). Клик по тогглу — inline-разворот, `stopPropagation` (строки выжимок ведут на артефакт через `onOpen`). Компонент — стрелочная функция без хуков; добавить `useState` (`"use client"` уже стоит).

- [ ] **Step 1: Написать падающий тест**

Дополнить `campaign-artifacts-block.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import type { Artifact } from "@/state/app-state";

function daily(i: number): Artifact {
  return { id: `d${i}`, campaignId: "c", kind: "signals_conversions", count: 100 + i, createdAt: `2026-06-${10 + i}T09:00:00Z`, variant: "daily", periodDate: `2026-06-${10 + i}` } as Artifact;
}
const cumulative = { id: "cum", campaignId: "c", kind: "signals_conversions", count: 9999, createdAt: "2026-06-20T09:00:00Z", variant: "cumulative" } as Artifact;

describe("CampaignArtifactsBlock — тоггл выжимок", () => {
  it(">5 выжимок → показаны 5 и «Показать все (7)»; клик разворачивает", async () => {
    const artifacts = [cumulative, ...Array.from({ length: 7 }, (_, i) => daily(i))];
    render(<CampaignArtifactsBlock artifacts={artifacts} onOpen={vi.fn()} />);
    expect(screen.getAllByText(/^Выжимка · /)).toHaveLength(5);
    screen.getByRole("button", { name: "Показать все (7)" }).click();
    expect(await screen.findAllByText(/^Выжимка · /)).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Свернуть" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm test -- src/sections/campaigns/campaign-artifacts-block.test.tsx`
Expected: FAIL — показаны 3 + текст «…ещё N».

- [ ] **Step 3: Реализация**

В `campaign-artifacts-block.tsx` внутри ветки `if (cumulative)` заменить `shown`/хвост:

```tsx
import { useState } from "react";
// ...
export function CampaignArtifactsBlock({ artifacts, forming, onOpen }: CampaignArtifactsBlockProps) {
  const [expanded, setExpanded] = useState(false);
  // ... существующий пустой/forming-гард без изменений ...

  const cumulative = artifacts.find((a) => a.variant === "cumulative");
  if (cumulative) {
    const dailies = artifacts
      .filter((a) => a.variant === "daily")
      .sort((a, b) => {
        const ap = a.periodDate ?? "";
        const bp = b.periodDate ?? "";
        return ap < bp ? 1 : ap > bp ? -1 : 0;
      });
    const shown = expanded ? dailies : dailies.slice(0, 5);
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onOpen ? () => onOpen(cumulative.id) : undefined}
          disabled={!onOpen}
          className="flex items-center gap-3 py-2.5 text-left text-sm transition-colors enabled:hover:text-foreground disabled:cursor-default"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">Все сигналы за период</span>
          <span className="text-muted-foreground">{formatNumber(cumulative.count)} сигналов</span>
        </button>
        {shown.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={onOpen ? () => onOpen(cumulative.id) : undefined}
            disabled={!onOpen}
            className="flex items-center gap-3 border-t border-border/40 py-2.5 text-left text-sm transition-colors enabled:hover:text-foreground disabled:cursor-default"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-foreground">
              Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(d.count)}</span>
          </button>
        ))}
        {dailies.length > 5 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="mt-1 self-start border-t border-border/40 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? "Свернуть" : `Показать все (${dailies.length})`}
          </button>
        )}
      </div>
    );
  }
  // ... остальной return без изменений ...
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm test -- src/sections/campaigns/campaign-artifacts-block.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/campaigns/campaign-artifacts-block.tsx src/sections/campaigns/campaign-artifacts-block.test.tsx
git commit -m "feat(campaigns): компактный блок артефактов — порог 5 + «Показать все (N)»"
```

---

## Task 9: Полный прогон тестов + обновление визуальных бейзлайнов

**Files:**
- Modify (снапшоты): `tests/e2e/screens.visual.spec.ts-snapshots/*.png` (artifact-collection-detail, campaign-card, section-campaigns, и др. затронутые)

- [ ] **Step 1: Все юнит-тесты + lint**

Run: `npm test && npm run lint`
Expected: всё зелёное. Починить регрессии, если появились (например, старые тесты `campaign-card` на «Поток» — обновить под «Потоковая»; тесты, ожидавшие «Об артефакте» — снять).

- [ ] **Step 2: Обновить визуальные снапшоты**

Затронутые экраны: `artifact-collection-detail` (Task 6/7), `campaign-card` + `section-campaigns` (Task 3), возможно `artifacts-collection`. Обновить бейзлайны:

Run: `npm run test:visual:update` (с `executablePath` браузера из примечания — если стандартный запуск падает на версии браузера, задать launchOptions временно в `playwright.config.ts` или через env).
Expected: PNG обновлены только на затронутых экранах.

Если окружение не даёт запустить визуальные тесты — зафиксировать в отчёте, не блокируя остальную работу.

- [ ] **Step 3: Commit снапшотов**

```bash
git add tests/e2e/screens.visual.spec.ts-snapshots
git commit -m "test(visual): обновлены бейзлайны под правки артефактов и карточек кампаний"
```

- [ ] **Step 4: Push**

```bash
git push -u origin claude/hm-wizard-ui-updates-cusfnu
```

---

## Self-Review (заполняется автором плана)

- **Покрытие спека:** Правки 1–7 → Tasks 1–8; общий прогон/снапшоты → Task 9. ✓
- **Плейсхолдеры:** нет TBD/«добавить обработку ошибок» — весь код приведён. ✓
- **Согласованность типов:** `campaignCadenceLabel` возвращает `"Разовая" | "Потоковая" | null`, используется единообразно в Task 3; `canLaunchWithGraph(c, graph|null)` — сигнатура согласована между реализацией и вызовом; `validateWorkflow(graph, true)` — как в `workflow-section.tsx`. ✓
- **Порядок:** Tasks 1–8 независимы; Task 6 и Task 7 оба правят `artifact-screen.tsx` — делать последовательно (6 → 7), общий тест-файл. Task 1 и 2 оба правят `step-2-interests.tsx` — последовательно (1 → 2).
