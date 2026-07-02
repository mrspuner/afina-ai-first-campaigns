# UI Polish: Section Cards & Visual Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add signal/campaign cards to sidebar sections, hide step badges after onboarding, and fix the floating chat bar overlap.

**Architecture:** Five independent tasks — two component rewrites (`signal-type-view`, `campaign-type-view`), one state addition + prop wiring in `page.tsx`, one visual scrim fix in `page.tsx`, one padding fix in `welcome-view`. No new files needed.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4

---

## File Map

| File | Change |
|---|---|
| `src/components/signal-type-view.tsx` | Full rewrite — section header, signal card, updated props |
| `src/components/campaign-type-view.tsx` | Add section header, campaign card, updated props |
| `src/components/welcome-view.tsx` | Fix bottom padding to prevent chat overlap |
| `src/app/page.tsx` | Add `signalCreatedAt` + `campaignLaunchedAt` state; wire new props; hide badges; add gradient scrim |

---

## Task 1 — Hide step badges when onboarding complete

**Files:**
- Modify: `src/app/page.tsx:303-339`

- [ ] **Step 1: Wrap badges block in `!campaignDone` guard**

Find lines 303–340 (the step badges comment through closing `</div>`):
```tsx
                {/* Step badges */}
                <div className="flex gap-2">
                  {([
                    { n: 1, label: "Получение сигнала",   active: step1Active, onClick: onWelcome ? handleStep1Click : undefined },
                    { n: 2, label: "Запуск кампании",     active: step2Active, onClick: flowPhase === "awaiting-campaign" ? handleStep2Click : undefined },
                    { n: 3, label: "Статистика кампании", active: step3Active, onClick: undefined },
                  ] as const).map(({ n, label, active, onClick }) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!active}
                      onClick={onClick}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? onClick
                            ? "cursor-pointer border-border bg-card hover:bg-accent"
                            : "cursor-default border-border bg-card"
                          : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
                      )}
                      style={
                        stepTwoNew && n === 2
                          ? { animation: "step-badge-pulse 1.4s ease-in-out" }
                          : undefined
                      }
                    >
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                        Шаг {n}
                      </span>
                      <div className="h-3 w-px shrink-0 bg-border" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      {active && onClick && (
                        <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
```

Replace with:
```tsx
                {/* Step badges — hidden after onboarding complete */}
                {!campaignDone && (
                <div className="flex gap-2">
                  {([
                    { n: 1, label: "Получение сигнала",   active: step1Active, onClick: onWelcome ? handleStep1Click : undefined },
                    { n: 2, label: "Запуск кампании",     active: step2Active, onClick: flowPhase === "awaiting-campaign" ? handleStep2Click : undefined },
                    { n: 3, label: "Статистика кампании", active: step3Active, onClick: undefined },
                  ] as const).map(({ n, label, active, onClick }) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!active}
                      onClick={onClick}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? onClick
                            ? "cursor-pointer border-border bg-card hover:bg-accent"
                            : "cursor-default border-border bg-card"
                          : "cursor-not-allowed border-border/40 bg-card/40 opacity-35"
                      )}
                      style={
                        stepTwoNew && n === 2
                          ? { animation: "step-badge-pulse 1.4s ease-in-out" }
                          : undefined
                      }
                    >
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                        Шаг {n}
                      </span>
                      <div className="h-3 w-px shrink-0 bg-border" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      {active && onClick && (
                        <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
                )}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | grep "page.tsx" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: hide step badges after onboarding complete"
```

---

## Task 2 — Signal card in Signals section

**Files:**
- Modify: `src/components/signal-type-view.tsx` (full rewrite)
- Modify: `src/app/page.tsx` (add `signalCreatedAt` state + wire props)

- [ ] **Step 1: Rewrite `signal-type-view.tsx`**

Replace the entire file content with:
```tsx
"use client";

const SCENARIO_NAMES: Record<string, string> = {
  registration: "Регистрация",
  "first-deal":  "Первая сделка",
  upsell:        "Апсейл",
  retention:     "Удержание",
  return:        "Возврат",
  reactivation:  "Реактивация",
};

interface SignalCardData {
  scenarioId: string;
  count: number;
  createdAt: string;
}

interface SignalTypeViewProps {
  onCreateSignal: () => void;
  signal?: SignalCardData | null;
  onLaunchCampaign?: () => void;
}

export function SignalTypeView({ onCreateSignal, signal, onLaunchCampaign }: SignalTypeViewProps) {
  const scenarioName = signal
    ? (SCENARIO_NAMES[signal.scenarioId] ?? signal.scenarioId)
    : null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-40 pt-10">
      {/* Section header */}
      <div className="mb-6">
        <h1 className="text-[38px] font-semibold leading-[46px] tracking-tight">
          Сигналы
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {signal ? "1 сигнал" : "Нет сигналов"}
        </p>
      </div>

      {/* Signal card */}
      {signal && (
        <div className="mb-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">
            {scenarioName} · {signal.count.toLocaleString("ru-RU")} сигналов
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{signal.createdAt}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Скачать сигналы
            </button>
            <button
              type="button"
              onClick={onLaunchCampaign}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Запустить кампанию
            </button>
          </div>
        </div>
      )}

      {/* Empty state / create button */}
      {!signal ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
            Вы не создали ещё ни одного сигнала. Перед тем как запустить кампанию,
            сформируйте первый сигнал.
          </p>
          <button
            type="button"
            onClick={onCreateSignal}
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Создать сигнал
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onCreateSignal}
          className="self-start rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          + Создать сигнал
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `signalCreatedAt` state in `page.tsx`**

Find line 96:
```tsx
  const [signalScenarioId, setSignalScenarioId] = useState<string>("");
```

Replace with:
```tsx
  const [signalScenarioId, setSignalScenarioId] = useState<string>("");
  const [signalCreatedAt,  setSignalCreatedAt]  = useState<string>("");
```

- [ ] **Step 3: Set `signalCreatedAt` when step 8 fires**

Find in `page.tsx`:
```tsx
  function handleStep8Reached(scenarioId: string) {
    setSignalDone(true);
    setSignalScenarioId(scenarioId);
    setFlowPhase("awaiting-campaign");
  }
```

Replace with:
```tsx
  function handleStep8Reached(scenarioId: string) {
    setSignalDone(true);
    setSignalScenarioId(scenarioId);
    setSignalCreatedAt(new Date().toLocaleDateString("ru-RU"));
    setFlowPhase("awaiting-campaign");
  }
```

- [ ] **Step 4: Wire `signal` and `onLaunchCampaign` props in `page.tsx`**

Find in `renderMain`:
```tsx
    if (activeNav === "Сигналы")    return <SignalTypeView onCreateSignal={handleStep1Click} />;
```

Replace with:
```tsx
    if (activeNav === "Сигналы")    return (
      <SignalTypeView
        onCreateSignal={handleStep1Click}
        signal={signalDone && signalScenarioId ? { scenarioId: signalScenarioId, count: 4312, createdAt: signalCreatedAt } : null}
        onLaunchCampaign={handleStep2Click}
      />
    );
```

Also find the Campaigns gate:
```tsx
      if (!signalDone) return <SignalTypeView onCreateSignal={handleStep1Click} />;
```

Replace with:
```tsx
      if (!signalDone) return (
        <SignalTypeView
          onCreateSignal={handleStep1Click}
          signal={null}
          onLaunchCampaign={undefined}
        />
      );
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "signal-type-view|page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/signal-type-view.tsx src/app/page.tsx
git commit -m "feat: signal card with scenario name, count, and date in Signals section"
```

---

## Task 3 — Campaign card in Campaigns section

**Files:**
- Modify: `src/components/campaign-type-view.tsx`
- Modify: `src/app/page.tsx` (add `campaignLaunchedAt` state + wire props)

- [ ] **Step 1: Rewrite `campaign-type-view.tsx`**

Replace the entire file content with:
```tsx
"use client";

import { cn } from "@/lib/utils";

const CAMPAIGNS = [
  {
    id: "abandoned",
    name: "Возврат брошенных действий",
    description: "Возвращаем пользователей, не завершивших действие, через персонализированные касания",
  },
  {
    id: "warmup",
    name: "Прогрев до следующего шага",
    description: "Увеличиваем конверсию через серию касаний с нарастающей ценностью",
  },
  {
    id: "reactivation-stimulate",
    name: "Стимулирование повторной активности",
    description: "Возвращаем интерес пользователей через офферы и релевантные напоминания",
  },
  {
    id: "behavioral-retention",
    name: "Удержание через поведенческие триггеры",
    description: "Предотвращаем отток через своевременные реакции на изменения поведения",
  },
  {
    id: "adaptive-reactivation",
    name: "Реактивация через адаптивный сценарий",
    description: "Перестраиваем коммуникацию по сегментам, реакции и времени отклика пользователей",
  },
];

interface CampaignCardData {
  typeName: string;
  launchedAt: string;
}

interface CampaignTypeViewProps {
  onSelect?: (id: string, name: string) => void;
  campaign?: CampaignCardData | null;
}

export function CampaignTypeView({ onSelect, campaign }: CampaignTypeViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-40 pt-10">
      {/* Section header */}
      <div className="mb-6">
        <h1 className="text-[38px] font-semibold leading-[46px] tracking-tight">
          Кампании
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {campaign ? "1 кампания" : "Нет кампаний"}
        </p>
      </div>

      {/* Campaign card */}
      {campaign && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{campaign.typeName}</p>
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">
              Активна
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Запущена {campaign.launchedAt}</p>
        </div>
      )}

      {/* Campaign type selection */}
      <div>
        {!campaign && (
          <p className="mb-4 text-sm font-medium text-foreground">Выберите тип кампании</p>
        )}
        {campaign && (
          <p className="mb-4 text-sm font-medium text-foreground">Создать ещё одну кампанию</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {CAMPAIGNS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect?.(c.id, c.name)}
              className={cn(
                "flex flex-col items-start rounded-lg border p-4 text-left transition-all",
                "border-border bg-card hover:bg-accent hover:border-border"
              )}
            >
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {c.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `campaignLaunchedAt` state in `page.tsx`**

Find:
```tsx
  const [signalCreatedAt,  setSignalCreatedAt]  = useState<string>("");
```

Replace with:
```tsx
  const [signalCreatedAt,    setSignalCreatedAt]    = useState<string>("");
  const [campaignLaunchedAt, setCampaignLaunchedAt] = useState<string>("");
```

- [ ] **Step 3: Set `campaignLaunchedAt` when campaign is launched**

Find:
```tsx
                      onClick={() => { setWorkflowLaunched(true); setCampaignDone(true); }}
```

Replace with:
```tsx
                      onClick={() => { setWorkflowLaunched(true); setCampaignDone(true); setCampaignLaunchedAt(new Date().toLocaleDateString("ru-RU")); }}
```

- [ ] **Step 4: Wire `campaign` prop in `page.tsx` renderMain**

Find in `renderMain`:
```tsx
      return <CampaignTypeView onSelect={handleCampaignSelect} />;
```

(The second occurrence — inside the `activeNav === "Кампании"` branch)

Replace with:
```tsx
      return (
        <CampaignTypeView
          onSelect={handleCampaignSelect}
          campaign={campaignDone && selectedCampaign ? { typeName: selectedCampaign.name, launchedAt: campaignLaunchedAt } : null}
        />
      );
```

Note: the first occurrence of `<CampaignTypeView onSelect={handleCampaignSelect} />` is in the guided flow (`flowPhase === "campaign" && !selectedCampaign`). That one stays as-is — it's the type selection step during the flow, not the sidebar section.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "campaign-type-view|page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaign-type-view.tsx src/app/page.tsx
git commit -m "feat: campaign card with type, status badge, and launch date in Campaigns section"
```

---

## Task 4 — Opaque chat bar with gradient scrim

**Files:**
- Modify: `src/app/page.tsx:267-273`

- [ ] **Step 1: Add gradient scrim and opaque background to the floating bar**

Find:
```tsx
            <motion.div
              className="fixed left-[120px] right-0 z-30 px-8"
              initial={false}
              animate={{ bottom: floatBottom }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
```

Replace with:
```tsx
            <motion.div
              className="fixed left-[120px] right-0 z-30 px-8 pb-4"
              initial={false}
              animate={{ bottom: floatBottom }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
              <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-2 bg-background pt-2">
```

- [ ] **Step 2: Verify visually**

Start dev server and check:
- Statistics view: table content should fade out cleanly behind the input bar
- Welcome view: input bar has solid background, no bleed-through

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npm run dev 2>&1 &
```

Open http://localhost:3000, navigate to Статистика, verify no content bleed.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: opaque background and gradient scrim on floating chat bar"
```

---

## Task 5 — Welcome screen: prevent overlap on small screens

**Files:**
- Modify: `src/components/welcome-view.tsx:9`

- [ ] **Step 1: Increase bottom padding and allow scroll**

Find:
```tsx
    <div className="flex flex-1 items-center justify-center pb-56">
```

Replace with:
```tsx
    <div className="flex flex-1 items-center justify-center overflow-y-auto pb-72">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/welcome-view.tsx
git commit -m "fix: increase welcome view bottom padding to prevent chat bar overlap"
```

---

## Task 6 — Push

- [ ] **Step 1: Push all commits**

```bash
git push
```
