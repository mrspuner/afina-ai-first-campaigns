# M4 — Раздел «Настройки» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a brand-new account-level "Настройки" section — one left-aligned page of manually edited blocks (site, business, regions, AI-summary, account interests + AI-suggestions, brand voice, global domain blocklist), reachable from the sidebar dropdown.

**Architecture:** Settings data is account-level and outlives the survey, so it lives in a new `AccountSettings` type and a dedicated `accountSettings` state slice (NOT the `Survey` type — `Survey` is the onboarding form and stays untouched). A new `src/sections/settings/` directory holds `settings-section.tsx` plus one component per block. All settings mutations go through a single `settings_updated` reducer action that shallow-merges a `Partial<AccountSettings>` patch; the interests prefill and the "move AI-suggestion to active" logic are pure functions tested with vitest. The screen has no prompt-bar and no AI round-trips — AI only seeds the initial `accountSettings` value.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui on base-ui, motion v12, vitest

**Source spec:** `docs/superpowers/specs/2026-05-15-afina-mechanics-spec.md` — Механика 4

---

## Worktree setup

Per `AGENTS.md`, all work happens in an isolated worktree off `main`:

```bash
git worktree add .worktrees/m4-settings-section -b feature/m4-settings-section main
cd .worktrees/m4-settings-section
npm install
```

Do every commit, test run, and dev-server run inside `.worktrees/m4-settings-section`.
The dev server runs on port 3000 (`npm run dev`). If another agent holds port 3000,
run `npm run dev -- -p 3001` and adjust the verification URLs accordingly.
Cleanup (`git worktree remove`) is the user's call — report the path and branch when done.

---

## Reusable components (audit verified 2026-05-15)

| Component / module | Path | Use in M4 |
|---|---|---|
| `Input` | `src/components/ui/input.tsx` | **As-is** — site URL, company name fields |
| `Textarea` | `src/components/ui/textarea.tsx` | **As-is** — AI-summary, brand voice, regions |
| `Button` (CVA: `default`/`ghost`/`outline`, sizes) | `src/components/ui/button.tsx` | **As-is** — Save buttons, "Добавить", "Пересобрать" |
| `DirectionCombobox` | `src/sections/survey/direction-combobox.tsx` | **As-is** — business-direction picker (props `{value,onChange,id,...}`, drives `DirectionId`) |
| `Field` helper (label + hint + error wrapper) | `src/sections/survey/survey-form.tsx` (local, not exported) | **Extended → extracted** — move into a shared `src/sections/settings/settings-field.tsx`; copy the markup verbatim (it is not exported today, so re-create rather than import) |
| `InterestChip` | `src/sections/signals/steps/step-2-interests.tsx` (local, not exported) | **Extended → new component** — the existing chip is a toggle button with no ✕; M4 needs a removable chip. Create `RemovableInterestChip` in `src/sections/settings/interests-block.tsx` reusing the same `border-brand/50 bg-brand-muted` token styling |
| `DeltaChip` domain-chip pattern (M2) | `src/sections/signals/steps/step-2-interests.tsx` | **Pattern reused** — domain blocklist chip styled like a neutral chip with an ✕; build a fresh `DomainChip` in `src/sections/settings/domains-block.tsx` (M2's `DeltaChip` is colour-coded added/excluded — not what we want here) |
| `getInterestsForDirection`, `INTERESTS_BY_DIRECTION` | `src/data/interests-by-direction.ts` | **As-is** — seeds the account interest set from `directionId` |
| `getInterestById` | `src/data/triggers-by-vertical.ts` | **As-is** — resolve `InterestId` → `Interest` (for labels) |
| `DIRECTIONS`, `getDirectionById` | `src/data/directions.ts` | **As-is** — direction list / lookup |
| `appReducer` / `AppState` | `src/state/app-state.ts` | **Extended** — add `"Настройки"` to `SectionName`, `accountSettings` slice, `settings_updated` action |
| `app-state.test.ts` | `src/state/app-state.test.ts` | **Extended** — add `describe("appReducer — settings actions")` |
| `AppSidebar` dropdown | `src/sections/shell/app-sidebar.tsx` | **Extended** — wire `onClick` on the existing "Настройки" `DropdownMenuItem` |

**Created new:** `AccountSettings` type + `EMPTY_ACCOUNT_SETTINGS` + `DEMO_ACCOUNT_SETTINGS` (`src/types/account-settings.ts`); `buildAccountInterestSeed` + `moveSuggestionToActive` pure functions (`src/data/account-interests.ts`); the whole `src/sections/settings/` directory (8 files).

---

## File structure

### Data decision (stated concretely)

- **NOT extending `Survey`.** `Survey` (`src/types/survey.ts`) is the 3-field onboarding form (`companyName`, `companyWebsite`, `directionId`) with its own `SurveyStatus` lifecycle. Settings is a richer, always-present account record. Mixing them would force `survey_*` reducers and `EMPTY_SURVEY` to carry settings concerns.
- **New `AccountSettings` type** in a new file `src/types/account-settings.ts`, holding all seven blocks' data.
- **New `accountSettings` state slice** in `AppState`, initialised to `DEMO_ACCOUNT_SETTINGS` (pre-filled demo data — the prototype shows a configured account, mirroring how the AI "already prepared" interests in step-2).
- **One reducer action** `settings_updated` shallow-merges a `Partial<AccountSettings>` patch.
- **New `src/sections/settings/` directory** — one file per concern (section shell + one component per block + shared field helper).

### Files Created

| Path | Responsibility |
|---|---|
| `src/types/account-settings.ts` | `AccountSettings` interface, `AccountInterest` type, `EMPTY_ACCOUNT_SETTINGS`, `DEMO_ACCOUNT_SETTINGS` |
| `src/data/account-interests.ts` | Pure functions `buildAccountInterestSeed(directionId)` and `moveSuggestionToActive(settings, interestId)` |
| `src/data/account-interests.test.ts` | Vitest unit tests for the two pure functions |
| `src/sections/settings/settings-section.tsx` | Page shell — scroll container, heading, stacks the 7 blocks top-to-bottom, left-aligned |
| `src/sections/settings/settings-field.tsx` | Shared `SettingsField` (label + hint + error) and `SettingsBlock` (numbered/titled block wrapper) helpers |
| `src/sections/settings/site-block.tsx` | Block 1 — site URL input + optional "Пересобрать интересы и саммари" button |
| `src/sections/settings/business-block.tsx` | Block 2 — company name input + `DirectionCombobox` |
| `src/sections/settings/regions-block.tsx` | Block 3 — regions / geography textarea |
| `src/sections/settings/summary-block.tsx` | Block 4 — AI-summary textarea + local-draft Save |
| `src/sections/settings/interests-block.tsx` | Block 5 — `RemovableInterestChip` grid + "AI-предложения" checkbox sub-section |
| `src/sections/settings/voice-block.tsx` | Block 6 — brand tone + key-messages textareas |
| `src/sections/settings/domains-block.tsx` | Block 7 — `DomainChip` blocklist with manual add/remove |

### Files Modified

| Path | Change |
|---|---|
| `src/state/app-state.ts` | `SectionName` += `"Настройки"` (line 82); `import` `AccountSettings`/`DEMO_ACCOUNT_SETTINGS`; `accountSettings` field on `AppState` (after `surveyStatus` ~115); `settings_updated` action variant (~206); `accountSettings: DEMO_ACCOUNT_SETTINGS` in `initialState` (~236); `case "settings_updated"` in `appReducer` (above the PARALLEL-WORKTREE comment ~715) |
| `src/state/app-state.test.ts` | New `describe` block for `settings_updated` |
| `src/app/page.tsx` | New 4th branch in `renderMain()` `view.kind === "section"` (~58): `if (view.name === "Настройки") return <SettingsSection />;`; import `SettingsSection` |
| `src/sections/shell/app-sidebar.tsx` | Add `onClick` handler to the "Настройки" `DropdownMenuItem` (~139) → `onNavChange?.("Настройки")` |

---

## Tasks

### Task 1: M4.1 — Route/section + sidebar menu item

**Files:**
- Modify: `src/state/app-state.ts` (line 82, ~115, ~206, ~236, ~715)
- Create: `src/types/account-settings.ts`
- Modify: `src/state/app-state.test.ts` (append new `describe`)
- Modify: `src/app/page.tsx` (line ~22 import, ~58 branch)
- Modify: `src/sections/shell/app-sidebar.tsx` (~139)
- Create: `src/sections/settings/settings-section.tsx`
- Create: `src/sections/settings/settings-field.tsx`
- Test: `src/state/app-state.test.ts` (pure reducer logic — TDD)

- [ ] **Step 1: Create the `AccountSettings` type and demo data.**
Create `src/types/account-settings.ts`:
```ts
import type { DirectionId, InterestId } from "./directions";

/**
 * An interest in the account-level base set. `id` matches the interest
 * library (`getInterestById`); `label` is cached so the chip renders even
 * if the library entry is missing.
 */
export interface AccountInterest {
  id: InterestId;
  label: string;
}

/**
 * Account-level configuration shown and edited on the «Настройки» screen.
 * Distinct from `Survey` (the onboarding form) — this is the persistent
 * account record. AI seeds the initial value; the user edits every field
 * manually afterwards.
 */
export interface AccountSettings {
  /** Block 1 — primary company URL, the "root" data source. */
  companyWebsite: string;
  /** Block 2 — company name. */
  companyName: string;
  /** Block 2 — industry / direction; null until chosen. */
  directionId: DirectionId | null;
  /** Block 3 — where the company works / targets ads (free text). */
  regions: string;
  /** Block 4 — AI-generated company summary, then manually editable. */
  aiSummary: string;
  /** Block 5 — active account-level base interests. */
  interests: AccountInterest[];
  /** Block 5 — AI-suggested extra interests, not yet accepted. */
  suggestedInterests: AccountInterest[];
  /** Block 6 — brand tone of voice. */
  brandTone: string;
  /** Block 6 — key brand messages. */
  brandMessages: string;
  /** Block 7 — account-level domain blocklist, never used in any trigger. */
  domainBlocklist: string[];
}

export const EMPTY_ACCOUNT_SETTINGS: AccountSettings = {
  companyWebsite: "",
  companyName: "",
  directionId: null,
  regions: "",
  aiSummary: "",
  interests: [],
  suggestedInterests: [],
  brandTone: "",
  brandMessages: "",
  domainBlocklist: [],
};

/**
 * Pre-filled demo account — the prototype opens on a configured account so
 * testers see the screen populated. Mirrors the «AI already prepared this»
 * behaviour used elsewhere (step-2 interest prefill).
 */
export const DEMO_ACCOUNT_SETTINGS: AccountSettings = {
  companyWebsite: "alfabank.ru",
  companyName: "Альфа-Банк",
  directionId: "banking",
  regions: "Москва, Санкт-Петербург, города-миллионники РФ",
  aiSummary:
    "Универсальный коммерческий банк с фокусом на розничное кредитование, " +
    "ипотеку и инвестиционные продукты. Целевая аудитория — городские " +
    "клиенты 25–45 лет, активно сравнивающие финансовые предложения онлайн.",
  interests: [
    { id: "credit", label: "Кредиты" },
    { id: "mortgage", label: "Ипотека" },
    { id: "investments", label: "Инвестиции" },
    { id: "buy-apartment", label: "Покупка квартиры" },
  ],
  suggestedInterests: [
    { id: "buy-new-car", label: "Покупка нового авто" },
    { id: "higher-education", label: "Высшее образование" },
    { id: "country-real-estate", label: "Загородная недвижимость" },
  ],
  brandTone:
    "Уверенный, современный, без банковского канцелярита. Обращение на «вы», " +
    "короткие фразы, акцент на выгоде и скорости решения.",
  brandMessages:
    "Решение по кредиту за 2 минуты. Ипотека с господдержкой. " +
    "Инвестиции без комиссии в первый год.",
  domainBlocklist: ["competitor-bank.ru", "spam-aggregator.ru"],
};
```

- [ ] **Step 2: Write the FAILING reducer test.**
Append to `src/state/app-state.test.ts` (after the last `describe`, before EOF). Also add `DEMO_ACCOUNT_SETTINGS` to the existing import on lines 2–9 — change the import to also pull from the new module:
```ts
// add near the top imports of app-state.test.ts:
import {
  DEMO_ACCOUNT_SETTINGS,
  EMPTY_ACCOUNT_SETTINGS,
} from "@/types/account-settings";
```
Append this `describe` at the end of the file:
```ts
describe("appReducer — settings actions", () => {
  it("initialState carries the demo account settings", () => {
    expect(initialState.accountSettings).toEqual(DEMO_ACCOUNT_SETTINGS);
  });

  it("settings_updated shallow-merges a single field", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { companyWebsite: "newsite.ru" },
    });
    expect(next.accountSettings.companyWebsite).toBe("newsite.ru");
    // other fields untouched
    expect(next.accountSettings.companyName).toBe(
      DEMO_ACCOUNT_SETTINGS.companyName
    );
  });

  it("settings_updated merges multiple fields at once", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { regions: "Казань", brandTone: "Дружелюбный" },
    });
    expect(next.accountSettings.regions).toBe("Казань");
    expect(next.accountSettings.brandTone).toBe("Дружелюбный");
  });

  it("settings_updated replaces array fields wholesale", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { domainBlocklist: ["a.ru", "b.ru"] },
    });
    expect(next.accountSettings.domainBlocklist).toEqual(["a.ru", "b.ru"]);
  });

  it("settings_updated does not touch survey or signals slices", () => {
    const state: AppState = {
      ...initialState,
      signals: [makeSignal()],
    };
    const next = appReducer(state, {
      type: "settings_updated",
      patch: { companyName: "X" },
    });
    expect(next.signals).toBe(state.signals);
    expect(next.survey).toBe(state.survey);
  });

  it("EMPTY_ACCOUNT_SETTINGS has empty collections", () => {
    expect(EMPTY_ACCOUNT_SETTINGS.interests).toEqual([]);
    expect(EMPTY_ACCOUNT_SETTINGS.suggestedInterests).toEqual([]);
    expect(EMPTY_ACCOUNT_SETTINGS.domainBlocklist).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL.**
Run: `npx vitest run src/state/app-state.test.ts`
Expected: FAIL — `settings_updated` is not a known action, `accountSettings` is not on `AppState`, `SectionName` etc. compile/type errors.

- [ ] **Step 4: Extend `SectionName` and `AppState`.**
In `src/state/app-state.ts`:
- Add the import after line 8 (`import type { NodeParams } ...`):
```ts
import type { AccountSettings } from "@/types/account-settings";
import { DEMO_ACCOUNT_SETTINGS } from "@/types/account-settings";
```
- Change line 82:
```ts
export type SectionName = "Статистика" | "Сигналы" | "Кампании" | "Настройки";
```
- In the `AppState` type, after the `surveyStatus: SurveyStatus;` line (~115), add:
```ts
  // Owned by feature/m4-settings-section worktree:
  accountSettings: AccountSettings;
```

- [ ] **Step 5: Add the `settings_updated` action and reducer case.**
In `src/state/app-state.ts`:
- In the `Action` union, after `| { type: "survey_reset" }` (~206), add:
```ts
  | { type: "settings_updated"; patch: Partial<AccountSettings> }
```
- In `initialState`, after `surveyStatus: "not_started",` (~236), add:
```ts
  accountSettings: DEMO_ACCOUNT_SETTINGS,
```
- In `appReducer`, immediately above the `// PARALLEL-WORTREE INSERTION POINT` comment (~715), add:
```ts
    case "settings_updated":
      return {
        ...state,
        accountSettings: { ...state.accountSettings, ...action.patch },
      };
```

- [ ] **Step 6: Run the test — expect PASS.**
Run: `npx vitest run src/state/app-state.test.ts`
Expected: PASS — all `settings_updated` tests green, no regressions in the existing suites.

- [ ] **Step 7: Wire the sidebar dropdown "Настройки" item.**
In `src/sections/shell/app-sidebar.tsx`, replace the "Настройки" `DropdownMenuItem` (~139–142) with:
```tsx
            <DropdownMenuItem onClick={() => onNavChange?.("Настройки")}>
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
```
Leave the "Финансы" and "Выйти" items untouched — "Финансы" is out of scope (spec 4.1).

- [ ] **Step 8: Create the shared field/block helpers.**
Create `src/sections/settings/settings-field.tsx`:
```tsx
import type { ReactNode } from "react";

/** Numbered/titled wrapper for one settings block — left-aligned, Linear density. */
export function SettingsBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-8 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Label + hint/error field wrapper — mirrors the survey-form `Field` helper. */
export function SettingsField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Create the section shell (placeholder body).**
Create `src/sections/settings/settings-section.tsx`. For this task the body is just the heading scaffold; later tasks fill in the blocks:
```tsx
"use client";

import { motion } from "motion/react";

export function SettingsSection() {
  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="mx-auto w-full max-w-2xl px-10 py-10"
      >
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Настройки
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Данные аккаунта — питают подбор интересов и генерацию кампаний.
          </p>
        </header>
        <div className="flex flex-col gap-8">
          {/* Blocks added in tasks 2–5 */}
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 10: Add the route branch in `page.tsx`.**
In `src/app/page.tsx`:
- Add the import after line 22 (`import { StatisticsSection } ...`):
```ts
import { SettingsSection } from "@/sections/settings/settings-section";
```
- In `renderMain()`, after the `if (view.name === "Кампании") ...` line (~58), add:
```tsx
      if (view.name === "Настройки") return <SettingsSection />;
```

- [ ] **Step 11: Verify** — Run: `npm run dev` then open `http://localhost:3000` → sidebar footer → avatar dropdown → click "Настройки".
Expected (backlog M4.1 checkpoint): the «Настройки» screen opens with the heading "Настройки" and subtitle, left-aligned, one page. The sidebar dropdown closes on click.

- [ ] **Step 12: Commit** — `git add -A && git commit -m "feat(m4): add Настройки section route, AccountSettings state, sidebar entry"`

---

### Task 2: M4.2 — Blocks «Сайт», «Название и направление», «Регионы»

**Files:**
- Create: `src/sections/settings/site-block.tsx`
- Create: `src/sections/settings/business-block.tsx`
- Create: `src/sections/settings/regions-block.tsx`
- Modify: `src/sections/settings/settings-section.tsx` (mount the 3 blocks)
- Test: none (UI/rendering — visual checkpoint only)

- [ ] **Step 1: Create the site block.**
Create `src/sections/settings/site-block.tsx`. The "Пересобрать" button is a non-functional cue (spec 4.3 — site change must NOT auto-rebuild; the button is optional and unobtrusive). It only logs:
```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsBlock, SettingsField } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

export function SiteBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <SettingsBlock
      title="Сайт компании"
      description="Корневой источник данных — по нему AI предзаполняет интересы и саммари."
    >
      <SettingsField
        id="settings-website"
        label="Адрес сайта"
        hint="Смена адреса не пересобирает интересы и саммари автоматически."
      >
        <Input
          id="settings-website"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com"
          value={accountSettings.companyWebsite}
          onChange={(e) =>
            dispatch({
              type: "settings_updated",
              patch: { companyWebsite: e.target.value },
            })
          }
        />
      </SettingsField>
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => console.log("rebuild interests + summary")}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Пересобрать интересы и саммари с нового сайта
        </Button>
      </div>
    </SettingsBlock>
  );
}
```

- [ ] **Step 2: Create the business block.**
Create `src/sections/settings/business-block.tsx`:
```tsx
"use client";

import { Input } from "@/components/ui/input";
import { DirectionCombobox } from "@/sections/survey/direction-combobox";
import { SettingsBlock, SettingsField } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

export function BusinessBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <SettingsBlock
      title="Название и направление бизнеса"
      description="Задаёт вертикаль и базовый набор интересов."
    >
      <SettingsField id="settings-name" label="Название компании">
        <Input
          id="settings-name"
          type="text"
          placeholder="Например, Альфа-Банк"
          value={accountSettings.companyName}
          onChange={(e) =>
            dispatch({
              type: "settings_updated",
              patch: { companyName: e.target.value },
            })
          }
        />
      </SettingsField>
      <SettingsField id="settings-direction" label="Направление">
        <DirectionCombobox
          id="settings-direction"
          value={accountSettings.directionId}
          onChange={(next) =>
            dispatch({
              type: "settings_updated",
              patch: { directionId: next },
            })
          }
        />
      </SettingsField>
    </SettingsBlock>
  );
}
```

- [ ] **Step 3: Create the regions block.**
Create `src/sections/settings/regions-block.tsx`:
```tsx
"use client";

import { Textarea } from "@/components/ui/textarea";
import { SettingsBlock, SettingsField } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

export function RegionsBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <SettingsBlock
      title="Регионы и география"
      description="Где компания работает и куда крутит рекламу — нужно рекламной системе для таргетинга."
    >
      <SettingsField
        id="settings-regions"
        label="Регионы"
        hint="Перечислите города или регионы через запятую."
      >
        <Textarea
          id="settings-regions"
          rows={2}
          placeholder="Москва, Санкт-Петербург, города-миллионники РФ"
          value={accountSettings.regions}
          onChange={(e) =>
            dispatch({
              type: "settings_updated",
              patch: { regions: e.target.value },
            })
          }
        />
      </SettingsField>
    </SettingsBlock>
  );
}
```

- [ ] **Step 4: Mount the three blocks in the section shell.**
In `src/sections/settings/settings-section.tsx`, add the imports below the existing `motion` import:
```tsx
import { SiteBlock } from "./site-block";
import { BusinessBlock } from "./business-block";
import { RegionsBlock } from "./regions-block";
```
Replace the `{/* Blocks added in tasks 2–5 */}` comment inside the `flex flex-col gap-8` div with:
```tsx
          <SiteBlock />
          <BusinessBlock />
          <RegionsBlock />
```

- [ ] **Step 5: Verify** — Run: open `http://localhost:3000` → "Настройки".
Expected (backlog M4.2 checkpoint): three stacked blocks — «Сайт компании» (URL input pre-filled `alfabank.ru` + ghost rebuild button), «Название и направление бизнеса» (name input `Альфа-Банк` + direction combobox showing «Банки и кредитование»), «Регионы и география» (textarea pre-filled). Editing any field and re-opening the section keeps the change (state persists via reducer).

- [ ] **Step 6: Commit** — `git commit -am "feat(m4): site, business, regions settings blocks"`

---

### Task 3: M4.3 — Block «AI-саммари о компании»

**Files:**
- Create: `src/sections/settings/summary-block.tsx`
- Modify: `src/sections/settings/settings-section.tsx` (mount the block)
- Test: none (UI/rendering — visual checkpoint only)

- [ ] **Step 1: Create the summary block.**
The summary uses a local draft + explicit Save (spec 4.2.4 — "правит полностью вручную ... и сохраняет"). The committed value lives in `accountSettings.aiSummary`; the draft is local state. No regeneration. The mascot icon marks it as AI-origin (PRODUCT.md — mascot appears at AI points), but it stays decorative here — there is no AI action.
Create `src/sections/settings/summary-block.tsx`:
```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

export function SummaryBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  const [draft, setDraft] = useState(accountSettings.aiSummary);
  const dirty = draft !== accountSettings.aiSummary;

  function handleSave() {
    dispatch({ type: "settings_updated", patch: { aiSummary: draft } });
  }

  return (
    <SettingsBlock
      title="AI-саммари о компании"
      description="Резюме, которое AI составил о вашей компании. Отредактируйте текст и сохраните."
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Image
            src="/mascot-icon.svg"
            alt=""
            width={14}
            height={14}
            aria-hidden
          />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Сгенерировано AI
          </span>
        </div>
        <Textarea
          id="settings-summary"
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Опишите компанию своими словами"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!dirty}
            onClick={handleSave}
          >
            Сохранить
          </Button>
          {dirty ? (
            <span className="text-xs text-muted-foreground">
              Есть несохранённые изменения
            </span>
          ) : null}
        </div>
      </div>
    </SettingsBlock>
  );
}
```

- [ ] **Step 2: Mount the block.**
In `src/sections/settings/settings-section.tsx`, add the import:
```tsx
import { SummaryBlock } from "./summary-block";
```
Add `<SummaryBlock />` after `<RegionsBlock />` in the `flex flex-col gap-8` div.

- [ ] **Step 3: Verify** — Run: open `http://localhost:3000` → "Настройки".
Expected (backlog M4.3 checkpoint): the «AI-саммари о компании» block shows a "Сгенерировано AI" label with the mascot icon and a textarea pre-filled with the demo summary. Editing the text enables the "Сохранить" button and shows "Есть несохранённые изменения"; clicking "Сохранить" disables the button and clears the hint. There is no regenerate control.

- [ ] **Step 4: Commit** — `git commit -am "feat(m4): AI-summary settings block with manual save"`

---

### Task 4: M4.4 + M4.5 — Block «Интересы»: active set + AI-suggestions

**Files:**
- Create: `src/data/account-interests.ts`
- Create: `src/data/account-interests.test.ts`
- Create: `src/sections/settings/interests-block.tsx`
- Modify: `src/sections/settings/settings-section.tsx` (mount the block)
- Test: `src/data/account-interests.test.ts` (pure-logic — TDD)

- [ ] **Step 1: Write the FAILING pure-logic test.**
Create `src/data/account-interests.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildAccountInterestSeed,
  moveSuggestionToActive,
} from "./account-interests";
import type { AccountSettings } from "@/types/account-settings";
import { EMPTY_ACCOUNT_SETTINGS } from "@/types/account-settings";

describe("buildAccountInterestSeed", () => {
  it("maps a known direction to its interests with resolved labels", () => {
    const seed = buildAccountInterestSeed("banking");
    expect(seed.length).toBeGreaterThan(0);
    // every entry has a non-empty id and label
    for (const i of seed) {
      expect(i.id).toBeTruthy();
      expect(i.label).toBeTruthy();
    }
    // contains a known banking interest id
    expect(seed.map((i) => i.id)).toContain("credit");
  });

  it("returns an empty array for an unknown direction", () => {
    expect(buildAccountInterestSeed("not-a-direction")).toEqual([]);
  });

  it("returns an empty array for null direction", () => {
    expect(buildAccountInterestSeed(null)).toEqual([]);
  });

  it("drops interest ids missing from the library", () => {
    // every id returned must resolve to a label — no placeholder labels
    const seed = buildAccountInterestSeed("banking");
    expect(seed.every((i) => i.label.length > 0)).toBe(true);
  });
});

describe("moveSuggestionToActive", () => {
  function settingsWith(
    over: Partial<AccountSettings> = {}
  ): AccountSettings {
    return { ...EMPTY_ACCOUNT_SETTINGS, ...over };
  }

  it("moves the matching suggestion into the active interests", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [
        { id: "mortgage", label: "Ипотека" },
        { id: "investments", label: "Инвестиции" },
      ],
    });
    const next = moveSuggestionToActive(settings, "mortgage");
    expect(next.interests.map((i) => i.id)).toEqual(["credit", "mortgage"]);
    expect(next.suggestedInterests.map((i) => i.id)).toEqual(["investments"]);
  });

  it("is a no-op when the id is not a suggestion", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [{ id: "mortgage", label: "Ипотека" }],
    });
    const next = moveSuggestionToActive(settings, "unknown");
    expect(next).toEqual(settings);
  });

  it("does not duplicate an interest already active", () => {
    const settings = settingsWith({
      interests: [{ id: "credit", label: "Кредиты" }],
      suggestedInterests: [{ id: "credit", label: "Кредиты" }],
    });
    const next = moveSuggestionToActive(settings, "credit");
    expect(next.interests.map((i) => i.id)).toEqual(["credit"]);
    expect(next.suggestedInterests).toEqual([]);
  });

  it("returns a patch object that only changes the two interest arrays", () => {
    const settings = settingsWith({
      companyName: "Acme",
      interests: [],
      suggestedInterests: [{ id: "mortgage", label: "Ипотека" }],
    });
    const next = moveSuggestionToActive(settings, "mortgage");
    expect(next.companyName).toBe("Acme");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**
Run: `npx vitest run src/data/account-interests.test.ts`
Expected: FAIL — `./account-interests` module does not exist.

- [ ] **Step 3: Implement the pure functions.**
Create `src/data/account-interests.ts`:
```ts
import type { AccountInterest, AccountSettings } from "@/types/account-settings";
import type { DirectionId } from "@/types/directions";
import { getInterestsForDirection } from "./interests-by-direction";
import { getInterestById } from "./triggers-by-vertical";

/**
 * Seed the account-level interest set from a business direction. Maps the
 * direction's interest ids to `AccountInterest` records with resolved labels;
 * ids missing from the interest library are dropped. Returns `[]` for an
 * unknown or null direction.
 */
export function buildAccountInterestSeed(
  directionId: DirectionId | null
): AccountInterest[] {
  if (!directionId) return [];
  return getInterestsForDirection(directionId)
    .map((id) => {
      const interest = getInterestById(id);
      return interest ? { id: interest.id, label: interest.label } : null;
    })
    .filter((i): i is AccountInterest => i !== null);
}

/**
 * Accept an AI-suggested interest: remove it from `suggestedInterests` and
 * append it to `interests` (unless already active). No-op when the id is not
 * a current suggestion. Returns a full `AccountSettings` value — all other
 * fields are preserved by reference.
 */
export function moveSuggestionToActive(
  settings: AccountSettings,
  interestId: string
): AccountSettings {
  const picked = settings.suggestedInterests.find((i) => i.id === interestId);
  if (!picked) return settings;
  const alreadyActive = settings.interests.some((i) => i.id === interestId);
  return {
    ...settings,
    interests: alreadyActive
      ? settings.interests
      : [...settings.interests, picked],
    suggestedInterests: settings.suggestedInterests.filter(
      (i) => i.id !== interestId
    ),
  };
}
```

- [ ] **Step 4: Run the test — expect PASS.**
Run: `npx vitest run src/data/account-interests.test.ts`
Expected: PASS — all `buildAccountInterestSeed` and `moveSuggestionToActive` tests green.

- [ ] **Step 5: Create the interests block.**
Create `src/sections/settings/interests-block.tsx`. `RemovableInterestChip` reuses the `border-brand/50 bg-brand-muted` token styling from the existing `InterestChip`, adding an ✕. The "AI-предложения" sub-section uses native checkboxes (no `Checkbox` UI component exists in `src/components/ui/`). Removing an interest = `settings_updated` with the filtered array; accepting a suggestion = `moveSuggestionToActive` then dispatch the two changed arrays:
```tsx
"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { SettingsBlock } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { moveSuggestionToActive } from "@/data/account-interests";
import { cn } from "@/lib/utils";

function RemovableInterestChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
        "border-brand/50 bg-brand-muted text-foreground"
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Удалить интерес ${label}`}
        className="opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function InterestsBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  const { interests, suggestedInterests } = accountSettings;

  function removeInterest(id: string) {
    dispatch({
      type: "settings_updated",
      patch: { interests: interests.filter((i) => i.id !== id) },
    });
  }

  function acceptSuggestion(id: string) {
    const next = moveSuggestionToActive(accountSettings, id);
    dispatch({
      type: "settings_updated",
      patch: {
        interests: next.interests,
        suggestedInterests: next.suggestedInterests,
      },
    });
  }

  return (
    <SettingsBlock
      title="Интересы"
      description="Базовый набор интересов аккаунта — берётся по умолчанию для новых сигналов. Изменения не затрагивают уже созданные сигналы."
    >
      {/* Active set */}
      <div className="flex flex-col gap-2">
        {interests.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <RemovableInterestChip
                key={interest.id}
                label={interest.label}
                onRemove={() => removeInterest(interest.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Набор интересов пуст.
          </p>
        )}
      </div>

      {/* AI suggestions */}
      {suggestedInterests.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <Image
              src="/mascot-icon.svg"
              alt=""
              width={14}
              height={14}
              aria-hidden
            />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Может быть, вам подойдёт
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {suggestedInterests.map((interest) => (
              <li key={interest.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground transition-colors hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => acceptSuggestion(interest.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  {interest.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsBlock>
  );
}
```

- [ ] **Step 6: Mount the block.**
In `src/sections/settings/settings-section.tsx`, add the import:
```tsx
import { InterestsBlock } from "./interests-block";
```
Add `<InterestsBlock />` after `<SummaryBlock />` in the `flex flex-col gap-8` div.

- [ ] **Step 7: Verify** — Run: open `http://localhost:3000` → "Настройки".
Expected (backlog M4.4 checkpoint): the «Интересы» block shows the active set as brand-coloured chips, each with an ✕; clicking ✕ removes that interest. (backlog M4.5 checkpoint): the "Может быть, вам подойдёт" sub-section lists AI-suggested interests with checkboxes; checking one moves it into the active chip set and drops it from the suggestion list.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(m4): account interests block with AI-suggestions sub-section"`

---

### Task 5: M4.6 — Blocks «Тон голоса бренда» + «Глобальные исключения доменов»

**Files:**
- Create: `src/sections/settings/voice-block.tsx`
- Create: `src/sections/settings/domains-block.tsx`
- Modify: `src/sections/settings/settings-section.tsx` (mount the 2 blocks)
- Test: none (UI/rendering — visual checkpoint only)

- [ ] **Step 1: Create the brand-voice block.**
Create `src/sections/settings/voice-block.tsx`:
```tsx
"use client";

import { Textarea } from "@/components/ui/textarea";
import { SettingsBlock, SettingsField } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

export function VoiceBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <SettingsBlock
      title="Тон голоса бренда"
      description="Питает AI-генерацию текстов коммуникаций в кампаниях."
    >
      <SettingsField
        id="settings-tone"
        label="Тон"
        hint="Как звучит бренд — стиль, обращение, длина фраз."
      >
        <Textarea
          id="settings-tone"
          rows={3}
          placeholder="Уверенный, современный, без канцелярита…"
          value={accountSettings.brandTone}
          onChange={(e) =>
            dispatch({
              type: "settings_updated",
              patch: { brandTone: e.target.value },
            })
          }
        />
      </SettingsField>
      <SettingsField
        id="settings-messages"
        label="Ключевые сообщения"
        hint="Тезисы, которые бренд доносит до аудитории."
      >
        <Textarea
          id="settings-messages"
          rows={3}
          placeholder="Решение за 2 минуты. Без скрытых комиссий…"
          value={accountSettings.brandMessages}
          onChange={(e) =>
            dispatch({
              type: "settings_updated",
              patch: { brandMessages: e.target.value },
            })
          }
        />
      </SettingsField>
    </SettingsBlock>
  );
}
```

- [ ] **Step 2: Create the domain-blocklist block.**
Create `src/sections/settings/domains-block.tsx`. `DomainChip` is a neutral chip with an ✕ (NOT colour-coded — this is an account blocklist, not M2's added/excluded delta). Adding is manual (input + Enter or button); duplicates and blanks are rejected; the trimmed lowercased value is stored:
```tsx
"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";

function DomainChip({
  domain,
  onRemove,
}: {
  domain: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground">
      {domain}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Убрать ${domain} из блок-листа`}
        className="opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function DomainsBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  const blocklist = accountSettings.domainBlocklist;

  const [value, setValue] = useState("");

  function addDomain() {
    const next = value.trim().toLowerCase();
    if (!next) return;
    if (blocklist.includes(next)) {
      setValue("");
      return;
    }
    dispatch({
      type: "settings_updated",
      patch: { domainBlocklist: [...blocklist, next] },
    });
    setValue("");
  }

  function removeDomain(domain: string) {
    dispatch({
      type: "settings_updated",
      patch: {
        domainBlocklist: blocklist.filter((d) => d !== domain),
      },
    });
  }

  return (
    <SettingsBlock
      title="Глобальные исключения доменов"
      description="Домены, которые никогда не используются ни в одном триггере."
    >
      <div className="flex flex-col gap-3">
        {blocklist.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {blocklist.map((domain) => (
              <DomainChip
                key={domain}
                domain={domain}
                onRemove={() => removeDomain(domain)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Блок-лист пуст.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="example.ru"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDomain();
              }
            }}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDomain}
            disabled={value.trim().length === 0}
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>
      </div>
    </SettingsBlock>
  );
}
```

- [ ] **Step 3: Mount the two blocks.**
In `src/sections/settings/settings-section.tsx`, add the imports:
```tsx
import { VoiceBlock } from "./voice-block";
import { DomainsBlock } from "./domains-block";
```
Add `<VoiceBlock />` then `<DomainsBlock />` after `<InterestsBlock />` in the `flex flex-col gap-8` div. The final block order is: Site, Business, Regions, Summary, Interests, Voice, Domains.

- [ ] **Step 4: Verify** — Run: open `http://localhost:3000` → "Настройки".
Expected (backlog M4.6 checkpoint): both blocks render at the bottom of the page. «Тон голоса бренда» has two pre-filled textareas (tone + key messages) that persist edits. «Глобальные исключения доменов» shows the demo blocklist as mono chips with ✕; typing a domain and pressing Enter (or clicking "Добавить") appends a chip; ✕ removes it; duplicate/blank entries are ignored.

- [ ] **Step 5: Run the full test suite + lint.**
Run: `npx vitest run && npm run lint`
Expected: all tests pass (including `app-state.test.ts` and `account-interests.test.ts`), no lint errors.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(m4): brand-voice and global domain blocklist settings blocks"`

---

## Done criteria

All six backlog chunks M4.1–M4.6 closed, each verified on `localhost:3000`. The
«Настройки» screen is one left-aligned page with seven blocks, no prompt-bar,
all fields edited manually. `npx vitest run` and `npm run lint` pass. Report the
worktree path (`.worktrees/m4-settings-section`) and branch
(`feature/m4-settings-section`) to the user — merge/cleanup is their call.
