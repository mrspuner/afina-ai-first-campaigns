import type { Vertical, Interest, Trigger } from "@/types/directions";

export const VERTICALS: Vertical[] = [
  {
    id: "finance",
    label: "Финансы и кредиты",
    interests: [
      {
        id: "credit",
        label: "Кредитование",
        verticalId: "finance",
        triggers: [
          { id: "credit-banks", label: "Посещение сайтов банков с предложениями кредитов", shortLabel: "Банки-кредиты" },
          { id: "credit-aggregators", label: "Посещение агрегаторов кредитов и сравнения ставок", shortLabel: "Агрегаторы кредитов" },
          { id: "credit-mfo", label: "Посещение сайтов МФО", shortLabel: "МФО" },
          { id: "credit-brokers", label: "Посещение сайтов кредитных брокеров", shortLabel: "Кредитные брокеры" },
        ],
      },
      {
        id: "bnpl",
        label: "Рассрочка и BNPL",
        verticalId: "finance",
        triggers: [
          { id: "bnpl-services", label: "Посещение сайтов сервисов рассрочки", shortLabel: "Рассрочка" },
          { id: "bnpl-ecommerce", label: "Использование BNPL в e-commerce", shortLabel: "BNPL в e-commerce" },
        ],
      },
      {
        id: "mortgage",
        label: "Ипотека",
        verticalId: "finance",
        triggers: [
          { id: "mortgage-bank-programs", label: "Посещение сайтов ипотечных программ банков", shortLabel: "Ипотека банков" },
          { id: "mortgage-calculators", label: "Посещение ипотечных калькуляторов и агрегаторов", shortLabel: "Ипотечные калькуляторы" },
          { id: "mortgage-developers", label: "Посещение сайтов застройщиков и риелторов", shortLabel: "Застройщики" },
        ],
      },
      {
        id: "investments",
        label: "Инвестиции и накопления",
        verticalId: "finance",
        triggers: [
          { id: "investments-brokers", label: "Посещение сайтов брокеров и инвестплатформ", shortLabel: "Брокеры" },
          { id: "investments-education", label: "Посещение сайтов с обучением инвестированию", shortLabel: "Обучение инвестициям" },
          { id: "investments-deposits", label: "Посещение сайтов банков в разделах вкладов и накоплений", shortLabel: "Вклады" },
        ],
      },
      {
        id: "insurance",
        label: "Страхование",
        verticalId: "finance",
        triggers: [
          { id: "insurance-companies", label: "Посещение сайтов страховых компаний", shortLabel: "Страховые компании" },
          { id: "insurance-aggregators", label: "Посещение агрегаторов страховых продуктов", shortLabel: "Агрегаторы страховок" },
        ],
      },
    ],
  },
  {
    id: "auto",
    label: "Авто",
    interests: [
      {
        id: "buy-new-car",
        label: "Покупка нового авто",
        verticalId: "auto",
        triggers: [
          { id: "new-car-dealers", label: "Посещение сайтов автодилеров", shortLabel: "Автодилеры" },
          { id: "new-car-manufacturers", label: "Посещение официальных сайтов автопроизводителей", shortLabel: "Автопроизводители" },
          { id: "new-car-marketplaces", label: "Посещение крупных автомаркетплейсов с фильтром на новые", shortLabel: "Автомаркетплейсы" },
        ],
      },
      {
        id: "buy-used-car",
        label: "Покупка б/у авто",
        verticalId: "auto",
        triggers: [
          { id: "used-car-listings", label: "Посещение сайтов с объявлениями о продаже авто", shortLabel: "Объявления авто" },
          { id: "used-car-history", label: "Посещение сайтов проверки истории авто", shortLabel: "Проверка истории" },
          { id: "used-car-tradein", label: "Посещение сайтов автосалонов с trade-in", shortLabel: "Trade-in" },
        ],
      },
      {
        id: "auto-credit",
        label: "Автокредит и автолизинг",
        verticalId: "auto",
        triggers: [
          { id: "auto-credit-banks", label: "Посещение сайтов банков в разделах автокредитования", shortLabel: "Автокредиты" },
          { id: "auto-credit-leasing", label: "Посещение сайтов лизинговых компаний", shortLabel: "Автолизинг" },
        ],
      },
      {
        id: "auto-service",
        label: "Сервис и обслуживание",
        verticalId: "auto",
        triggers: [
          { id: "auto-service-shops", label: "Посещение сайтов автосервисов и СТО", shortLabel: "Автосервисы" },
          { id: "auto-service-parts", label: "Посещение сайтов запчастей и магазинов автотоваров", shortLabel: "Запчасти" },
        ],
      },
      {
        id: "osago-kasko",
        label: "ОСАГО и КАСКО",
        verticalId: "auto",
        triggers: [
          { id: "osago-insurers", label: "Посещение сайтов страховых с автостраховыми продуктами", shortLabel: "Автостраховка" },
          { id: "osago-calculators", label: "Посещение калькуляторов и агрегаторов автостраховки", shortLabel: "Калькуляторы ОСАГО" },
        ],
      },
    ],
  },
  {
    id: "telecom",
    label: "Телеком и интернет",
    interests: [
      {
        id: "mobile-operator",
        label: "Смена сотового оператора",
        verticalId: "telecom",
        triggers: [
          { id: "mobile-competitors", label: "Посещение сайтов конкурирующих операторов", shortLabel: "Операторы-конкуренты" },
          { id: "mobile-tariff-compare", label: "Посещение сайтов с тарифами и сравнением операторов", shortLabel: "Сравнение тарифов" },
        ],
      },
      {
        id: "home-internet",
        label: "Домашний интернет и ТВ",
        verticalId: "telecom",
        triggers: [
          { id: "home-isp", label: "Посещение сайтов провайдеров домашнего интернета", shortLabel: "Интернет-провайдеры" },
          { id: "home-isp-reviews", label: "Посещение сайтов с обзорами тарифов и провайдеров", shortLabel: "Обзоры провайдеров" },
        ],
      },
      {
        id: "mobile-devices",
        label: "Мобильные устройства",
        verticalId: "telecom",
        triggers: [
          { id: "phone-manufacturers", label: "Посещение сайтов производителей смартфонов", shortLabel: "Производители смартфонов" },
          { id: "phone-electronics-shops", label: "Посещение сайтов магазинов электроники в разделах мобильной техники", shortLabel: "Магазины электроники" },
        ],
      },
    ],
  },
  {
    id: "real-estate",
    label: "Недвижимость",
    interests: [
      {
        id: "buy-apartment",
        label: "Покупка квартиры",
        verticalId: "real-estate",
        triggers: [
          { id: "apartment-listings", label: "Посещение сайтов с объявлениями о продаже квартир", shortLabel: "Объявления квартир" },
          { id: "apartment-developers", label: "Посещение сайтов застройщиков", shortLabel: "Застройщики" },
          { id: "apartment-agencies", label: "Посещение сайтов агентств недвижимости", shortLabel: "Агентства недвижимости" },
        ],
      },
      {
        id: "rent-apartment",
        label: "Аренда жилья",
        verticalId: "real-estate",
        triggers: [
          { id: "rent-listings", label: "Посещение сайтов аренды жилья", shortLabel: "Аренда жилья" },
          { id: "rent-realtors", label: "Посещение сайтов риелторов с разделами аренды", shortLabel: "Риелторы (аренда)" },
        ],
      },
      {
        id: "country-real-estate",
        label: "Загородная недвижимость",
        verticalId: "real-estate",
        triggers: [
          { id: "country-listings", label: "Посещение сайтов с объявлениями о продаже домов и участков", shortLabel: "Дома и участки" },
          { id: "country-villages", label: "Посещение сайтов коттеджных посёлков", shortLabel: "Коттеджные посёлки" },
        ],
      },
      {
        id: "commercial-real-estate",
        label: "Коммерческая недвижимость",
        verticalId: "real-estate",
        triggers: [
          { id: "commercial-listings", label: "Посещение сайтов с коммерческой арендой и продажей", shortLabel: "Коммерция: аренда" },
          { id: "commercial-brokers", label: "Посещение сайтов брокеров коммерческой недвижимости", shortLabel: "Брокеры коммерции" },
        ],
      },
    ],
  },
  {
    id: "retail",
    label: "Ретейл и e-commerce",
    interests: [
      {
        id: "electronics",
        label: "Покупка электроники",
        verticalId: "retail",
        triggers: [
          { id: "electronics-marketplaces", label: "Посещение крупных маркетплейсов в разделах электроники", shortLabel: "Маркетплейсы электроники" },
          { id: "electronics-brand-stores", label: "Посещение сайтов производителей и брендовых магазинов", shortLabel: "Брендовые магазины" },
        ],
      },
      {
        id: "fashion",
        label: "Покупка одежды и обуви",
        verticalId: "retail",
        triggers: [
          { id: "fashion-marketplaces", label: "Посещение сайтов фэшн-маркетплейсов", shortLabel: "Фэшн-маркетплейсы" },
          { id: "fashion-brand-stores", label: "Посещение сайтов брендовых магазинов одежды", shortLabel: "Магазины одежды" },
        ],
      },
      {
        id: "home-goods",
        label: "Товары для дома и ремонт",
        verticalId: "retail",
        triggers: [
          { id: "home-goods-furniture", label: "Посещение сайтов мебели и DIY", shortLabel: "Мебель и DIY" },
          { id: "home-goods-construction", label: "Посещение сайтов сантехники и стройматериалов", shortLabel: "Стройматериалы" },
        ],
      },
      {
        id: "food-delivery",
        label: "Продукты и доставка еды",
        verticalId: "retail",
        triggers: [
          { id: "food-delivery-services", label: "Посещение сайтов сервисов доставки еды", shortLabel: "Доставка еды" },
          { id: "food-grocery", label: "Посещение сайтов продуктовых ретейлеров", shortLabel: "Продукты" },
        ],
      },
    ],
  },
  {
    id: "education",
    label: "Образование",
    interests: [
      {
        id: "higher-education",
        label: "Высшее образование",
        verticalId: "education",
        triggers: [
          { id: "higher-edu-universities", label: "Посещение сайтов вузов", shortLabel: "Вузы" },
          { id: "higher-edu-aggregators", label: "Посещение агрегаторов вузов и программ", shortLabel: "Агрегаторы вузов" },
        ],
      },
      {
        id: "online-courses",
        label: "Курсы и онлайн-обучение",
        verticalId: "education",
        triggers: [
          { id: "courses-edtech", label: "Посещение сайтов EdTech-платформ", shortLabel: "EdTech-платформы" },
          { id: "courses-professional", label: "Посещение сайтов профессиональных курсов", shortLabel: "Профкурсы" },
        ],
      },
      {
        id: "child-education",
        label: "Детское образование",
        verticalId: "education",
        triggers: [
          { id: "child-edu-centers", label: "Посещение сайтов детских развивающих центров", shortLabel: "Детские центры" },
          { id: "child-edu-tutors", label: "Посещение сайтов школ и репетиторов", shortLabel: "Школы и репетиторы" },
        ],
      },
    ],
  },
  {
    id: "health",
    label: "Медицина и здоровье",
    interests: [
      {
        id: "medical-services",
        label: "Медицинские услуги",
        verticalId: "health",
        triggers: [
          { id: "medical-private-clinics", label: "Посещение сайтов частных клиник", shortLabel: "Частные клиники" },
          { id: "medical-diagnostics", label: "Посещение сайтов диагностических центров и лабораторий", shortLabel: "Диагностика" },
        ],
      },
      {
        id: "pharma",
        label: "Аптеки и фарма",
        verticalId: "health",
        triggers: [
          { id: "pharma-chains", label: "Посещение сайтов аптечных сетей", shortLabel: "Аптечные сети" },
          { id: "pharma-online", label: "Посещение сайтов с покупкой лекарств онлайн", shortLabel: "Аптеки онлайн" },
        ],
      },
      {
        id: "fitness",
        label: "Фитнес и спорт",
        verticalId: "health",
        triggers: [
          { id: "fitness-clubs", label: "Посещение сайтов фитнес-клубов", shortLabel: "Фитнес-клубы" },
          { id: "fitness-equipment", label: "Посещение сайтов спортивных товаров", shortLabel: "Спорттовары" },
        ],
      },
    ],
  },
  {
    id: "b2b",
    label: "B2B и корпоративный сегмент",
    interests: [
      {
        id: "saas",
        label: "Корпоративный софт и SaaS",
        verticalId: "b2b",
        triggers: [
          { id: "saas-platforms", label: "Посещение сайтов SaaS-платформ", shortLabel: "SaaS-платформы" },
          { id: "saas-crm", label: "Посещение сайтов CRM и систем автоматизации", shortLabel: "CRM-системы" },
        ],
      },
      {
        id: "business-finance",
        label: "Бухгалтерия и финансы для бизнеса",
        verticalId: "b2b",
        triggers: [
          { id: "biz-accounting", label: "Посещение сайтов сервисов бухучёта", shortLabel: "Бухучёт" },
          { id: "biz-banks", label: "Посещение сайтов банков в разделах для бизнеса", shortLabel: "Банки для бизнеса" },
        ],
      },
      {
        id: "hr",
        label: "HR и подбор персонала",
        verticalId: "b2b",
        triggers: [
          { id: "hr-job-boards", label: "Посещение сайтов джоб-сайтов и HR-платформ", shortLabel: "Джоб-сайты" },
          { id: "hr-candidate-search", label: "Посещение сайтов с поиском соискателей", shortLabel: "Поиск соискателей" },
        ],
      },
      {
        id: "procurement",
        label: "Закупки и поставщики",
        verticalId: "b2b",
        triggers: [
          { id: "procurement-marketplaces", label: "Посещение b2b-маркетплейсов", shortLabel: "B2B-маркетплейсы" },
          { id: "procurement-suppliers", label: "Посещение сайтов отраслевых поставщиков", shortLabel: "Поставщики" },
        ],
      },
    ],
  },
];

const INTEREST_INDEX: Map<string, Interest> = new Map(
  VERTICALS.flatMap((v) => v.interests.map((i) => [i.id, i] as const))
);

const TRIGGER_INDEX: Map<string, { trigger: Trigger; interest: Interest }> = new Map(
  VERTICALS.flatMap((v) =>
    v.interests.flatMap((i) =>
      i.triggers.map((t) => [t.id, { trigger: t, interest: i }] as const)
    )
  )
);

export function getInterestById(id: string): Interest | undefined {
  return INTEREST_INDEX.get(id);
}

export function getTriggerById(id: string): Trigger | undefined {
  return TRIGGER_INDEX.get(id)?.trigger;
}

export function getInterestForTrigger(triggerId: string): Interest | undefined {
  return TRIGGER_INDEX.get(triggerId)?.interest;
}

/**
 * Короткое имя триггера по его ПОЛНОМУ label. Кампания хранит триггеры именно
 * полными label'ами (см. `Campaign.triggers` — массив строк-названий, не id),
 * поэтому карта строится label → shortLabel, а не по id. Неизвестный label
 * (произвольный триггер, добавленный пользователем; тестовые фикстуры) выдаёт
 * сам себя — тег тогда покажет то, что есть, а не пустоту.
 */
const SHORT_LABEL_BY_LABEL: Map<string, string> = new Map(
  VERTICALS.flatMap((v) =>
    v.interests.flatMap((i) => i.triggers.map((t) => [t.label, t.shortLabel] as const))
  )
);

export function getTriggerShortLabel(label: string): string {
  return SHORT_LABEL_BY_LABEL.get(label) ?? label;
}

export const INTERESTS: Interest[] = VERTICALS.flatMap((v) => v.interests);
