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
 * Moderation status of an own-domain registration. Known trigger-domain
 * roots (from `knownTriggerDomains()`) are auto-approved; anything else
 * starts `pending` until reviewed (Task 7 resolves it via
 * `domain_moderation_resolved`).
 */
export type DomainStatus = "pending" | "approved" | "rejected";

/**
 * A single entry in the account-level domain registry (`ownDomains`) — the
 * SINGLE SOURCE OF TRUTH for a domain's moderation status. Campaigns only
 * ever reference a domain by string; status is looked up here at render
 * time, never duplicated onto the campaign.
 */
export interface RegisteredDomain {
  domain: string;
  status: DomainStatus;
  addedAt: string;
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
  /**
   * Account-level registry of the client's own domains and their moderation
   * status — the single source of truth `Campaign.triggerConfig` reads from
   * at render time (never duplicated there). In-memory/session-durable only.
   */
  ownDomains: RegisteredDomain[];
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
  ownDomains: [],
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
  ownDomains: [],
};
