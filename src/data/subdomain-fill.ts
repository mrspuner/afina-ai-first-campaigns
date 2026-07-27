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
