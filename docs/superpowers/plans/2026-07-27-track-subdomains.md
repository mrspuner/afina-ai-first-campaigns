# Добор поддоменов третьего уровня — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый корневой домен каждого триггера получает от 3 до 12 поддоменов третьего уровня в зависимости от тира триггера, при этом все 192 существующих рукописных поддомена сохраняются и идут первыми.

**Architecture:** Новый чистый модуль `src/data/subdomain-fill.ts` детерминированно дописывает недостающие поддомены из двух пулов префиксов (сервисные и региональные) по сиду корневого домена. Подключается единственной точкой — внутри `getTriggerDomains`, с мемоизацией по идентификатору триггера. Сырые данные `TRIGGER_DOMAINS` не трогаются.

**Tech Stack:** TypeScript, vitest, существующий ГПСЧ `rngFor` из `src/state/metrics.ts`.

**Спека:** `docs/superpowers/specs/2026-07-27-trigger-subdomain-fill-design.md`

## Global Constraints

- Работа идёт в worktree `.worktrees/track-subdomains` на ветке `feature/track-subdomains`. Никаких коммитов в `main`.
- Никогда не запускать `git stash` — worktree делит индекс с основным чекаутом.
- `Math.random` запрещён во всём проекте. Единственный источник случайности — `rngFor` из `@/state/metrics`.
- `TRIGGER_DOMAINS` — сырые данные. Ни один таск не редактирует их содержимое.
- Планки тиров, строго: `shallow` = 3, `medium` = 7, `deep` = 12.
- Пул сервисных префиксов, в этом порядке: `lk, my, online, m, app, cabinet, login, id, shop, catalog, order, promo, help, support, news, info` (16 штук).
- Пул региональных префиксов, в этом порядке: `msk, spb, ekb, nsk, kzn, nnov, rostov, samara, ufa, krd, perm, chel, omsk, krsk, vrn` (15 штук).
- Доля сервисных в доборе — 55%, округление вверх. Считается от ДОБОРА (`планка − количество рукописных`), не от планки.
- Сид добора — `rngFor("subdomain-fill", root)`, только корень, без идентификатора триггера.
- Команда тестов: `npm test`. Тайпчек: `npx tsc --noEmit`. Оба должны проходить в конце каждого таска.
- Русские комментарии в коде — норма этого репозитория, следовать окружающему стилю файла.

---

## Файловая структура

| Файл | Ответственность |
|---|---|
| `src/data/subdomain-fill.ts` | **создать.** Чистый генератор: тиры, пулы, перестановка, добор. Не импортирует `trigger-domains.ts` (иначе цикл). |
| `src/data/subdomain-fill.test.ts` | **создать.** Тесты генератора в изоляции от данных. |
| `src/data/trigger-domains.ts` | **изменить.** `getTriggerDomains` применяет добор и мемоизирует результат. |
| `src/data/trigger-domains.test.ts` | **изменить.** Новые инварианты на глубину; три эталонных теста B3 переписываются с `toEqual` на проверку префикса. |
| `src/sections/campaigns/wizard/steps/interests-triggers-editor.test.tsx` | **изменить.** Один тест сужается с `getByText` до запроса по `aria-label`. |

---

### Task 1: Тиры триггеров

Чистая функция «идентификатор триггера → тир». Перечисляются только `deep` и `shallow`; `medium` — значение по умолчанию, поэтому новый триггер получает разумную глубину без правки списков.

**Files:**
- Create: `src/data/subdomain-fill.ts`
- Test: `src/data/subdomain-fill.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `export type DomainTier = "shallow" | "medium" | "deep"`
  - `export const TIER_QUOTA: Record<DomainTier, number>`
  - `export function tierForTrigger(triggerId: string): DomainTier`

- [ ] **Step 1: Написать падающий тест**

Создать `src/data/subdomain-fill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TIER_QUOTA, tierForTrigger } from "./subdomain-fill";

describe("tierForTrigger", () => {
  it("квоты тиров — 3 / 7 / 12", () => {
    expect(TIER_QUOTA.shallow).toBe(3);
    expect(TIER_QUOTA.medium).toBe(7);
    expect(TIER_QUOTA.deep).toBe(12);
  });

  it("федеральные потребительские порталы — deep", () => {
    expect(tierForTrigger("credit-banks")).toBe("deep");
    expect(tierForTrigger("apartment-listings")).toBe("deep");
    expect(tierForTrigger("food-grocery")).toBe("deep");
  });

  it("нишевые справочники и калькуляторы — shallow", () => {
    expect(tierForTrigger("mortgage-calculators")).toBe("shallow");
    expect(tierForTrigger("osago-calculators")).toBe("shallow");
    expect(tierForTrigger("procurement-suppliers")).toBe("shallow");
  });

  it("всё остальное — medium, включая незнакомый триггер", () => {
    expect(tierForTrigger("credit-aggregators")).toBe("medium");
    expect(tierForTrigger("hr-job-boards")).toBe("medium");
    expect(tierForTrigger("совершенно-новый-триггер")).toBe("medium");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `npm test -- src/data/subdomain-fill.test.ts`
Expected: FAIL — `Failed to resolve import "./subdomain-fill"`.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `src/data/subdomain-fill.ts`:

```ts
/**
 * Детерминированный добор поддоменов третьего уровня к корневым доменам
 * триггеров (спека 2026-07-27-trigger-subdomain-fill-design).
 *
 * Модуль чистый и НЕ импортирует `trigger-domains.ts` — иначе получился бы
 * цикл: данные подключают добор, добор читал бы данные. Всё, что нужно
 * генератору, приходит аргументами.
 */

/** Глубина датасета у триггера. Задаётся природой вертикали, не случайно. */
export type DomainTier = "shallow" | "medium" | "deep";

/** Минимум поддоменов НА КАЖДЫЙ корневой домен для каждого тира. */
export const TIER_QUOTA: Record<DomainTier, number> = {
  shallow: 3,
  medium: 7,
  deep: 12,
};

/**
 * Федеральные потребительские порталы: реально несут и сервисные, и
 * региональные поддомены, поэтому им — максимальная глубина.
 */
const DEEP_TRIGGERS: ReadonlySet<string> = new Set([
  "credit-banks",
  "mortgage-bank-programs",
  "investments-brokers",
  "insurance-companies",
  "new-car-dealers",
  "used-car-listings",
  "auto-credit-banks",
  "mobile-competitors",
  "home-isp",
  "apartment-listings",
  "rent-listings",
  "electronics-marketplaces",
  "fashion-marketplaces",
  "food-grocery",
]);

/**
 * Нишевые справочники, калькуляторы и агрегаторы: у таких сайтов поддоменов
 * почти не бывает, глубокий добор выглядел бы неправдоподобно.
 */
const SHALLOW_TRIGGERS: ReadonlySet<string> = new Set([
  "credit-brokers",
  "mortgage-calculators",
  "investments-education",
  "used-car-history",
  "auto-credit-leasing",
  "osago-calculators",
  "mobile-tariff-compare",
  "home-isp-reviews",
  "country-villages",
  "commercial-brokers",
  "higher-edu-aggregators",
  "child-edu-tutors",
  "biz-accounting",
  "procurement-suppliers",
]);

/**
 * Тир триггера. Перечислены только края — `medium` это дефолт, поэтому новый
 * триггер получает разумную глубину без правки списков выше.
 */
export function tierForTrigger(triggerId: string): DomainTier {
  if (DEEP_TRIGGERS.has(triggerId)) return "deep";
  if (SHALLOW_TRIGGERS.has(triggerId)) return "shallow";
  return "medium";
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

Run: `npm test -- src/data/subdomain-fill.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add src/data/subdomain-fill.ts src/data/subdomain-fill.test.ts
git commit -m "feat(domains): тиры глубины поддоменов по триггерам"
```

---

### Task 2: Генератор добора

Ядро трека. Дописывает недостающие поддомены до планки тира, сохраняя рукописные первыми, детерминированно по сиду корня.

**Files:**
- Modify: `src/data/subdomain-fill.ts`
- Test: `src/data/subdomain-fill.test.ts`

**Interfaces:**
- Consumes: `DomainTier`, `TIER_QUOTA` из Task 1; `rngFor` из `@/state/metrics` (сигнатура: `rngFor(...parts: Array<string | number>): () => number`).
- Produces:
  - `export const SERVICE_PREFIXES: readonly string[]`
  - `export const REGION_PREFIXES: readonly string[]`
  - `export function fillSubdomains(root: string, existing: readonly string[], tier: DomainTier): string[]` — возвращает ПОЛНЫЙ список поддоменов группы: рукописные первыми в исходном порядке, затем добор.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/data/subdomain-fill.test.ts`:

```ts
import {
  SERVICE_PREFIXES,
  REGION_PREFIXES,
  fillSubdomains,
} from "./subdomain-fill";

/** Префикс поддомена третьего уровня: `lk.sberbank.ru` при корне
 *  `sberbank.ru` → `lk`. Тестовый помощник, зеркалит логику генератора. */
const prefix = (sub: string, root: string) => sub.slice(0, -`.${root}`.length);

describe("fillSubdomains", () => {
  it("из пустой группы добирает ровно до планки каждого тира", () => {
    expect(fillSubdomains("example.ru", [], "shallow")).toHaveLength(3);
    expect(fillSubdomains("example.ru", [], "medium")).toHaveLength(7);
    expect(fillSubdomains("example.ru", [], "deep")).toHaveLength(12);
  });

  it("рукописные сохранены, идут первыми и в исходном порядке", () => {
    const existing = ["online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"];
    const result = fillSubdomains("sberbank.ru", existing, "deep");
    expect(result).toHaveLength(12);
    expect(result.slice(0, 3)).toEqual(existing);
  });

  it("префикс рукописного поддомена не дублируется в доборе", () => {
    // `online` и `my` есть в сервисном пуле — добор обязан их пропустить.
    const existing = ["online.example.ru", "my.example.ru"];
    const result = fillSubdomains("example.ru", existing, "deep");
    const prefixes = result.map((s) => prefix(s, "example.ru"));
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(prefixes.filter((p) => p === "online")).toHaveLength(1);
    expect(prefixes.filter((p) => p === "my")).toHaveLength(1);
  });

  it("группа, где рукописных не меньше планки, не изменяется", () => {
    const existing = ["a.example.ru", "b.example.ru", "c.example.ru", "d.example.ru"];
    expect(fillSubdomains("example.ru", existing, "shallow")).toEqual(existing);
  });

  it("один и тот же корень даёт идентичный результат при повторном вызове", () => {
    const a = fillSubdomains("example.ru", [], "deep");
    const b = fillSubdomains("example.ru", [], "deep");
    expect(a).toEqual(b);
  });

  it("разные корни дают разные наборы префиксов", () => {
    const a = fillSubdomains("alpha.ru", [], "deep").map((s) => prefix(s, "alpha.ru"));
    const b = fillSubdomains("bravo.ru", [], "deep").map((s) => prefix(s, "bravo.ru"));
    expect(a).not.toEqual(b);
  });

  it("у глубокого тира в доборе есть хотя бы один региональный префикс", () => {
    const result = fillSubdomains("example.ru", [], "deep");
    const prefixes = result.map((s) => prefix(s, "example.ru"));
    expect(prefixes.some((p) => REGION_PREFIXES.includes(p))).toBe(true);
  });

  it("пропорция добора — 55% сервисных, округление вверх", () => {
    const forTier = (tier: "shallow" | "medium" | "deep") =>
      fillSubdomains("example.ru", [], tier)
        .map((s) => prefix(s, "example.ru"))
        .filter((p) => SERVICE_PREFIXES.includes(p)).length;
    expect(forTier("shallow")).toBe(2); // ceil(3 * 0.55)
    expect(forTier("medium")).toBe(4); // ceil(7 * 0.55)
    expect(forTier("deep")).toBe(7); // ceil(12 * 0.55)
  });

  it("пропорция считается от добора, а не от планки", () => {
    // 3 рукописных + deep(12) → добор 9 → ceil(9*0.55)=5 сервисных, 4 региональных.
    const existing = ["one.example.ru", "two.example.ru", "three.example.ru"];
    const added = fillSubdomains("example.ru", existing, "deep")
      .slice(3)
      .map((s) => prefix(s, "example.ru"));
    expect(added).toHaveLength(9);
    expect(added.filter((p) => SERVICE_PREFIXES.includes(p))).toHaveLength(5);
    expect(added.filter((p) => REGION_PREFIXES.includes(p))).toHaveLength(4);
  });

  it("работает с составными и нестандартными TLD", () => {
    for (const root of ["credit.club", "finbroker.pro", "splitka.io"]) {
      const result = fillSubdomains(root, [], "medium");
      expect(result).toHaveLength(7);
      for (const sub of result) {
        expect(sub.endsWith(`.${root}`)).toBe(true);
        expect(prefix(sub, root)).not.toContain(".");
      }
    }
  });

  it("рукописный поддомен, не подчинённый корню, добор не ломает", () => {
    // Защита от кривых данных: такой поддомен просто не даёт занятого префикса.
    const result = fillSubdomains("example.ru", ["чужое.other.ru"], "shallow");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("чужое.other.ru");
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

Run: `npm test -- src/data/subdomain-fill.test.ts`
Expected: FAIL — `fillSubdomains is not a function` (или ошибка импорта `SERVICE_PREFIXES`).

- [ ] **Step 3: Написать реализацию**

Дописать в конец `src/data/subdomain-fill.ts`:

```ts
import { rngFor } from "@/state/metrics";

/**
 * Сервисные префиксы — встречаются практически у любого сайта с личным
 * кабинетом. Основа добора для любого тира.
 */
export const SERVICE_PREFIXES: readonly string[] = [
  "lk", "my", "online", "m", "app", "cabinet", "login", "id",
  "shop", "catalog", "order", "promo", "help", "support", "news", "info",
];

/**
 * Региональные префиксы — так набирается глубина у федеральных порталов.
 * Двенадцать сервисных подряд выглядели бы нереалистично.
 */
export const REGION_PREFIXES: readonly string[] = [
  "msk", "spb", "ekb", "nsk", "kzn", "nnov", "rostov", "samara",
  "ufa", "krd", "perm", "chel", "omsk", "krsk", "vrn",
];

/** Доля сервисных префиксов в доборе. Округление вверх (см. §4.3 спеки). */
const SERVICE_SHARE = 0.55;

/** Перестановка Фишера—Йетса по переданному ГПСЧ. Исходный пул не мутируется. */
function shuffle(pool: readonly string[], rng: () => number): string[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Префикс поддомена относительно корня: `online.sberbank.ru` при корне
 * `sberbank.ru` → `online`. `null`, если поддомен корню не подчинён — такие
 * данные занятого префикса не дают и добору не мешают.
 */
function prefixOf(subdomain: string, root: string): string | null {
  const suffix = `.${root}`;
  if (!subdomain.endsWith(suffix)) return null;
  return subdomain.slice(0, -suffix.length);
}

/**
 * Дописывает поддомены третьего уровня до планки тира.
 *
 * Рукописный слой неприкосновенен: `existing` всегда возвращается целиком, в
 * исходном порядке и первым. Без этого добор затёр бы настоящие поддомены
 * Сбера, МТС и auto.ru генерическими префиксами — то есть испортил бы лучшую
 * часть датасета.
 *
 * Детерминизм — по сиду КОРНЯ, без идентификатора триггера: один и тот же
 * домен (`sberbank.ru` живёт сразу в трёх триггерах) получает согласованный
 * набор префиксов везде, где встречается, а разная планка тира просто
 * отрезает разную длину от одной и той же перестановки.
 */
export function fillSubdomains(
  root: string,
  existing: readonly string[],
  tier: DomainTier,
): string[] {
  const quota = TIER_QUOTA[tier];
  const need = quota - existing.length;
  if (need <= 0) return [...existing];

  // Префиксы, уже занятые рукописным слоем — повторно не используем.
  const taken = new Set<string>();
  for (const sub of existing) {
    const p = prefixOf(sub, root);
    if (p !== null) taken.add(p);
  }

  // Один поток ГПСЧ на обе перестановки: воспроизводимо и не требует двух сидов.
  const rng = rngFor("subdomain-fill", root);
  const service = shuffle(SERVICE_PREFIXES, rng).filter((p) => !taken.has(p));
  const region = shuffle(REGION_PREFIXES, rng).filter((p) => !taken.has(p));

  const picked: string[] = [];
  const pickedSet = new Set<string>();
  function takeFrom(pool: readonly string[], count: number): void {
    for (const p of pool) {
      if (count <= 0) break;
      if (pickedSet.has(p)) continue;
      picked.push(p);
      pickedSet.add(p);
      count--;
    }
  }

  const serviceCount = Math.ceil(need * SERVICE_SHARE);
  takeFrom(service, serviceCount);
  takeFrom(region, need - serviceCount);
  // Пропорция подчинена планке: если одного пула не хватило, недостаток
  // добирается из другого (§4.3).
  if (picked.length < need) takeFrom(region, need - picked.length);
  if (picked.length < need) takeFrom(service, need - picked.length);

  return [...existing, ...picked.map((p) => `${p}.${root}`)];
}
```

Импорт `rngFor` перенести в шапку файла, к остальным импортам — не оставлять его в середине.

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

Run: `npm test -- src/data/subdomain-fill.test.ts`
Expected: PASS, 15 тестов (4 из Task 1 + 11 новых).

Если падает тест «разные корни дают разные наборы» — проверьте, что `rngFor` получает `root`, а не константу.

- [ ] **Step 5: Тайпчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/data/subdomain-fill.ts src/data/subdomain-fill.test.ts
git commit -m "feat(domains): детерминированный генератор добора поддоменов"
```

---

### Task 3: Подключение к getTriggerDomains с мемоизацией

Единственная точка применения. Мемоизация здесь — не оптимизация, а требование корректности: `getTriggerDomains` вызывается из рендера редактора по нескольку раз на кадр, и новая ссылка на каждый вызов порвёт мемоизацию потребителей.

**Files:**
- Modify: `src/data/trigger-domains.ts` (функция `getTriggerDomains` в конце файла)
- Test: `src/data/trigger-domains.test.ts`

**Interfaces:**
- Consumes: `fillSubdomains`, `tierForTrigger`, `TIER_QUOTA`, `DomainTier` из Task 2.
- Produces: `getTriggerDomains(triggerId: TriggerId): DomainGroup[]` — та же сигнатура, что и раньше; теперь возвращает группы с добором и стабильную ссылку.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `src/data/trigger-domains.test.ts` внутрь существующего `describe("TRIGGER_DOMAINS dataset", ...)`, после теста `"root is unique within a trigger"`:

```ts
  it("каждый корень добран до планки своего тира", () => {
    for (const [id] of entries) {
      const quota = TIER_QUOTA[tierForTrigger(id)];
      for (const grp of getTriggerDomains(id)) {
        expect(grp.subdomains.length, `${id}/${grp.root}`).toBeGreaterThanOrEqual(quota);
      }
    }
  });

  it("поддомены уникальны, подчинены корню и строго третьего уровня", () => {
    for (const [id] of entries) {
      for (const grp of getTriggerDomains(id)) {
        expect(new Set(grp.subdomains).size, `${id}/${grp.root}`).toBe(
          grp.subdomains.length,
        );
        for (const sub of grp.subdomains) {
          expect(sub.endsWith(`.${grp.root}`), `${id}/${sub}`).toBe(true);
          const prefix = sub.slice(0, -`.${grp.root}`.length);
          expect(prefix, `${id}/${sub}`).not.toContain(".");
        }
      }
    }
  });

  it("getTriggerDomains возвращает стабильную ссылку между вызовами", () => {
    expect(getTriggerDomains("credit-banks")).toBe(getTriggerDomains("credit-banks"));
    // Неизвестный триггер идёт на фолбэк — ссылка обязана быть стабильной и там,
    // иначе редактор ре-рендерится вхолостую на каждый кадр.
    expect(getTriggerDomains("нет-такого")).toBe(getTriggerDomains("нет-такого"));
  });

  it("тиры распределены как 14 deep / 41 medium / 14 shallow", () => {
    const counts = { shallow: 0, medium: 0, deep: 0 };
    for (const [id] of entries) counts[tierForTrigger(id)]++;
    expect(counts).toEqual({ deep: 14, medium: 41, shallow: 14 });
  });

  it("рукописный слой сохранён целиком и стоит первым", () => {
    for (const [id, raw] of entries) {
      const filled = getTriggerDomains(id);
      raw.forEach((rawGroup, i) => {
        expect(filled[i].root, `${id}/${rawGroup.root}`).toBe(rawGroup.root);
        expect(
          filled[i].subdomains.slice(0, rawGroup.subdomains.length),
          `${id}/${rawGroup.root}`,
        ).toEqual(rawGroup.subdomains);
      });
    }
  });
```

Дописать импорты в шапку `src/data/trigger-domains.test.ts`:

```ts
import { TIER_QUOTA, tierForTrigger } from "./subdomain-fill";
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

Run: `npm test -- src/data/trigger-domains.test.ts`
Expected: FAIL. «каждый корень добран до планки» падает на первом же корне (0 < 3); «стабильная ссылка» падает, потому что мемоизации ещё нет. Тесты «тиры распределены» и «рукописный слой сохранён» на этом шаге проходят — это нормально, они охраняют то, что не должно сломаться.

- [ ] **Step 3: Написать реализацию**

В `src/data/trigger-domains.ts` заменить существующую `getTriggerDomains` на:

```ts
/**
 * Кэш добранных групп, ключ — идентификатор триггера.
 *
 * Мемоизация ОБЯЗАТЕЛЬНА, и не ради скорости: `getTriggerDomains`
 * вызывается из рендера редактора интересов по нескольку раз на кадр
 * (превью, счётчики, карточки). Без кэша каждый вызов возвращал бы новую
 * ссылку и рвал мемоизацию на стороне потребителей.
 */
const filledCache = new Map<string, DomainGroup[]>();

/**
 * Домены триггера с добором поддоменов третьего уровня до планки его тира
 * (см. `subdomain-fill.ts`). Единственная точка применения добора: все
 * потребители в проекте ходят сюда, `TRIGGER_DOMAINS` остаётся сырыми данными.
 */
export function getTriggerDomains(triggerId: TriggerId): DomainGroup[] {
  const cached = filledCache.get(triggerId);
  if (cached) return cached;

  const raw = TRIGGER_DOMAINS[triggerId] ?? FALLBACK_DOMAINS;
  const tier = tierForTrigger(triggerId);
  const filled = raw.map((group) => ({
    root: group.root,
    subdomains: fillSubdomains(group.root, group.subdomains, tier),
  }));

  filledCache.set(triggerId, filled);
  return filled;
}
```

Дописать импорт в шапку `src/data/trigger-domains.ts`, после существующего импорта `TriggerId`:

```ts
import { fillSubdomains, tierForTrigger } from "./subdomain-fill";
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

Run: `npm test -- src/data/trigger-domains.test.ts`
Expected: новые 5 тестов PASS. Три эталонных теста B3 (`matches the B3 reference exactly`) FAIL — это ожидаемо и чинится в Task 4, полное равенство после добора недостижимо по построению.

- [ ] **Step 5: Замерить результат**

Run:
```bash
npx vitest run src/data/trigger-domains.test.ts --reporter=verbose 2>&1 | head -30
```

Убедиться, что падают ровно три теста B3 и ничего больше. Если падает что-то ещё — разбираться до перехода к Task 4.

- [ ] **Step 6: Коммит**

```bash
git add src/data/trigger-domains.ts src/data/trigger-domains.test.ts
git commit -m "feat(domains): getTriggerDomains применяет добор с мемоизацией"
```

Три теста B3 в этом коммите красные — следующий таск их чинит. Если это неприемлемо, объединить Task 3 и Task 4 в один коммит.

---

### Task 4: Переписать эталонные тесты B3

Три теста сверяют триггер с эталонной таблицей через `toEqual`. После добора полное равенство недостижимо. Заменяем на проверку того, что действительно должно быть неизменным: состав и порядок корней плюс рукописный префикс каждой группы.

**Files:**
- Modify: `src/data/trigger-domains.test.ts` (три теста `matches the B3 reference exactly`)

**Interfaces:**
- Consumes: `getTriggerDomains` из Task 3; существующие константы `B3_CREDIT_BANKS`, `B3_MOBILE_COMPETITORS`, `B3_USED_CAR_LISTINGS` в том же файле.
- Produces: ничего для последующих тасков.

- [ ] **Step 1: Заменить три теста**

В `src/data/trigger-domains.test.ts` удалить три теста:

```ts
  it("credit-banks matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("credit-banks")).toEqual(B3_CREDIT_BANKS);
  });

  it("mobile-competitors matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("mobile-competitors")).toEqual(B3_MOBILE_COMPETITORS);
  });

  it("used-car-listings matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("used-car-listings")).toEqual(B3_USED_CAR_LISTINGS);
  });
```

и вставить на их место:

```ts
  /**
   * Эталонные таблицы B3 больше не сверяются через `toEqual`: после добора
   * полное равенство недостижимо по построению. Проверяем то, что и должно
   * быть неизменным — состав и порядок корней плюс рукописный префикс каждой
   * группы. Так самая качественная часть датасета (настоящие поддомены Сбера,
   * МТС, auto.ru) остаётся под охраной, а добор ей не мешает.
   */
  function expectMatchesB3Reference(id: string, reference: DomainGroup[]) {
    const actual = getTriggerDomains(id);
    expect(actual.map((g) => g.root), `${id}: состав и порядок корней`).toEqual(
      reference.map((g) => g.root),
    );
    reference.forEach((refGroup, i) => {
      expect(
        actual[i].subdomains.slice(0, refGroup.subdomains.length),
        `${id}/${refGroup.root}: рукописные поддомены`,
      ).toEqual(refGroup.subdomains);
    });
  }

  it("credit-banks keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("credit-banks", B3_CREDIT_BANKS);
  });

  it("mobile-competitors keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("mobile-competitors", B3_MOBILE_COMPETITORS);
  });

  it("used-car-listings keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("used-car-listings", B3_USED_CAR_LISTINGS);
  });
```

- [ ] **Step 2: Запустить весь файл**

Run: `npm test -- src/data/trigger-domains.test.ts`
Expected: PASS, все тесты зелёные.

- [ ] **Step 3: Коммит**

```bash
git add src/data/trigger-domains.test.ts
git commit -m "test(domains): B3-эталоны проверяют корни и рукописный префикс"
```

---

### Task 5: Починить тест счётчика поддоменов в редакторе

Тест ищет `·N` через `getByText`, который требует единственного совпадения. Раньше у `sberbank.ru` было 3 поддомена, а у остальных групп `credit-banks` — 0, 1 или 2, поэтому `·3` встречался ровно один раз. После добора у всех групп триггера ровно 12, и `·12` рендерится на каждом чипе.

Починка — в тесте, не в данных: запрос сужается до конкретного чипа по `aria-label`.

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/interests-triggers-editor.test.tsx` (тест `renders the muted ·N subdomain counter on a group chip that has subdomains`)

**Interfaces:**
- Consumes: `getTriggerDomains` из Task 3.
- Produces: ничего.

- [ ] **Step 1: Убедиться, что тест падает по описанной причине**

Run: `npm test -- src/sections/campaigns/wizard/steps/interests-triggers-editor.test.tsx`
Expected: FAIL с `Found multiple elements with the text: ·12`.

Если ошибка иная — остановиться и разобраться, прежде чем править.

- [ ] **Step 2: Сузить запрос**

Заменить тело теста `renders the muted ·N subdomain counter on a group chip that has subdomains` на:

```ts
  it("renders the muted ·N subdomain counter on a group chip that has subdomains", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    // После добора поддоменов счётчик `·N` одинаков у всех групп триггера,
    // поэтому getByText находит несколько совпадений. Ищем конкретный чип по
    // его aria-label и проверяем текст уже внутри него.
    const chip = screen.getByRole("button", {
      name: `Поддомены ${firstDomain}`,
    });
    expect(chip).toHaveTextContent(`·${firstDomainGroup.subdomains.length}`);
  });
```

`firstDomain`, `firstDomainGroup`, `firstInterest`, `firstTrigger` уже объявлены в этом файле — новых фикстур не нужно.

- [ ] **Step 3: Запустить файл целиком**

Run: `npm test -- src/sections/campaigns/wizard/steps/interests-triggers-editor.test.tsx`
Expected: PASS, все тесты файла.

Соседний тест тултипа (`clicking a domain-group chip with subdomains opens the tooltip listing them`) уже ищет чип по `aria-label` и от количества поддоменов не зависит — он должен проходить без правок. Если упал — значит тултип рендерит список из 12 строк и что-то в утверждении завязано на длину; править по факту.

- [ ] **Step 4: Прогнать соседнего потребителя**

Run: `npm test -- src/sections/shell/scoring-interests-panel.test.tsx`
Expected: PASS без правок — тест читает `getTriggerDomains(trigger.id)[0].root`, а от количества поддоменов не зависит. Если упал — сузить запрос тем же приёмом.

- [ ] **Step 5: Коммит**

```bash
git add src/sections/campaigns/wizard/steps/interests-triggers-editor.test.tsx
git commit -m "test(domains): счётчик поддоменов ищется по конкретному чипу"
```

---

### Task 6: Полная верификация и базлайны

**Files:**
- Modify: снимки в `tests/` (перегенерация, конкретные файлы зависят от diff-а)

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: зелёный прогон.

- [ ] **Step 1: Полный прогон юнит-тестов**

Run: `npm test`
Expected: PASS целиком. Никаких новых падений в `src/data`, `src/lib`, `src/sections`.

- [ ] **Step 2: Тайпчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Линт**

Run: `npm run lint`
Expected: без новых ошибок.

- [ ] **Step 4: Замерить итог датасета**

Run:
```bash
npx vitest run src/data/trigger-domains.test.ts
```

Затем убедиться глазами, что инвариант «не меньше планки» держится на всех 694 корнях — тест `каждый корень добран до планки своего тира` это и проверяет, его зелёный статус и есть замер.

- [ ] **Step 5: Перегенерировать визуальные базлайны**

Экраны с раскрытой карточкой триггера меняют пиксели: счётчик `·N` вырастает, тултип со списком поддоменов становится длиннее.

**Здесь есть ловушка, которая уже срабатывала.** `playwright.config.ts` жёстко задаёт `baseURL: "http://localhost:3000"` и `reuseExistingServer: !process.env.CI`. Если на 3000 висит dev-сервер ОСНОВНОГО чекаута, playwright молча переиспользует его и снимет базлайны с кода без ваших правок. Порт конфигом не параметризуется, env-переменных он не читает — менять конфиг ради одного прогона не нужно.

Правильный порядок:

```bash
# 1. Убедиться, что порт 3000 свободен — иначе снимется чужая сборка.
lsof -ti:3000 | xargs -r kill

# 2. Запускать ИЗ .worktrees/track-subdomains: playwright сам поднимет
#    `npm run dev` в текущей рабочей директории, то есть в этом worktree.
npm run test:visual:update
```

Перед прогоном проверить, что в `src/app/layout.tsx` нет инжектированного оверлейного `<script>` от инструмента aim — он попадает в снимки и делает базлайны невоспроизводимыми. Если есть — убрать до прогона.

После прогона открыть 2-3 изменившихся снимка и убедиться глазами, что различие — именно выросший счётчик поддоменов, а не посторонняя регрессия.

- [ ] **Step 6: Проверить, что правки не утекли в основной чекаут**

Run:
```bash
git -C /Users/macintosh/Documents/work/afina-ai-first_campaing-centric status --short
```
Expected: только `?? docs/afina-frontend-spec.md`. Любой другой изменённый файл — правка утекла мимо worktree, вернуть её на место до коммита.

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "test(visual): базлайны под добранные поддомены"
```

- [ ] **Step 8: Отчитаться**

Сообщить пользователю путь worktree (`.worktrees/track-subdomains`), имя ветки (`feature/track-subdomains`) и список коммитов. Мерж и удаление worktree — решение пользователя, самостоятельно в `main` не мержить.

---

## Self-Review

**Покрытие спеки:**

| Раздел спеки | Таск |
|---|---|
| §2 Целевая модель (планки 3/7/12) | Task 1 |
| §3 Назначение тиров | Task 1 |
| §4.1 Рукописный слой первым | Task 2 (тест 2), Task 3 (тест «рукописный слой сохранён») |
| §4.2 Пулы префиксов | Task 2 |
| §4.3 Пропорция 55% от добора | Task 2 (тесты 8, 9) |
| §4.4 Детерминированность | Task 2 (тесты 5, 6) |
| §4.5 Корректность результата | Task 2 (тесты 3, 10, 11), Task 3 (тест уникальности) |
| §5.1 Отдельный чистый модуль | Task 1, Task 2 |
| §5.2 Точка применения | Task 3 |
| §5.3 Мемоизация | Task 3 |
| §6 Инварианты 1–4 | Task 3 |
| §6 Инварианты 5–12 | Task 2 |
| §6.1 Переписать B3 | Task 4 |
| §7 Починка теста редактора | Task 5 |
| §8 Риски: базлайны | Task 6 |
| §9 Критерии 1–10 | покрыты выше |

Пробелов нет.

**Проверка типов между тасками:** `DomainTier`, `TIER_QUOTA`, `tierForTrigger` объявлены в Task 1 и используются в Task 2 и Task 3 под теми же именами. `fillSubdomains(root, existing, tier)` объявлена в Task 2 и вызывается в Task 3 с той же сигнатурой. `SERVICE_PREFIXES`/`REGION_PREFIXES` объявлены в Task 2 и используются только в его же тестах. `DomainGroup` — существующий экспорт `trigger-domains.ts`, в Task 4 он уже импортирован в тестовом файле.
