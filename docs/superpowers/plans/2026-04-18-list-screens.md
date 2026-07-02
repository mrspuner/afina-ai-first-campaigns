# Block B — List Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать разделы Сигналы и Кампании (standalone) из adapter-слоя A.5 в реальные списки карточек с dropdown-меню создания, модалкой загрузки и прямым переходом в Canvas.

**Architecture:** Extract-and-reuse: сначала выносим переиспользуемые куски (`DropZone`, `HashingLoader`) из step-5 без изменения поведения, затем добавляем новые reducer-actions с TDD, строим компоненты снизу вверх (StatusBadge → card → empty state → section), обновляем роутинг в `page.tsx`, удаляем мёртвый adapter-код, закрываем всё Playwright-сценариями.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui (`@base-ui/react`), vitest (node env, reducer-тесты), Playwright (integration), `nanoid`, `motion/react`.

**Spec:** `docs/superpowers/specs/2026-04-18-list-screens-design.md`

**Roadmap:** `MEMORY.md → project_afina_18_04_roadmap.md` — блок B. A + A.5 уже в main (HEAD `0c529c6`).

---

## File Structure

**Create:**
- `src/components/ui/drop-zone.tsx` — drag-and-drop зона (accept / file / onFile / disabled)
- `src/components/ui/hashing-loader.tsx` — трёхстадийный лоадер хеширования
- `src/sections/signals/signal-card.tsx`
- `src/sections/signals/signals-empty-state.tsx`
- `src/sections/signals/new-signal-menu.tsx`
- `src/sections/signals/upload-signal-dialog.tsx`
- `src/sections/campaigns/status-badge.tsx`
- `src/sections/campaigns/campaign-card.tsx`
- `src/sections/campaigns/campaigns-empty-state.tsx`
- `tests/e2e/block-b.spec.ts` — Playwright
- `tests/e2e/fixtures/block-b-signals.csv` — фикстура для upload-теста

**Modify:**
- `src/sections/signals/signals-section.tsx` — rewrite
- `src/sections/campaigns/campaigns-section.tsx` — rewrite, убрать `mode`
- `src/sections/signals/steps/step-5-upload.tsx` — использует `DropZone` + `HashingLoader`
- `src/state/app-state.ts` — два новых action'а
- `src/state/scenario-map.ts` — убрать `TYPE_TO_SCENARIO`
- `src/app/page.tsx` — `CampaignsSection` без `mode`

**Delete:**
- `src/sections/signals/signal-type-view.tsx`

---

## Task 1: Extract HashingLoader from step-5

Refactor without behavior change. `step-5-upload.tsx` по-прежнему проходит happy-path.

**Files:**
- Create: `src/components/ui/hashing-loader.tsx`
- Modify: `src/sections/signals/steps/step-5-upload.tsx`

- [ ] **Step 1: Создать `src/components/ui/hashing-loader.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/hooks/use-typewriter";
import { cn } from "@/lib/utils";

const HASHING_STAGES = [
  { text: "Проверка формата файла...", duration: 1200 },
  { text: "Хеширование данных...", duration: 2000 },
  { text: "Подготовка к импорту...", duration: 1000 },
];

export function HashingLoader({ onComplete }: { onComplete: () => void }) {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = HASHING_STAGES[stageIndex];
  const { displayed, isDone } = useTypewriter(stage.text, 30);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!isDone) return;
    const remaining = stage.duration - stage.text.length * 30;
    const id = setTimeout(() => {
      if (stageIndex < HASHING_STAGES.length - 1) {
        setStageIndex((i) => i + 1);
      } else {
        onCompleteRef.current();
      }
    }, Math.max(remaining, 300));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, stageIndex, stage.duration, stage.text.length]);

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="h-8 flex items-center">
        <p className="text-sm font-medium text-foreground">
          {displayed}
          {!isDone && <span className="ml-0.5 animate-pulse opacity-60">|</span>}
        </p>
      </div>
      <div className="flex gap-1">
        {HASHING_STAGES.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 w-8 rounded-full transition-colors duration-500",
              i < stageIndex
                ? "bg-primary"
                : i === stageIndex
                ? "bg-primary/60"
                : "bg-border"
            )}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Обновить `step-5-upload.tsx` — импорт вместо inline**

Удалить локальные `HASHING_STAGES` и `HashingLoader` из файла. Добавить импорт:

```tsx
import { HashingLoader } from "@/components/ui/hashing-loader";
```

Остальное использование `<HashingLoader onComplete={handleHashingComplete} />` — без изменений.

- [ ] **Step 3: Проверить happy-path**

Run: `npm run test:e2e -- tests/e2e/happy-path.spec.ts`
Expected: PASS (шаг 5 — «Загрузите вашу базу» — работает прежним образом).

- [ ] **Step 4: Прогнать vitest**

Run: `npm test`
Expected: существующие 26 тестов PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/hashing-loader.tsx src/sections/signals/steps/step-5-upload.tsx
git commit -m "refactor: extract HashingLoader from step-5 into ui/"
```

---

## Task 2: Extract DropZone from step-5

**Files:**
- Create: `src/components/ui/drop-zone.tsx`
- Modify: `src/sections/signals/steps/step-5-upload.tsx`

- [ ] **Step 1: Создать `src/components/ui/drop-zone.tsx`**

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  accept: string;
  file: File | null;
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DropZone({ accept, file, onFile, disabled, className }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    onFile(f);
  }, [onFile]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
        isDragging
          ? "border-primary bg-accent"
          : "border-border bg-card hover:border-primary/50 hover:bg-accent/50",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {file ? (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          <p className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
            Нажмите чтобы заменить
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Перетащите файл или нажмите для выбора
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Переписать `step-5-upload.tsx` на `DropZone`**

Заменить весь inline drop-зонный JSX на `<DropZone>`. Финальный файл:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/signals/steps/step-content";
import { StepProps } from "@/types/campaign";

export function Step5Upload({ data, onNext }: StepProps) {
  const [file, setFile] = useState<File | null>(data.file);
  const [isHashing, setIsHashing] = useState(false);

  function handleNext() {
    setIsHashing(true);
  }

  function handleHashingComplete() {
    onNext({ file });
  }

  return (
    <StepContent
      title="Загрузите вашу базу"
      subtitle="Файл с номерами телефонов. Данные будут автоматически захешированы перед отправкой"
    >
      <div className="flex flex-col gap-4">
        {isHashing ? (
          <div className="relative flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
            <HashingLoader onComplete={handleHashingComplete} />
          </div>
        ) : (
          <DropZone
            accept=".csv,.xlsx,.txt"
            file={file}
            onFile={setFile}
          />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Поддерживаемые форматы: CSV, XLSX, TXT · Максимальный размер: 50 МБ · До 1 000 000
          строк · Один номер на строку
        </p>

        <div className="flex justify-end">
          <Button disabled={!file || isHashing} onClick={handleNext}>
            Далее
          </Button>
        </div>
      </div>
    </StepContent>
  );
}
```

- [ ] **Step 3: Проверить happy-path**

Run: `npm run test:e2e -- tests/e2e/happy-path.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/drop-zone.tsx src/sections/signals/steps/step-5-upload.tsx
git commit -m "refactor: extract DropZone from step-5 into ui/"
```

---

## Task 3: Add `campaign_from_signal` reducer action

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Написать failing-тесты**

Добавить в конец `src/state/app-state.test.ts`:

```ts
describe("appReducer — campaign_from_signal", () => {
  it("creates a new draft campaign tied to the signal", () => {
    const signal = makeSignal({ id: "sig_A", type: "Апсейл" });
    const state: AppState = { ...initialState, signals: [signal] };
    const next = appReducer(state, { type: "campaign_from_signal", signalId: "sig_A" });
    expect(next.campaigns).toHaveLength(1);
    const c = next.campaigns[0];
    expect(c.signalId).toBe("sig_A");
    expect(c.status).toBe("draft");
    expect(c.name).toBe("Апсейл #1");
    expect(c.id).toMatch(/^cmp_/);
    expect(typeof c.createdAt).toBe("string");
  });

  it("numbers the second campaign per signal as #2", () => {
    const signal = makeSignal({ id: "sig_A", type: "Апсейл" });
    const existing = makeCampaign({ id: "cmp_old", signalId: "sig_A", name: "Апсейл #1" });
    const state: AppState = { ...initialState, signals: [signal], campaigns: [existing] };
    const next = appReducer(state, { type: "campaign_from_signal", signalId: "sig_A" });
    expect(next.campaigns).toHaveLength(2);
    expect(next.campaigns[1].name).toBe("Апсейл #2");
  });

  it("navigates to workflow view with launched=false", () => {
    const signal = makeSignal({ id: "sig_A" });
    const state: AppState = { ...initialState, signals: [signal] };
    const next = appReducer(state, { type: "campaign_from_signal", signalId: "sig_A" });
    expect(next.view.kind).toBe("workflow");
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(false);
    expect(next.view.campaign.id).toBe(next.campaigns[0].id);
    expect(next.view.campaign.name).toBe("Апсейл #1");
  });

  it("is a no-op when signalId is unknown", () => {
    const state: AppState = { ...initialState, signals: [makeSignal({ id: "sig_A" })] };
    const next = appReducer(state, { type: "campaign_from_signal", signalId: "sig_unknown" });
    expect(next).toBe(state);
  });

  it("clears activeSection so the workflow fills the pane", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal({ id: "sig_A" })],
      activeSection: "Сигналы",
    };
    const next = appReducer(state, { type: "campaign_from_signal", signalId: "sig_A" });
    expect(next.activeSection).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать тесты — они должны упасть**

Run: `npm test -- campaign_from_signal`
Expected: FAIL (action не обработан reducer'ом).

- [ ] **Step 3: Реализовать action**

В `src/state/app-state.ts`:

1. Добавить action в union `Action`:
```ts
| { type: "campaign_from_signal"; signalId: string }
```

2. Добавить импорт `nanoid` в верх файла (если его нет):
```ts
import { nanoid } from "nanoid";
```

3. Добавить case в `appReducer` (перед `case "campaign_selected"`):

```ts
case "campaign_from_signal": {
  const signal = state.signals.find((s) => s.id === action.signalId);
  if (!signal) return state;
  const n =
    state.campaigns.filter((c) => c.signalId === signal.id).length + 1;
  const newCampaign: Campaign = {
    id: `cmp_${nanoid(6)}`,
    name: `${signal.type} #${n}`,
    signalId: signal.id,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    campaigns: [...state.campaigns, newCampaign],
    view: {
      kind: "workflow",
      campaign: { id: newCampaign.id, name: newCampaign.name },
      launched: false,
    },
    activeSection: null,
  };
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Run: `npm test`
Expected: все PASS, включая 5 новых.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): add campaign_from_signal action"
```

---

## Task 4: Add `campaign_opened` reducer action

**Files:**
- Modify: `src/state/app-state.ts`
- Modify: `src/state/app-state.test.ts`

- [ ] **Step 1: Написать failing-тесты**

Добавить в `app-state.test.ts`:

```ts
describe("appReducer — campaign_opened", () => {
  it("opens draft campaign in workflow view with launched=false", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Draft A", status: "draft" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view).toEqual({
      kind: "workflow",
      campaign: { id: "cmp_A", name: "Draft A" },
      launched: false,
    });
  });

  it("opens active campaign with launched=true", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Running", status: "active" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(true);
  });

  it("opens completed campaign with launched=true", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Done", status: "completed" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(true);
  });

  it("opens scheduled campaign with launched=false", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Plan", status: "scheduled" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(false);
  });

  it("is a no-op when id is unknown", () => {
    const state: AppState = { ...initialState, campaigns: [makeCampaign()] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_missing" });
    expect(next).toBe(state);
  });

  it("clears activeSection so the workflow fills the pane", () => {
    const c = makeCampaign({ id: "cmp_A" });
    const state: AppState = {
      ...initialState,
      campaigns: [c],
      activeSection: "Кампании",
    };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.activeSection).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать тесты — падают**

Run: `npm test -- campaign_opened`
Expected: FAIL.

- [ ] **Step 3: Реализовать action**

В `src/state/app-state.ts`:

1. Добавить в union `Action`:
```ts
| { type: "campaign_opened"; id: string }
```

2. Добавить case в reducer (перед `case "preset_applied"`):

```ts
case "campaign_opened": {
  const c = state.campaigns.find((cc) => cc.id === action.id);
  if (!c) return state;
  return {
    ...state,
    view: {
      kind: "workflow",
      campaign: { id: c.id, name: c.name },
      launched: c.status === "active" || c.status === "completed",
    },
    activeSection: null,
  };
}
```

- [ ] **Step 4: Прогнать тесты — PASS**

Run: `npm test`
Expected: все PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/app-state.ts src/state/app-state.test.ts
git commit -m "feat(state): add campaign_opened action"
```

---

## Task 5: Build `StatusBadge` component

**Files:**
- Create: `src/sections/campaigns/status-badge.tsx`

- [ ] **Step 1: Создать файл**

```tsx
import type { CampaignStatus } from "@/state/app-state";
import { cn } from "@/lib/utils";

const LABELS: Record<CampaignStatus, string> = {
  active: "Активно",
  scheduled: "Запланированно",
  draft: "Не запущено",
  completed: "Завершено",
};

const DOT: Record<CampaignStatus, string> = {
  active: "bg-green-500",
  scheduled: "bg-blue-500",
  draft: "bg-muted-foreground",
  completed: "bg-muted-foreground/50",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status])} aria-hidden />
      {LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без новых ошибок в `status-badge.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/status-badge.tsx
git commit -m "feat(campaigns): add StatusBadge component"
```

---

## Task 6: Build `SignalCard` component

**Files:**
- Create: `src/sections/signals/signal-card.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Signal } from "@/state/app-state";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

interface SignalCardProps {
  signal: Signal;
  onCreateCampaign: (signalId: string) => void;
  onDownload: (signalId: string) => void;
}

export function SignalCard({ signal, onCreateCampaign, onDownload }: SignalCardProps) {
  const { type, count, segments, updatedAt, id } = signal;
  return (
    <Card className="gap-2 px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">
          {type} · {formatNumber(count)}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(updatedAt)}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Макс {formatNumber(segments.max)} · Выс {formatNumber(segments.high)} · Ср{" "}
        {formatNumber(segments.mid)} · Низ {formatNumber(segments.low)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button onClick={() => onCreateCampaign(id)}>Создать кампанию</Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Скачать сигналы"
          onClick={() => onDownload(id)}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без новых ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/signal-card.tsx
git commit -m "feat(signals): add SignalCard component"
```

---

## Task 7: Build `NewSignalMenu` component

Переиспользуемый dropdown: два пункта, опционально «primary» или «outline» trigger.

**Files:**
- Create: `src/sections/signals/new-signal-menu.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NewSignalMenuProps {
  onCreate: () => void;
  onUpload: () => void;
  variant?: "outline" | "primary";
}

export function NewSignalMenu({ onCreate, onUpload, variant = "outline" }: NewSignalMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={variant === "primary" ? "default" : "outline"}>
            <Plus className="h-4 w-4" />
            Новый сигнал
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onCreate}>Создать новый</DropdownMenuItem>
        <DropdownMenuItem onClick={onUpload}>Загрузить с устройства</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Примечание: `DropdownMenuTrigger` в shadcn-варианте проекта использует `render` prop — см. `src/components/ui/dropdown-menu.tsx`. Если API отличается — используй стандартный паттерн (`<DropdownMenuTrigger asChild><Button>…</Button></DropdownMenuTrigger>`).

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/new-signal-menu.tsx
git commit -m "feat(signals): add NewSignalMenu dropdown"
```

---

## Task 8: Build `UploadSignalDialog` component

**Files:**
- Create: `src/sections/signals/upload-signal-dialog.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { useAppDispatch } from "@/state/app-state-context";
import type { Signal } from "@/state/app-state";

interface UploadSignalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildSignalFromFile(file: File): Signal {
  const count = Math.floor(Math.random() * 4500) + 500;
  const now = new Date().toISOString();
  return {
    id: `sig_${nanoid(6)}`,
    type: "Регистрация",
    count,
    segments: { max: 0, high: 0, mid: count, low: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export function UploadSignalDialog({ open, onOpenChange }: UploadSignalDialogProps) {
  const dispatch = useAppDispatch();
  const [file, setFile] = useState<File | null>(null);
  const [isHashing, setIsHashing] = useState(false);

  function handleImport() {
    if (!file) return;
    setIsHashing(true);
  }

  function handleHashingComplete() {
    if (!file) return;
    const signal = buildSignalFromFile(file);
    dispatch({ type: "signal_added", signal });
    setFile(null);
    setIsHashing(false);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFile(null);
      setIsHashing(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Загрузите файл с номерами</DialogTitle>
          <DialogDescription>
            CSV, XLSX, TXT · до 50 МБ · по одному номеру на строку
          </DialogDescription>
        </DialogHeader>

        {isHashing ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
            <HashingLoader onComplete={handleHashingComplete} />
          </div>
        ) : (
          <DropZone accept=".csv,.xlsx,.txt" file={file} onFile={setFile} />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isHashing}
          >
            Отмена
          </Button>
          <Button onClick={handleImport} disabled={!file || isHashing}>
            Импортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/upload-signal-dialog.tsx
git commit -m "feat(signals): add UploadSignalDialog"
```

---

## Task 9: Build `SignalsEmptyState` component

**Files:**
- Create: `src/sections/signals/signals-empty-state.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { NewSignalMenu } from "./new-signal-menu";

interface SignalsEmptyStateProps {
  onCreate: () => void;
  onUpload: () => void;
}

export function SignalsEmptyState({ onCreate, onUpload }: SignalsEmptyStateProps) {
  return (
    <div className="fixed inset-0 left-[120px] flex flex-col items-center justify-center">
      <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
        Ещё нет сигналов. Создайте первый — или загрузите готовую базу с устройства.
      </p>
      <NewSignalMenu onCreate={onCreate} onUpload={onUpload} variant="primary" />
    </div>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/signals/signals-empty-state.tsx
git commit -m "feat(signals): add SignalsEmptyState"
```

---

## Task 10: Rewrite `SignalsSection`

Финальный компонент собирает карточки, empty state, header с dropdown и диалогом загрузки.

**Files:**
- Modify: `src/sections/signals/signals-section.tsx`

- [ ] **Step 1: Заменить содержимое файла**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { NewSignalMenu } from "./new-signal-menu";
import { SignalCard } from "./signal-card";
import { SignalsEmptyState } from "./signals-empty-state";
import { UploadSignalDialog } from "./upload-signal-dialog";

export function SignalsSection() {
  const { signals } = useAppState();
  const dispatch = useAppDispatch();
  const [uploadOpen, setUploadOpen] = useState(false);

  const sorted = useMemo(
    () => [...signals].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [signals]
  );

  function handleCreate() {
    dispatch({ type: "start_signal_flow" });
  }

  function handleCreateCampaign(signalId: string) {
    dispatch({ type: "campaign_from_signal", signalId });
  }

  function handleDownload(signalId: string) {
    console.log("download signal", signalId);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-40 pt-[140px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-[38px] font-semibold leading-[46px] tracking-tight">
            Сигналы
          </h1>
          {signals.length > 0 && (
            <NewSignalMenu onCreate={handleCreate} onUpload={() => setUploadOpen(true)} />
          )}
        </div>

        {signals.length === 0 ? (
          <SignalsEmptyState onCreate={handleCreate} onUpload={() => setUploadOpen(true)} />
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((s) => (
              <SignalCard
                key={s.id}
                signal={s}
                onCreateCampaign={handleCreateCampaign}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>

      <UploadSignalDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Визуальная проверка через dev-сервер**

Run: `npm run dev` (отдельно; порт 3000)
Открыть `localhost:3000`, `Cmd+Shift+D` → переключать пресеты:
- `empty` → empty state с кнопкой «+ Новый сигнал»
- `mid` / `full` → список карточек, сверху самая свежая

- [ ] **Step 3: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sections/signals/signals-section.tsx
git commit -m "feat(signals): rewrite section as card list"
```

---

## Task 11: Build `CampaignCard` component

**Files:**
- Create: `src/sections/campaigns/campaign-card.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { Card } from "@/components/ui/card";
import type { Campaign, Signal } from "@/state/app-state";
import { StatusBadge } from "./status-badge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function timestampLine(c: Campaign): string {
  if (c.status === "active" && c.launchedAt) return `Запущена ${formatDate(c.launchedAt)}`;
  if (c.status === "scheduled" && c.scheduledFor) return `Запуск ${formatDate(c.scheduledFor)}`;
  if (c.status === "completed" && c.completedAt) return `Завершена ${formatDate(c.completedAt)}`;
  return `Черновик от ${formatDate(c.createdAt)}`;
}

interface CampaignCardProps {
  campaign: Campaign;
  signal: Signal | undefined;
  onOpen: (id: string) => void;
}

export function CampaignCard({ campaign, signal, onOpen }: CampaignCardProps) {
  const signalLine = signal
    ? `Сигнал: ${signal.type} · ${formatNumber(signal.count)}`
    : "Сигнал: —";

  return (
    <Card
      className="cursor-pointer gap-2 px-5 py-4 transition-colors hover:bg-accent"
      onClick={() => onOpen(campaign.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(campaign.id);
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
        <StatusBadge status={campaign.status} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">{signalLine}</p>
        <p className="text-xs text-muted-foreground">{timestampLine(campaign)}</p>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/campaign-card.tsx
git commit -m "feat(campaigns): add CampaignCard"
```

---

## Task 12: Build `CampaignsEmptyState` component

**Files:**
- Create: `src/sections/campaigns/campaigns-empty-state.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignsEmptyStateProps {
  onGoToSignals: () => void;
}

export function CampaignsEmptyState({ onGoToSignals }: CampaignsEmptyStateProps) {
  return (
    <div className="fixed inset-0 left-[120px] flex flex-col items-center justify-center">
      <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
        Кампании создаются из Сигналов
      </p>
      <Button onClick={onGoToSignals}>
        Создать сигнал
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/sections/campaigns/campaigns-empty-state.tsx
git commit -m "feat(campaigns): add CampaignsEmptyState"
```

---

## Task 13: Rewrite `CampaignsSection` (drop `mode` prop)

**Files:**
- Modify: `src/sections/campaigns/campaigns-section.tsx`

- [ ] **Step 1: Заменить содержимое**

```tsx
"use client";

import { useMemo } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { CampaignCard } from "./campaign-card";
import { CampaignsEmptyState } from "./campaigns-empty-state";
import type { Campaign } from "@/state/app-state";

function relevantTimestamp(c: Campaign): string {
  return c.launchedAt ?? c.scheduledFor ?? c.completedAt ?? c.createdAt;
}

export function CampaignsSection() {
  const { signals, campaigns } = useAppState();
  const dispatch = useAppDispatch();

  const sorted = useMemo(
    () =>
      [...campaigns].sort((a, b) =>
        relevantTimestamp(a) < relevantTimestamp(b) ? 1 : -1
      ),
    [campaigns]
  );

  const signalById = useMemo(
    () => new Map(signals.map((s) => [s.id, s])),
    [signals]
  );

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-40 pt-[140px]">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <h1 className="mb-6 text-[38px] font-semibold leading-[46px] tracking-tight">
            Кампании
          </h1>
          <CampaignsEmptyState
            onGoToSignals={() => dispatch({ type: "sidebar_nav", section: "Сигналы" })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-40 pt-[140px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <h1 className="mb-6 text-[38px] font-semibold leading-[46px] tracking-tight">
          Кампании
        </h1>
        <div className="flex flex-col gap-3">
          {sorted.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              signal={signalById.get(c.signalId)}
              onOpen={(id) => dispatch({ type: "campaign_opened", id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: без ошибок. Будет ошибка в `page.tsx` (у `CampaignsSection` больше нет prop'а `mode`) — это пофиксим в Task 14.

- [ ] **Step 3: Commit** (до правки `page.tsx` — чтобы диф был изолированный)

```bash
git add src/sections/campaigns/campaigns-section.tsx
git commit -m "feat(campaigns): rewrite section as card list"
```

---

## Task 14: Update `page.tsx` — CampaignsSection без `mode` + render `CampaignTypeView` для `campaign-select`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Обновить импорты и `renderMain`**

В `src/app/page.tsx`, в верху файла добавить импорт:

```tsx
import { CampaignTypeView } from "@/sections/campaigns/campaign-type-view";
```

Заменить функцию `renderMain`:

```tsx
function renderMain() {
  if (view.kind === "welcome") return <WelcomeSection />;
  if (view.kind === "guided-signal" || view.kind === "awaiting-campaign")
    return <GuidedSignalSection />;
  if (view.kind === "campaign-select")
    return (
      <CampaignTypeView
        onSelect={(id, name) =>
          dispatch({ type: "campaign_selected", campaign: { id, name } })
        }
      />
    );
  if (view.kind === "workflow") return <WorkflowSection />;
  if (view.kind === "section") {
    if (view.name === "Статистика") return <StatisticsSection />;
    if (view.name === "Сигналы") return <SignalsSection />;
    if (view.name === "Кампании") return <CampaignsSection />;
  }
  return null;
}
```

- [ ] **Step 2: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor(shell): mount CampaignTypeView for campaign-select; drop mode prop"
```

---

## Task 15: Delete adapter code

**Files:**
- Delete: `src/sections/signals/signal-type-view.tsx`
- Modify: `src/state/scenario-map.ts` — убрать `TYPE_TO_SCENARIO`

- [ ] **Step 1: Проверить, что `signal-type-view.tsx` больше никем не импортируется**

Run: `grep -R "signal-type-view" src`
Expected: нет совпадений (после Task 10 файл не используется).

- [ ] **Step 2: Удалить файл**

```bash
git rm src/sections/signals/signal-type-view.tsx
```

- [ ] **Step 3: Проверить использование `TYPE_TO_SCENARIO`**

Run: `grep -R "TYPE_TO_SCENARIO" src`
Expected: нет совпадений.

- [ ] **Step 4: Обновить `src/state/scenario-map.ts`**

Финальный файл:

```ts
import type { SignalType } from "./app-state";

export const SCENARIO_TO_TYPE: Record<string, SignalType> = {
  registration: "Регистрация",
  "first-deal": "Первая сделка",
  upsell: "Апсейл",
  retention: "Удержание",
  return: "Возврат",
  reactivation: "Реактивация",
};
```

- [ ] **Step 5: Lint + vitest**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/scenario-map.ts
git commit -m "chore: remove Block A.5 adapter code"
```

---

## Task 16: Playwright — Block B integration tests

**Files:**
- Create: `tests/e2e/block-b.spec.ts`
- Create: `tests/e2e/fixtures/block-b-signals.csv`

- [ ] **Step 1: Создать фикстуру**

`tests/e2e/fixtures/block-b-signals.csv`:

```
+79991234567
+79991234568
+79991234569
```

- [ ] **Step 2: Написать spec**

`tests/e2e/block-b.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import path from "node:path";

async function applyPreset(page, key: "empty" | "mid" | "full") {
  await page.keyboard.press("Meta+Shift+KeyD");
  await page.getByRole("button", { name: new RegExp(`^${key}$`, "i") }).click();
  await page.keyboard.press("Meta+Shift+KeyD"); // закрыть панель
}

test.describe("Block B — Signals", () => {
  test("empty preset shows empty state and NewSignalMenu", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: /Сигналы/ }).click();

    await expect(page.getByText(/Ещё нет сигналов/)).toBeVisible();
    await page.getByRole("button", { name: /Новый сигнал/ }).click();
    await expect(page.getByRole("menuitem", { name: /Создать новый/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Загрузить с устройства/ })).toBeVisible();
  });

  test("mid preset renders sorted signal cards in single column", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: /Сигналы/ }).click();

    const cards = page.locator("[data-slot=card]").filter({
      has: page.getByRole("button", { name: "Создать кампанию" }),
    });
    await expect(cards).toHaveCount(5);

    // Первая карточка — самая свежая (updatedAt desc)
    await expect(cards.first()).toContainText(/Макс|Выс|Ср|Низ/);
  });

  test("create campaign from signal navigates to workflow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: /Сигналы/ }).click();

    await page.getByRole("button", { name: "Создать кампанию" }).first().click();
    // Canvas (workflow) виден — ищем характерный элемент workflow-графа
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
  });

  test("upload dialog adds signal to list", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: /Сигналы/ }).click();

    await page.getByRole("button", { name: /Новый сигнал/ }).click();
    await page.getByRole("menuitem", { name: /Загрузить с устройства/ }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    const fixturePath = path.resolve(__dirname, "fixtures/block-b-signals.csv");
    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await expect(page.getByText("block-b-signals.csv")).toBeVisible();

    await page.getByRole("button", { name: "Импортировать" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    const cards = page.locator("[data-slot=card]").filter({
      has: page.getByRole("button", { name: "Создать кампанию" }),
    });
    await expect(cards).toHaveCount(1);
  });
});

test.describe("Block B — Campaigns", () => {
  test("empty preset shows CTA → Signals", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "empty");
    await page.getByRole("button", { name: /Кампании/ }).click();

    await expect(page.getByText("Кампании создаются из Сигналов")).toBeVisible();
    await page.getByRole("button", { name: /Создать сигнал/ }).click();
    await expect(page.getByRole("heading", { name: "Сигналы" })).toBeVisible();
  });

  test("mid preset renders sorted campaign cards with status badges", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: /Кампании/ }).click();

    const cards = page.locator("[data-slot=card]").filter({
      hasText: /Сигнал:/,
    });
    await expect(cards).toHaveCount(10);

    await expect(page.getByText("Активно").first()).toBeVisible();
    await expect(page.getByText("Запланированно").first()).toBeVisible();
    await expect(page.getByText("Не запущено").first()).toBeVisible();
    await expect(page.getByText("Завершено").first()).toBeVisible();
  });

  test("clicking a campaign card opens workflow", async ({ page }) => {
    await page.goto("/");
    await applyPreset(page, "mid");
    await page.getByRole("button", { name: /Кампании/ }).click();

    const firstCard = page.locator("[data-slot=card]").filter({ hasText: /Сигнал:/ }).first();
    await firstCard.click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 5_000 });
  });
});
```

Примечание по `applyPreset`: на macOS горячая клавиша — `Meta+Shift+D`. Если тест запускается в Linux/Windows CI — нужно использовать `Control+Shift+D`; проверь имя клавиши (см. `src/components/dev/use-dev-hotkey.ts`) и адаптируй при необходимости.

- [ ] **Step 3: Запустить новый spec**

Run: `npm run test:e2e -- tests/e2e/block-b.spec.ts`
Expected: все 7 тестов PASS. Если `applyPreset` не срабатывает — проверь сигнатуру хоткея в `use-dev-hotkey.ts` и селектор кнопок пресета в `dev-panel.tsx`.

- [ ] **Step 4: Прогнать все e2e-тесты**

Run: `npm run test:e2e`
Expected: happy-path + block-b — оба PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/block-b.spec.ts tests/e2e/fixtures/block-b-signals.csv
git commit -m "test(e2e): cover Block B signals and campaigns flows"
```

---

## Task 17: Итоговая верификация + обновление роадмапа

**Files:**
- Modify: `/Users/macintosh/.claude/projects/-Users-macintosh-Documents-work-afina-ai-first/memory/project_afina_18_04_roadmap.md`

- [ ] **Step 1: Полный прогон**

Run в параллели:
```bash
npm run lint
npm test
npm run test:e2e
```
Expected: все PASS.

- [ ] **Step 2: Визуальная проверка в браузере**

Поднять dev-сервер, проверить все три пресета (empty / mid / full) и оба раздела (Сигналы / Кампании), плюс:
- Dropdown «+ Новый сигнал» в header и в empty state — оба работают
- Upload модалка — открывается, drag-and-drop проходит, сигнал появляется в списке
- Клик «Создать кампанию» → Canvas, кампания появляется в Кампаниях
- Клик по карточке кампании → Canvas с её именем в header

- [ ] **Step 3: Обновить memory-роадмап**

В `project_afina_18_04_roadmap.md` — сменить статус блока B с `TBD` на `✅ implemented`, указать HEAD коммита, перечислить добавленные/удалённые файлы. Следующий блок — C.

- [ ] **Step 4: Финальный check-commit**

Убедиться, что не осталось лишних untracked файлов:

Run: `git status`
Expected: working tree clean (всё закоммичено).

- [ ] **Step 5: Готово — сигнализировать о завершении блока B**

Итог: ветка содержит 14–16 атомарных коммитов, Block B закрыт, следующий — Block C.

---

## Self-Review Notes

**Spec coverage:**
- §1 scope: Tasks 3–14 покрывают полную перезапись секций + reducer changes + удаление adapter'а.
- §2 reusable: `DropZone`, `HashingLoader`, `Card`, `Dialog`, `DropdownMenu`, `Button` — все использованы явно.
- §3.1 single column + sort: Tasks 10, 13 — `max-w-2xl`, `gap-3`, sort по `updatedAt` / relevant timestamp.
- §3.2 signal card (C-вариант): Task 6 — inline-минимум со всеми 4 сегментами.
- §3.2 empty state + menu + upload: Tasks 7, 8, 9, 10.
- §3.3 campaign card + StatusBadge + empty state: Tasks 5, 11, 12, 13.
- §4 state machine: Tasks 3, 4 — оба action'а + tests; Task 14 — `CampaignTypeView` для `campaign-select`; Task 13 — убран `mode`.
- §5 file structure: полностью соответствует списку create/modify/delete.
- §6 tests: Tasks 3, 4 — unit; Task 16 — integration (7 сценариев).

**Placeholder scan:** нет TBD/TODO. Единственное «если API отличается» в Task 7 — обоснованная hedge по реальному `DropdownMenuTrigger` API, не placeholder.

**Type consistency:** `campaign_from_signal` и `campaign_opened` — одинаковая форма union-variant'ов. `SignalCard`, `CampaignCard` — принимают `signal: Signal`, `campaign: Campaign` одинаково. `StatusBadge` использует `CampaignStatus` из `app-state.ts`.
