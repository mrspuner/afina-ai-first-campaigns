/**
 * Детерминированный добор поддоменов третьего уровня к корневым доменам
 * триггеров (спека 2026-07-27-trigger-subdomain-fill-design).
 *
 * Модуль чистый и НЕ импортирует `trigger-domains.ts` — иначе получился бы
 * цикл: данные подключают добор, добор читал бы данные. Всё, что нужно
 * генератору, приходит аргументами.
 */

import { rngFor, seededInt } from "@/state/metrics";

/** Глубина датасета у триггера. Задаётся природой вертикали, не случайно. */
export type DomainTier = "shallow" | "medium" | "deep";

/** Минимум поддоменов НА КАЖДЫЙ корневой домен для каждого тира. Это ПОЛ, не
 *  цель — см. `TIER_SPREAD` ниже: реальное количество тянется случайно (но
 *  детерминированно) выше планки, иначе все корни одного тира несут
 *  одинаковый ·N и карточка триггера читается как сгенерированная. */
export const TIER_QUOTA: Record<DomainTier, number> = {
  shallow: 3,
  medium: 7,
  deep: 12,
};

/**
 * Разброс сверх планки: итоговое количество поддоменов корня — случайное
 * целое из `[0, TIER_SPREAD[tier]]`, добавленное к `TIER_QUOTA[tier]`.
 * Итоговый диапазон на корень: shallow 3–5, medium 7–11, deep 12–18.
 */
export const TIER_SPREAD: Record<DomainTier, number> = {
  shallow: 2,
  medium: 4,
  deep: 6,
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
export const SERVICE_SHARE = 0.55;

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
 * Дописывает поддомены третьего уровня до случайно (но детерминированно)
 * отрисованного количества — планка тира — это ПОЛ, а не цель.
 *
 * Рукописный слой неприкосновенен: `existing` всегда возвращается целиком, в
 * исходном порядке и первым. Без этого добор затёр бы настоящие поддомены
 * Сбера, МТС и auto.ru генерическими префиксами — то есть испортил бы лучшую
 * часть датасета. Группа, чьих рукописных уже не меньше отрисованного
 * количества, не меняется вовсе и не сжимается, если рукописных больше.
 *
 * Детерминизм — по сиду КОРНЯ, без идентификатора триггера: один и тот же
 * домен (`sberbank.ru` живёт сразу в трёх триггерах) получает согласованный
 * набор префиксов везде, где встречается. Фильтр применяется после перестановки,
 * поэтому выборка в каждом пуле остаётся префиксом одной перестановки —
 * два вызова одного корня дают вложенные наборы, без противоречий.
 */
export function fillSubdomains(
  root: string,
  existing: readonly string[],
  tier: DomainTier,
): string[] {
  const quota = TIER_QUOTA[tier];
  const spread = TIER_SPREAD[tier];

  // Один поток ГПСЧ на выбор итогового количества и обе перестановки —
  // воспроизводимо и не требует нескольких сидов. Первое число потока даёт
  // добавку сверх планки: [0, spread]. Она зависит только от (root, tier),
  // не от `existing` — поэтому один и тот же корень тянет одно и то же
  // итоговое количество независимо от того, сколько уже написано руками.
  const rng = rngFor("subdomain-fill", root);
  const target = quota + seededInt(rng, 0, spread);

  const need = target - existing.length;
  if (need <= 0) return [...existing];

  // Префиксы, уже занятые рукописным слоем — повторно не используем.
  const taken = new Set<string>();
  for (const sub of existing) {
    const p = prefixOf(sub, root);
    if (p !== null) taken.add(p);
  }

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
