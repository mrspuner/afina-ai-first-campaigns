# Review-screen aim edits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Внести 11 UI-правок из aim: переписать экран review онбординга на лейбл-поля + общий комбобокс-справочник для чипов, починить наследование сайта, взять кнопки визарда, и заменить авто-запуск опроса при входе в «Настройки» на пустое состояние с кнопкой.

**Architecture:** Подход A из спека (`docs/superpowers/specs/2026-07-06-review-screen-aim-edits-design.md`) — вынести общий `DirectoryChipsField` (чипы + Popover/Command-справочник) + чистую функцию фильтрации; `OnboardingReviewScreen` переписать как форму с локальным стейджингом; `SettingsEmptyState` + локальный флаг в `page.tsx` для #11. Новые данные: справочник регионов РФ, плоский список известных доменов, каталог интересов по направлению.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/base-ui (Popover), cmdk (Command), motion v12, vitest + @testing-library/react (jsdom).

---

## Файловая структура

- Create `src/data/ru-regions.ts` — справочник регионов/городов РФ (#9).
- Modify `src/data/trigger-domains.ts` — добавить `knownTriggerDomains()` (#10).
- Modify `src/data/account-interests.ts` — добавить `buildInterestDirectory()` (#6).
- Create `src/sections/survey/directory-options.ts` — чистая функция `directoryOptions()` (логика фильтрации/custom).
- Create `src/sections/survey/directory-options.test.ts` — unit-тесты чистой функции.
- Create `src/sections/survey/directory-chips-field.tsx` — общий компонент чипов+комбобокса.
- Create `src/sections/survey/directory-chips-field.test.tsx` — тесты компонента.
- Modify `src/sections/survey/onboarding-review-screen.tsx` — переписать экран.
- Create `src/sections/survey/onboarding-review-screen.test.tsx` — тесты экрана.
- Modify `src/sections/survey/survey-section.tsx` — прокинуть `survey` в review.
- Create `src/sections/settings/settings-empty-state.tsx` — пустое состояние (#11).
- Create `src/sections/settings/settings-empty-state.test.tsx` — тест.
- Modify `src/app/page.tsx` — роутинг #11 (локальный флаг + `SettingsEmptyState`).

Типы (используются во всех задачах — единые):

```ts
// в directory-options.ts
export interface DirectoryEntry { id: string; label: string }
export interface ChipItem { id: string; label: string }
```

---

## Task 1: Справочник регионов РФ (#9)

**Files:**
- Create: `src/data/ru-regions.ts`
- Test: `src/data/ru-regions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { RU_REGIONS } from "./ru-regions";

describe("RU_REGIONS", () => {
  it("includes major cities and preset groups with unique ids", () => {
    const ids = RU_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // без дубликатов
    const labels = RU_REGIONS.map((r) => r.label);
    expect(labels).toContain("Москва");
    expect(labels).toContain("Санкт-Петербург");
    expect(labels).toContain("Города-миллионники РФ"); // пресет
    expect(RU_REGIONS.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/ru-regions.test.ts`
Expected: FAIL — `Cannot find module './ru-regions'`.

- [ ] **Step 3: Write the data file**

```ts
/**
 * Справочник регионов/городов РФ для комбобокса «Добавить регион» на экране
 * review онбординга (спека #9). Прото-набор: пресеты-группы + крупные города +
 * федеральные округа. `id` совпадает с `label` (регионы — свободный текст в
 * accountSettings.regions).
 */
export interface RegionEntry {
  id: string;
  label: string;
}

const RAW: string[] = [
  // Пресеты
  "Города-миллионники РФ",
  "Вся Россия",
  // Крупнейшие города
  "Москва",
  "Санкт-Петербург",
  "Новосибирск",
  "Екатеринбург",
  "Казань",
  "Нижний Новгород",
  "Челябинск",
  "Самара",
  "Уфа",
  "Ростов-на-Дону",
  "Краснодар",
  "Омск",
  "Воронеж",
  "Пермь",
  "Волгоград",
  "Красноярск",
  "Саратов",
  "Тюмень",
  "Тольятти",
  "Ижевск",
  "Барнаул",
  "Иркутск",
  "Хабаровск",
  "Владивосток",
  "Ярославль",
  "Махачкала",
  "Томск",
  "Оренбург",
  "Кемерово",
  "Калининград",
  "Сочи",
];

export const RU_REGIONS: RegionEntry[] = RAW.map((label) => ({ id: label, label }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/ru-regions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/ru-regions.ts src/data/ru-regions.test.ts
git commit -m "feat(data): справочник регионов РФ для комбобокса review (#9)"
```

---

## Task 2: Хелпер известных доменов (#10)

**Files:**
- Modify: `src/data/trigger-domains.ts`
- Test: `src/data/trigger-domains.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { knownTriggerDomains } from "./trigger-domains";

describe("knownTriggerDomains", () => {
  it("returns a deduped, sorted list of {id,label} from TRIGGER_DOMAINS", () => {
    const list = knownTriggerDomains();
    const ids = list.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // без дубликатов
    expect(list.every((d) => d.id === d.label)).toBe(true);
    // отсортировано по label
    const sorted = [...list].sort((a, b) => a.label.localeCompare(b.label));
    expect(list).toEqual(sorted);
    // содержит известный домен
    expect(ids).toContain("alfabank.ru");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/trigger-domains.test.ts`
Expected: FAIL — `knownTriggerDomains is not a function`.

- [ ] **Step 3: Add the helper (append to `src/data/trigger-domains.ts`, after the `TRIGGER_DOMAINS` export)**

```ts
/**
 * Плоский, дедуплицированный и отсортированный список всех доменов из
 * TRIGGER_DOMAINS — подсказки для комбобокса «Добавить» в блок-листе доменов
 * (спека #10). Формат {id,label} — под DirectoryEntry.
 */
export function knownTriggerDomains(): { id: string; label: string }[] {
  const seen = new Set<string>();
  for (const domains of Object.values(TRIGGER_DOMAINS)) {
    for (const d of domains) seen.add(d);
  }
  return [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map((d) => ({ id: d, label: d }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/trigger-domains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/trigger-domains.ts src/data/trigger-domains.test.ts
git commit -m "feat(data): knownTriggerDomains() — подсказки доменов для review (#10)"
```

---

## Task 3: Каталог интересов по направлению (#6)

**Files:**
- Modify: `src/data/account-interests.ts`
- Test: `src/data/account-interests.test.ts` (файл существует — добавить блок)

Контекст: `INTERESTS_BY_DIRECTION` (в `interests-by-direction.ts`) — `Record<DirectionId, InterestId[]>`; `getInterestById(id)` (в `triggers-by-vertical.ts`) → `{ id, label, ... } | undefined`.

- [ ] **Step 1: Write the failing test (добавить в конец `account-interests.test.ts`)**

```ts
import { buildInterestDirectory } from "./account-interests";

describe("buildInterestDirectory", () => {
  it("returns direction interests as {id,label}, excluding already-active ids", () => {
    const dir = buildInterestDirectory("banking", ["credit"]);
    const ids = dir.map((d) => d.id);
    expect(ids).not.toContain("credit"); // активный исключён
    expect(ids).toContain("mortgage"); // из banking-набора
    expect(dir.every((d) => typeof d.label === "string" && d.label.length > 0)).toBe(true);
  });

  it("returns empty list for null direction", () => {
    expect(buildInterestDirectory(null, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/account-interests.test.ts`
Expected: FAIL — `buildInterestDirectory is not a function`.

- [ ] **Step 3: Add the helper (append to `src/data/account-interests.ts`)**

```ts
import { INTERESTS_BY_DIRECTION } from "./interests-by-direction";
import type { DirectionId } from "@/types/directions";
// getInterestById уже импортирован в этом файле сверху.

/**
 * Справочник интересов для комбобокса «Добавить интерес» (спека #6): интересы,
 * релевантные направлению компании, минус уже активные. Контролируемый набор —
 * произвольные интересы не вводятся (маппятся на триггеры).
 */
export function buildInterestDirectory(
  directionId: DirectionId | null,
  activeIds: string[],
): { id: string; label: string }[] {
  if (!directionId) return [];
  const active = new Set(activeIds);
  const out: { id: string; label: string }[] = [];
  for (const id of INTERESTS_BY_DIRECTION[directionId] ?? []) {
    if (active.has(id)) continue;
    const interest = getInterestById(id);
    if (interest) out.push({ id: interest.id, label: interest.label });
  }
  return out;
}
```

Примечание: если `getInterestById` уже импортирован строкой `import { getInterestById } from "./triggers-by-vertical";` — не дублировать импорт, добавить только `INTERESTS_BY_DIRECTION` и `DirectionId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/account-interests.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/account-interests.ts src/data/account-interests.test.ts
git commit -m "feat(data): buildInterestDirectory() — интересы по направлению (#6)"
```

---

## Task 4: Чистая логика комбобокса `directoryOptions`

**Files:**
- Create: `src/sections/survey/directory-options.ts`
- Test: `src/sections/survey/directory-options.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { directoryOptions } from "./directory-options";

const dir = [
  { id: "msk", label: "Москва" },
  { id: "spb", label: "Санкт-Петербург" },
];

describe("directoryOptions", () => {
  it("hides entries whose id is already among items", () => {
    const { available } = directoryOptions(
      [{ id: "msk", label: "Москва" }],
      dir,
      "",
      false,
    );
    expect(available.map((d) => d.id)).toEqual(["spb"]);
  });

  it("offers a custom entry when allowCustom and query is not in directory", () => {
    const { custom } = directoryOptions([], dir, "Тула", true);
    expect(custom).toBe("Тула");
  });

  it("no custom entry when allowCustom is false", () => {
    const { custom } = directoryOptions([], dir, "Тула", false);
    expect(custom).toBeNull();
  });

  it("no custom entry when query matches an existing directory label (case-insensitive)", () => {
    const { custom } = directoryOptions([], dir, "москва", true);
    expect(custom).toBeNull();
  });

  it("no custom entry for empty/whitespace query", () => {
    expect(directoryOptions([], dir, "   ", true).custom).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/survey/directory-options.test.ts`
Expected: FAIL — `Cannot find module './directory-options'`.

- [ ] **Step 3: Write the implementation**

```ts
export interface DirectoryEntry {
  id: string;
  label: string;
}
export interface ChipItem {
  id: string;
  label: string;
}

/**
 * Чистая логика комбобокса-справочника (используется DirectoryChipsField):
 * — `available`: записи справочника, которых ещё нет среди выбранных чипов;
 * — `custom`: строка для пункта «Добавить „…“» при allowCustom, если ввод
 *   непустой и не совпадает с уже доступным пунктом; иначе null.
 * Фильтрацию по подстроке делает cmdk на уровне DOM — здесь только исключение
 * активных и решение про custom-пункт.
 */
export function directoryOptions(
  items: ChipItem[],
  directory: DirectoryEntry[],
  query: string,
  allowCustom: boolean,
): { available: DirectoryEntry[]; custom: string | null } {
  const activeIds = new Set(items.map((i) => i.id));
  const available = directory.filter((d) => !activeIds.has(d.id));

  const q = query.trim();
  let custom: string | null = null;
  if (allowCustom && q.length > 0) {
    const lower = q.toLowerCase();
    const inDirectory = directory.some((d) => d.label.toLowerCase() === lower);
    const alreadyChip = items.some((i) => i.label.toLowerCase() === lower);
    if (!inDirectory && !alreadyChip) custom = q;
  }
  return { available, custom };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sections/survey/directory-options.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sections/survey/directory-options.ts src/sections/survey/directory-options.test.ts
git commit -m "feat(survey): directoryOptions — чистая логика комбобокса-справочника"
```

---

## Task 5: Компонент `DirectoryChipsField`

**Files:**
- Create: `src/sections/survey/directory-chips-field.tsx`
- Test: `src/sections/survey/directory-chips-field.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DirectoryChipsField } from "./directory-chips-field";

afterEach(cleanup);

const dir = [
  { id: "msk", label: "Москва" },
  { id: "spb", label: "Санкт-Петербург" },
];

describe("DirectoryChipsField", () => {
  it("renders current items as chips and an add trigger", () => {
    render(
      <DirectoryChipsField
        items={[{ id: "msk", label: "Москва" }]}
        directory={dir}
        onAdd={() => {}}
        onRemove={() => {}}
        addLabel="Добавить регион"
        removeLabel={(i) => `Убрать ${i.label}`}
      />,
    );
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Добавить регион" }),
    ).toBeInTheDocument();
  });

  it("calls onRemove with the item id when the chip remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <DirectoryChipsField
        items={[{ id: "msk", label: "Москва" }]}
        directory={dir}
        onAdd={() => {}}
        onRemove={onRemove}
        addLabel="Добавить регион"
        removeLabel={(i) => `Убрать ${i.label}`}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Убрать Москва" }));
    expect(onRemove).toHaveBeenCalledWith("msk");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/survey/directory-chips-field.test.tsx`
Expected: FAIL — `Cannot find module './directory-chips-field'`.

- [ ] **Step 3: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { directoryOptions, type ChipItem, type DirectoryEntry } from "./directory-options";

export function DirectoryChipsField({
  items,
  directory,
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
  searchPlaceholder = "Поиск",
  emptyText = "Ничего не найдено",
  allowCustom = false,
}: {
  items: ChipItem[];
  directory: DirectoryEntry[];
  onAdd: (item: ChipItem) => void;
  onRemove: (id: string) => void;
  addLabel: string;
  removeLabel: (item: ChipItem) => string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { available, custom } = directoryOptions(items, directory, query, allowCustom);

  function add(item: ChipItem) {
    onAdd(item);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground"
        >
          {item.label}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={removeLabel(item)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground data-[popup-open]:border-brand/50 data-[popup-open]:text-foreground">
          <Plus className="h-3 w-3 text-[var(--brand)]" />
          {addLabel}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {available.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.label}
                    onSelect={() => add({ id: d.id, label: d.label })}
                  >
                    {d.label}
                  </CommandItem>
                ))}
                {custom !== null && (
                  <CommandItem
                    key="__custom__"
                    value={custom}
                    onSelect={() => add({ id: custom, label: custom })}
                  >
                    Добавить «{custom}»
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sections/survey/directory-chips-field.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sections/survey/directory-chips-field.tsx src/sections/survey/directory-chips-field.test.tsx
git commit -m "feat(survey): DirectoryChipsField — чипы + комбобокс-справочник"
```

---

## Task 6: Переписать `OnboardingReviewScreen` (#3,#4,#5,#6,#7,#8,#1,#2)

**Files:**
- Modify: `src/sections/survey/onboarding-review-screen.tsx` (полная переработка)
- Modify: `src/sections/survey/survey-section.tsx` (прокинуть `survey`)
- Test: `src/sections/survey/onboarding-review-screen.test.tsx` (создать)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppStateProvider } from "@/state/app-state-context";
import type { Survey } from "@/types/survey";
import { OnboardingReviewScreen } from "./onboarding-review-screen";

afterEach(cleanup);

const survey: Survey = {
  companyName: "",
  companyWebsite: "mytest.ru",
  taskDescription: "привлечь ипотечников",
  directionId: null,
};

function renderScreen(onContinue = vi.fn(), onBack = vi.fn()) {
  render(
    <AppStateProvider>
      <OnboardingReviewScreen survey={survey} onContinue={onContinue} onBack={onBack} />
    </AppStateProvider>,
  );
  return { onContinue, onBack };
}

describe("OnboardingReviewScreen", () => {
  it("inherits the site typed on the previous step (#3)", () => {
    renderScreen();
    expect(screen.getByText("mytest.ru")).toBeInTheDocument();
  });

  it("does not render the removed subtitle (#4)", () => {
    renderScreen();
    expect(screen.queryByText(/Афина изучила/)).not.toBeInTheDocument();
  });

  it("renders labelled fields (#5/#7/#8)", () => {
    renderScreen();
    expect(screen.getByText("Название компании")).toBeInTheDocument();
    expect(screen.getByText("Описание бизнеса")).toBeInTheDocument();
    expect(screen.getByText("Тон бренда")).toBeInTheDocument();
  });

  it("calls onContinue on the primary button and onBack on «Назад» (#1/#2)", () => {
    const { onContinue, onBack } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Всё верно, продолжить" }));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/survey/onboarding-review-screen.test.tsx`
Expected: FAIL — компонент не принимает `survey`, отсутствуют лейблы, есть подпись.

- [ ] **Step 3: Rewrite `onboarding-review-screen.tsx` (полностью заменить содержимое)**

```tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DirectionCombobox } from "./direction-combobox";
import { DirectoryChipsField } from "./directory-chips-field";
import type { ChipItem } from "./directory-options";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { buildInterestDirectory } from "@/data/account-interests";
import { RU_REGIONS } from "@/data/ru-regions";
import { knownTriggerDomains } from "@/data/trigger-domains";
import type { AccountSettings } from "@/types/account-settings";
import type { InterestId } from "@/types/directions";
import type { Survey } from "@/types/survey";

interface OnboardingReviewScreenProps {
  /** Данные предыдущего шага (форма) — наследуем сайт/имя/направление (#3). */
  survey: Survey;
  /** Called after the reviewed data has been committed to accountSettings. */
  onContinue: () => void;
  /** Step back to the website-entry screen. Hidden when omitted. */
  onBack?: () => void;
}

function domainOf(website: string): string {
  return website.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Экран проверки данных (спека #3, редизайн aim 2026-07-06). Полноценная форма
 * с лейблами: значения афины редактируются в видимых полях, а справочные наборы
 * (регионы/интересы/домены) — через чипы + комбобокс-справочник. Данные копятся
 * в локальном стейджинге и пишутся в accountSettings РАЗОМ по «Продолжить».
 */
export function OnboardingReviewScreen({
  survey,
  onContinue,
  onBack,
}: OnboardingReviewScreenProps) {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  // Стейджинг: DEMO/аккаунт как «что поняла афина», но сайт (и имя/направление,
  // если заданы) наследуем из формы — суть бага #3.
  const [draft, setDraft] = useState<AccountSettings>(() => ({
    ...accountSettings,
    companyWebsite: survey.companyWebsite.trim() || accountSettings.companyWebsite,
    companyName: survey.companyName.trim() || accountSettings.companyName,
    directionId: survey.directionId ?? accountSettings.directionId,
  }));

  function patch(p: Partial<AccountSettings>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const regionItems: ChipItem[] = draft.regions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => ({ id: r, label: r }));
  function setRegions(next: ChipItem[]) {
    patch({ regions: next.map((r) => r.label).join(", ") });
  }

  const interestItems: ChipItem[] = draft.interests.map((i) => ({ id: i.id, label: i.label }));
  const interestDirectory = buildInterestDirectory(
    draft.directionId,
    draft.interests.map((i) => i.id),
  );

  const domainItems: ChipItem[] = draft.domainBlocklist.map((d) => ({ id: d, label: d }));

  function confirm() {
    dispatch({ type: "account_review_confirmed", settings: draft });
    onContinue();
  }

  const domain = domainOf(draft.companyWebsite) || "ваш сайт";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
    >
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" aria-hidden />
          {domain}
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          Проверьте, что афина поняла о вашей компании
        </h1>
      </header>

      {/* ГРУППА 1 · Компания */}
      <Group label="Компания">
        <Field label="Название компании">
          <Input
            value={draft.companyName}
            placeholder="Название компании"
            onChange={(e) => patch({ companyName: e.target.value })}
          />
        </Field>
        <Field label="Направление">
          <DirectionCombobox
            value={draft.directionId}
            onChange={(next) => patch({ directionId: next })}
          />
        </Field>
        <Field label="Регионы">
          <DirectoryChipsField
            items={regionItems}
            directory={RU_REGIONS}
            onAdd={(item) => {
              if (!regionItems.some((r) => r.id === item.id)) {
                setRegions([...regionItems, item]);
              }
            }}
            onRemove={(id) => setRegions(regionItems.filter((r) => r.id !== id))}
            addLabel="Добавить регион"
            removeLabel={(r) => `Убрать регион ${r.label}`}
          />
        </Field>
      </Group>

      {/* ГРУППА 2 · О бизнесе */}
      <Group label="О бизнесе">
        <Field label="Описание бизнеса">
          <Textarea
            rows={4}
            value={draft.aiSummary}
            placeholder="Короткое описание бизнеса"
            onChange={(e) => patch({ aiSummary: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Интересы">
          <DirectoryChipsField
            items={interestItems}
            directory={interestDirectory}
            onAdd={(item) =>
              patch({
                interests: [
                  ...draft.interests,
                  { id: item.id as InterestId, label: item.label },
                ],
                suggestedInterests: draft.suggestedInterests.filter(
                  (s) => s.id !== item.id,
                ),
              })
            }
            onRemove={(id) =>
              patch({
                interests: draft.interests.filter((i) => i.id !== id),
              })
            }
            addLabel="Добавить интерес"
            removeLabel={(i) => `Убрать интерес ${i.label}`}
          />
        </Field>
      </Group>

      {/* ГРУППА 3 · Коммуникации */}
      <Group label="Коммуникации">
        <Field label="Тон бренда">
          <Textarea
            rows={2}
            value={draft.brandTone}
            placeholder="Например, дружелюбный и уверенный"
            onChange={(e) => patch({ brandTone: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Ключевые сообщения">
          <Textarea
            rows={2}
            value={draft.brandMessages}
            placeholder="Что важно доносить в каждом сообщении"
            onChange={(e) => patch({ brandMessages: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Исключения (домены)">
          <DirectoryChipsField
            items={domainItems}
            directory={knownTriggerDomains()}
            allowCustom
            onAdd={(item) => {
              const dm = item.label.trim().toLowerCase();
              if (dm && !draft.domainBlocklist.includes(dm)) {
                patch({ domainBlocklist: [...draft.domainBlocklist, dm] });
              }
            }}
            onRemove={(id) =>
              patch({
                domainBlocklist: draft.domainBlocklist.filter((x) => x !== id),
              })
            }
            addLabel="Добавить"
            searchPlaceholder="Домен или поиск"
            removeLabel={(d) => `Убрать исключение ${d.label}`}
          />
        </Field>
      </Group>

      {/* Действия — кнопки визарда: outline «Назад» + default «Продолжить» */}
      <div className="mt-2 flex items-center justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            Назад
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={confirm}>Всё верно, продолжить</Button>
      </div>
    </motion.div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Update `survey-section.tsx` to pass `survey` into the review screen**

Найти блок `phase.kind === "review"` (рендер `<OnboardingReviewScreen ... />`) и добавить проп `survey={phase.survey}`:

```tsx
<OnboardingReviewScreen
  survey={phase.survey}
  onContinue={handleReviewContinue}
  onBack={handleReviewBack}
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/sections/survey/onboarding-review-screen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck the touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E "onboarding-review-screen|survey-section|directory-chips-field" || echo clean`
Expected: `clean` (базовые 13 ошибок не в этих файлах).

- [ ] **Step 7: Commit**

```bash
git add src/sections/survey/onboarding-review-screen.tsx src/sections/survey/onboarding-review-screen.test.tsx src/sections/survey/survey-section.tsx
git commit -m "feat(survey): редизайн review-экрана — лейбл-поля, комбобоксы, наследование сайта, кнопки визарда (#1-#10)"
```

---

## Task 7: `SettingsEmptyState` + роутинг `page.tsx` (#11)

**Files:**
- Create: `src/sections/settings/settings-empty-state.tsx`
- Test: `src/sections/settings/settings-empty-state.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the failing test (component)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SettingsEmptyState } from "./settings-empty-state";

afterEach(cleanup);

describe("SettingsEmptyState", () => {
  it("shows the onboarding prompt and calls onStart on the CTA", () => {
    const onStart = vi.fn();
    render(<SettingsEmptyState onStart={onStart} />);
    expect(screen.getByText(/настро/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Настроить с афиной" }));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sections/settings/settings-empty-state.test.tsx`
Expected: FAIL — `Cannot find module './settings-empty-state'`.

- [ ] **Step 3: Write the component**

```tsx
"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Пустое состояние раздела «Настройки» для первого входа (аккаунт не настроен,
 * спека #11). Вместо авто-запуска опроса — дружелюбная подводка и одна кнопка,
 * запускающая опрос. Асимметрия слева, жёлтый только на кнопке.
 */
export function SettingsEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-5 px-6 pt-24 pb-promptbar"
      >
        <Image
          src="/mascot-icon.svg"
          alt=""
          width={56}
          height={56}
          aria-hidden
          priority
          className="select-none"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Расскажите о вашей компании
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Опишите бизнес и задачу — афина настроит интересы, сегменты и кампании
            под вас. Займёт пару минут.
          </p>
        </div>
        <Button onClick={onStart} className="mt-1">
          Настроить с афиной
        </Button>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sections/settings/settings-empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `page.tsx` routing (#11)**

В `src/app/page.tsx`:

(a) Добавить `useState` в импорт react (строка 3):

```tsx
import { useState, type ReactNode } from "react";
```

(b) Импортировать компонент (рядом с импортом `SettingsSection`, строка 35):

```tsx
import { SettingsEmptyState } from "@/sections/settings/settings-empty-state";
```

(c) В компоненте `Home` (после строки `const dispatch = useAppDispatch();`) добавить локальный флаг:

```tsx
  // #11: первый вход в «Настройки» показывает пустое состояние; опрос
  // запускается только по кнопке (не авто).
  const [settingsSurveyStarted, setSettingsSurveyStarted] = useState(false);
```

(d) Заменить строку `const isFullscreen = view.kind === "survey" || settingsSurvey;` на:

```tsx
  const isFullscreen =
    view.kind === "survey" || (settingsSurvey && settingsSurveyStarted);
```

(e) В `renderMain`, ветку `if (view.name === "Настройки") { ... }` заменить на:

```tsx
      if (view.name === "Настройки") {
        // Первый вход (анкета не пройдена): пустое состояние с подводкой; опрос
        // стартует по кнопке. По завершении surveyStatus → "completed" →
        // перерисовка покажет заполненные настройки.
        if (settingsSurvey) {
          if (!settingsSurveyStarted) {
            return (
              <SettingsEmptyState onStart={() => setSettingsSurveyStarted(true)} />
            );
          }
          return (
            <SurveySection
              withOnboardingScreens
              onComplete={() => setSettingsSurveyStarted(false)}
            />
          );
        }
        return <SettingsSection />;
      }
```

- [ ] **Step 6: Typecheck + full run**

Run: `npx tsc --noEmit 2>&1 | grep -E "page.tsx|settings-empty-state" || echo clean`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/sections/settings/settings-empty-state.tsx src/sections/settings/settings-empty-state.test.tsx src/app/page.tsx
git commit -m "feat(settings): пустое состояние первого входа в Настройки вместо авто-опроса (#11)"
```

---

## Task 8: Финальная верификация

**Files:** нет (проверка).

- [ ] **Step 1: Полный прогон unit-тестов**

Run: `npx vitest run`
Expected: все зелёные (базовые ~1354 + новые). Если упал тест, завязанный на старую разметку review (напр. `onboarding-interests-screen.test.ts`), — проверить, актуален ли он; экран interests не используется в survey-section (review его заменил), тест править только если он ссылается на изменённые модули.

- [ ] **Step 2: Typecheck (baseline)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `13` (предсуществующий baseline; новые файлы — чисто).

- [ ] **Step 3: Lint изменённых файлов**

Run: `npx eslint src/sections/survey/directory-options.ts src/sections/survey/directory-chips-field.tsx src/sections/survey/onboarding-review-screen.tsx src/sections/settings/settings-empty-state.tsx src/app/page.tsx src/data/ru-regions.ts`
Expected: без ошибок.

- [ ] **Step 4: Визуальная проверка (браузер, dev на :3000)**

Проверить два потока в запущенном приложении:
1. Welcome → «Подобрать сценарии» → форма (ввести сайт `mytest.ru`) → ожидание → **review**: домен = `mytest.ru` (#3), нет подписи (#4), лейбл-поля (#5/#7/#8), «+ Добавить регион/интерес» открывает комбобокс со справочником (#6/#9/#10), «Добавить» в доменах даёт ввести свой (#10), кнопки «Назад» (outline) / «Всё верно, продолжить» (белая).
2. Пустой пресет → сайдбар-меню → «Настройки»: пустое состояние с подводкой и кнопкой «Настроить с афиной» (#11); клик запускает опрос.

- [ ] **Step 5: Финальный отчёт пользователю** — путь ворктри/ветка, что проверено, открытые вопросы (копирайт #11, allowCustom для регионов).

---

## Self-review (заполняется при написании плана)

- **Покрытие спека:** #1 (Task 6, outline «Назад») · #2 (Task 6, default) · #3 (Task 6, seed из survey + тест) · #4 (Task 6, подпись удалена + тест) · #5/#7/#8 (Task 6, Field-лейблы + тест) · #6 (Task 3 + Task 6) · #9 (Task 1 + Task 6) · #10 (Task 2 + Task 6, allowCustom) · #11 (Task 7). Общий компонент — Task 4/5.
- **Отклонения от спека (осознанные):** `suggestedInterests` НЕ показываются отдельной группой «Рекомендованные афиной» (YAGNI: комбобокс одногруппный). При добавлении интереса он убирается из suggested. Если нужна группа-подсказка — расширить DirectoryChipsField опцией `groups` позже.
- **Регионы:** `allowCustom` НЕ включён (по спеку — из справочника). Включить, если понадобится произвольный город.
- **Типы:** `ChipItem`/`DirectoryEntry` определены в `directory-options.ts`, импортируются везде; `InterestId`-каст при добавлении интереса.
