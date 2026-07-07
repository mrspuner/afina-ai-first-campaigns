import type { TriggerId } from "@/types/directions";

/**
 * Дефолтный набор доменов, входящих в каждый триггер. Раскрывается в карточке
 * триггера на step-2 (см. docs/triggers-ai-edit-ux.md). Это «магия Afina» —
 * пользователь может просмотреть, какие сайты считаются сигналом интента.
 */
export const TRIGGER_DOMAINS: Record<TriggerId, string[]> = {
  // Финансы — кредиты
  "credit-banks": ["sberbank.ru", "vtb.ru", "alfabank.ru", "gazprombank.ru", "tinkoff.ru"],
  "credit-aggregators": ["banki.ru", "sravni.ru", "vbr.ru", "brobank.ru"],
  "credit-mfo": ["credit365.ru", "ezaem.ru", "webbankir.ru", "dobrozaim.ru"],
  "credit-brokers": ["kreditprosto.ru", "mosbroker.ru", "financialbroker.ru"],

  // Финансы — рассрочка
  "bnpl-services": ["dolyame.ru", "podeli.ru", "splitka.io"],
  "bnpl-ecommerce": ["ozon.ru/dolyame", "wildberries.ru/split", "mvideo.ru/credit"],

  // Финансы — ипотека
  "mortgage-bank-programs": ["sberbank.ru/ipoteka", "vtb.ru/ipoteka", "gazprombank.ru/ipoteka", "raiffeisen.ru/ipoteka"],
  "mortgage-calculators": ["domclick.ru", "ipoteka.banki.ru", "sravni.ru/ipoteka"],
  "mortgage-developers": ["pik.ru", "lsr.ru", "samolet.ru", "etalon.ru", "dom.rf"],

  // Финансы — инвестиции
  "investments-brokers": ["tinkoff.ru/invest", "sber.ru/invest", "finam.ru", "bcs.ru"],
  "investments-education": ["skillbox.ru/invest", "finam.ru/learn", "bcs-academy.ru"],
  "investments-deposits": ["sberbank.ru/vklady", "vtb.ru/personal/vklady", "alfabank.ru/make-money"],

  // Финансы — страхование
  "insurance-companies": ["alfastrah.ru", "ingos.ru", "rgs.ru", "sogaz.ru", "reso.ru"],
  "insurance-aggregators": ["sravni.ru/strahovanie", "banki.ru/insurance", "calcus.ru"],

  // Авто — новые
  "new-car-dealers": ["rolf.ru", "avilon.ru", "autoworld.ru", "inchcape.ru", "maxmotors.ru"],
  "new-car-manufacturers": ["lada.ru", "gaz.ru", "uaz.ru", "haval.ru", "chery.ru"],
  "new-car-marketplaces": ["auto.ru/cars/new", "drom.ru/new", "am.ru"],

  // Авто — б/у
  "used-car-listings": ["auto.ru", "drom.ru", "avito.ru/avto", "youla.ru/avto"],
  "used-car-history": ["avtokod.ru", "autoteka.ru", "avtocod.ru"],
  "used-car-tradein": ["maxposter.ru", "rolf-tradein.ru", "autorussia.ru"],

  // Авто — финансы
  "auto-credit-banks": ["vtb.ru/avtokredit", "sberbank.ru/autocredit", "gazprombank.ru/avto"],
  "auto-credit-leasing": ["europlan.ru", "baltic-lease.com", "sberleasing.ru"],

  // Авто — сервис
  "auto-service-shops": ["avtoservice24.ru", "autopilot-spb.ru", "fit-service.com"],
  "auto-service-parts": ["emex.ru", "exist.ru", "autodoc.ru", "avtoto.ru"],

  // Авто — страхование
  "osago-insurers": ["alfastrah.ru/osago", "ingos.ru/osago", "sogaz.ru/osago", "reso.ru/osago"],
  "osago-calculators": ["calcus.ru", "sravni.ru/osago", "banki.ru/osago"],

  // Телеком — мобильная связь
  "mobile-competitors": ["mts.ru", "megafon.ru", "beeline.ru", "tele2.ru", "yota.ru"],
  "mobile-tariff-compare": ["tarifkin.ru", "sotovik.ru", "sravni.ru/svyaz"],

  // Телеком — домашний интернет
  "home-isp": ["rostelecom.ru", "mts.ru/internet", "beeline.ru/internet", "dom.ru"],
  "home-isp-reviews": ["provider.ru", "telecombook.ru", "internet-pravda.ru"],

  // Телеком — устройства
  "phone-manufacturers": ["samsung.ru", "apple.com/ru", "xiaomi.ru", "honor.ru"],
  "phone-electronics-shops": ["mvideo.ru", "eldorado.ru", "dns-shop.ru", "citilink.ru"],

  // Недвижимость — квартиры
  "apartment-listings": ["cian.ru", "avito.ru/nedvizhimost", "n1.ru", "domclick.ru"],
  "apartment-developers": ["pik.ru", "samolet.ru", "lsr.ru", "etalon.ru", "a101.ru"],
  "apartment-agencies": ["inkom.ru", "miel.ru", "etagi.com"],

  // Недвижимость — аренда
  "rent-listings": ["cian.ru/arenda", "domofond.ru", "the-locals.ru"],
  "rent-realtors": ["miel.ru/arenda", "etagi.com/arenda", "inkom.ru/arenda"],

  // Недвижимость — загородная
  "country-listings": ["cian.ru/zagorod", "n1.ru/dom", "domofond.ru/dom"],
  "country-villages": ["poselkivse.ru", "kp.ru/dom", "vsenovostroyki.ru/zagorod"],

  // Недвижимость — коммерческая
  "commercial-listings": ["cian.ru/kommercheskaya", "officemarket.ru", "biz-cen.ru"],
  "commercial-brokers": ["knightfrank.ru", "jll.ru", "cushwakerus.com"],

  // Электроника
  "electronics-marketplaces": ["ozon.ru/electronics", "wildberries.ru/electronics", "market.yandex.ru"],
  "electronics-brand-stores": ["samsung.ru/shop", "lg.com/ru", "sony.ru", "philips.ru"],

  // Фэшн
  "fashion-marketplaces": ["lamoda.ru", "wildberries.ru/fashion", "ozon.ru/fashion"],
  "fashion-brand-stores": ["zara.com/ru", "hm.com/ru", "uniqlo.com/ru", "ostin.com"],

  // Дом
  "home-goods-furniture": ["hoff.ru", "leroymerlin.ru", "mebelshara.ru", "askona.ru"],
  "home-goods-construction": ["petrovich.ru", "leroymerlin.ru", "vseinstrumenti.ru", "obi.ru"],

  // Еда
  "food-delivery-services": ["deliveryclub.ru", "eda.yandex.ru", "samokat.ru", "yandex.ru/lavka"],
  "food-grocery": ["vkusvill.ru", "perekrestok.ru", "magnit.ru", "lenta.com"],

  // Образование — высшее
  "higher-edu-universities": ["msu.ru", "hse.ru", "mipt.ru", "spbu.ru", "urfu.ru"],
  "higher-edu-aggregators": ["vuzopedia.ru", "ucheba.ru", "postupi.online"],

  // Образование — курсы
  "courses-edtech": ["skillbox.ru", "geekbrains.ru", "netology.ru", "skillfactory.ru"],
  "courses-professional": ["skillbox.ru/pro", "eduson.tv", "hh.ru/career"],

  // Образование — детское
  "child-edu-centers": ["kidburg.ru", "smartkids.ru", "lego-edu.ru"],
  "child-edu-tutors": ["repetit.ru", "profi.ru", "tutoronline.ru"],

  // Медицина — клиники
  "medical-private-clinics": ["medsi.ru", "smclinic.ru", "emcmos.ru", "k31.ru"],
  "medical-diagnostics": ["invitro.ru", "gemotest.ru", "helix.ru", "kdl.ru"],

  // Медицина — фарма
  "pharma-chains": ["apteka.ru", "eapteka.ru", "asna.ru", "rigla.ru"],
  "pharma-online": ["apteka-april.ru", "samson-pharma.ru", "ozerki.ru"],

  // Здоровье — спорт
  "fitness-clubs": ["worldclass.ru", "fitfit.ru", "alexfitness.ru", "xfit.ru"],
  "fitness-equipment": ["sportmaster.ru", "decathlon.ru", "intersport.ru"],

  // B2B — SaaS
  "saas-platforms": ["amocrm.ru", "bitrix24.ru", "ispring.ru"],
  "saas-crm": ["bitrix24.ru", "amocrm.ru", "megaplan.ru", "retailcrm.ru"],

  // B2B — услуги
  "biz-accounting": ["1c.ru", "kontur.ru", "moedelo.org"],
  "biz-banks": ["tinkoff.ru/business", "sberbank.ru/sberbusiness", "alfabank.ru/sme"],

  // B2B — HR
  "hr-job-boards": ["hh.ru", "superjob.ru", "rabota.ru", "avito.ru/rabota"],
  "hr-candidate-search": ["hh.ru/employer", "superjob.ru/clients", "professionali.ru"],

  // B2B — закупки
  "procurement-marketplaces": ["zakupki.gov.ru", "b2b-center.ru", "rts-tender.ru"],
  "procurement-suppliers": ["tiu.ru", "all.biz", "supl.biz"],
};

const FALLBACK_DOMAINS: string[] = [
  "site1.ru",
  "site2.ru",
  "site3.ru",
  "site4.ru",
];

export function getTriggerDomains(triggerId: TriggerId): string[] {
  return TRIGGER_DOMAINS[triggerId] ?? FALLBACK_DOMAINS;
}

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
