import type { TriggerId } from "@/types/directions";
import { fillSubdomains, tierForTrigger } from "./subdomain-fill";

/**
 * Группа доменов: корневой домен + его поддомены (напр. `sberbank.ru` +
 * `online.sberbank.ru`). View-логика (splitSystemDomains/previewDomains в
 * trigger-domain-view.ts) работает по группам, а не по плоскому списку
 * строк — сравнение/партиционирование идёт по `root`, поддомены следуют
 * за своей группой.
 */
export interface DomainGroup {
  root: string;
  subdomains: string[];
}

const g = (root: string, ...subdomains: string[]): DomainGroup => ({ root, subdomains });

/**
 * Дефолтный набор доменов, входящих в каждый триггер. Раскрывается в карточке
 * триггера на step-2 (см. docs/triggers-ai-edit-ux.md). Это «магия Afina» —
 * пользователь может просмотреть, какие сайты считаются сигналом интента.
 * Каждый триггер — не менее 10 корневых доменов (root); часть доменов —
 * реальные бренды рынка РФ, часть — правдоподобные прототипные моки.
 */
export const TRIGGER_DOMAINS: Record<TriggerId, DomainGroup[]> = {
  // Финансы — кредиты
  "credit-banks": [
    g("sberbank.ru", "online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"),
    g("vtb.ru", "online.vtb.ru", "kredit.vtb.ru"),
    g("alfabank.ru", "online.alfabank.ru", "credit.alfabank.ru"),
    g("gazprombank.ru"),
    g("tinkoff.ru", "credit.tinkoff.ru", "id.tinkoff.ru"),
    g("raiffeisen.ru"),
    g("otkritie.ru"),
    g("rshb.ru"),
    g("sovcombank.ru", "halva.sovcombank.ru"),
    g("pochtabank.ru"),
    g("mkb.ru"),
    g("uralsib.ru"),
  ],
  "credit-aggregators": [
    g("banki.ru"), g("sravni.ru"), g("vbr.ru"), g("brobank.ru"), g("bankiros.ru"),
    g("calcus.ru"), g("finuslugi.ru"), g("credit.club"), g("kredituy.ru"), g("vsevklady.ru"),
  ],
  "credit-mfo": [
    g("credit365.ru"), g("ezaem.ru"), g("webbankir.ru"), g("dobrozaim.ru"), g("zaymer.ru"),
    g("moneyman.ru"), g("turbozaim.ru"), g("viva-dengi.ru"), g("ekapusta.ru"), g("migcredit.ru"),
  ],
  "credit-brokers": [
    g("kreditprosto.ru"), g("mosbroker.ru"), g("financialbroker.ru"), g("creditbroker24.ru"),
    g("ipotek-broker.ru"), g("finbroker.pro"), g("kreditline.ru"), g("zaymopomosh.ru"),
    g("brokercredit.ru"), g("credit-consult.ru"),
  ],

  // Финансы — рассрочка
  "bnpl-services": [
    g("dolyame.ru"), g("podeli.ru"), g("splitka.io"), g("longpay.ru"), g("plati4.ru"),
    g("paylate.ru"), g("rassrochka.ru"), g("chasty.ru"), g("4slice.ru"), g("credit4me.ru"),
  ],
  "bnpl-ecommerce": [
    g("ozon.ru", "dolyame.ozon.ru"),
    g("wildberries.ru", "split.wildberries.ru"),
    g("mvideo.ru", "credit.mvideo.ru"),
    g("yandex.ru", "market.yandex.ru"),
    g("citilink.ru", "installment.citilink.ru"),
    g("eldorado.ru", "credit.eldorado.ru"),
    g("dns-shop.ru", "rassrochka.dns-shop.ru"),
    g("lamoda.ru", "split.lamoda.ru"),
    g("megamarket.ru"),
    g("aliexpress.ru"),
  ],

  // Финансы — ипотека
  "mortgage-bank-programs": [
    g("sberbank.ru", "ipoteka.sberbank.ru"),
    g("vtb.ru", "ipoteka.vtb.ru"),
    g("gazprombank.ru", "ipoteka.gazprombank.ru"),
    g("raiffeisen.ru", "ipoteka.raiffeisen.ru"),
    g("alfabank.ru", "ipoteka.alfabank.ru"),
    g("rshb.ru", "ipoteka.rshb.ru"),
    g("sovcombank.ru", "ipoteka.sovcombank.ru"),
    g("otkritie.ru", "ipoteka.otkritie.ru"),
    g("dom.rf"),
    g("psbank.ru", "ipoteka.psbank.ru"),
  ],
  "mortgage-calculators": [
    g("domclick.ru"),
    g("banki.ru", "ipoteka.banki.ru"),
    g("sravni.ru", "ipoteka.sravni.ru"),
    g("dom.rf", "calculator.dom.rf"),
    g("vbr.ru", "ipoteka.vbr.ru"),
    g("cian.ru", "ipoteka.cian.ru"),
    g("bankiros.ru", "ipoteka.bankiros.ru"),
    g("calcus.ru"),
    g("brobank.ru", "ipoteka.brobank.ru"),
    g("finuslugi.ru"),
  ],
  "mortgage-developers": [
    g("pik.ru"), g("lsr.ru"), g("samolet.ru"), g("etalon.ru"), g("dom.rf"),
    g("a101.ru"), g("setlgroup.ru"), g("glorax.ru"), g("brusnika.ru"), g("ingrad.ru"),
  ],

  // Финансы — инвестиции
  "investments-brokers": [
    g("tinkoff.ru", "invest.tinkoff.ru"),
    g("sber.ru", "invest.sber.ru"),
    g("finam.ru"),
    g("bcs.ru"),
    g("alfabank.ru", "invest.alfabank.ru"),
    g("vtb.ru", "invest.vtb.ru"),
    g("gazprombank.ru", "invest.gazprombank.ru"),
    g("otkritie.ru", "invest.otkritie.ru"),
    g("psbank.ru", "invest.psbank.ru"),
    g("freedom24.ru"),
  ],
  "investments-education": [
    g("skillbox.ru", "invest.skillbox.ru"),
    g("finam.ru", "learn.finam.ru"),
    g("bcs-academy.ru"),
    g("netology.ru", "invest.netology.ru"),
    g("moex.com"),
    g("tinkoff.ru", "journal.tinkoff.ru"),
    g("banki.ru", "investicii.banki.ru"),
    g("sravni.ru", "investicii.sravni.ru"),
    g("investfuture.ru"),
    g("fin-plus.ru"),
  ],
  "investments-deposits": [
    g("sberbank.ru", "vklady.sberbank.ru"),
    g("vtb.ru", "vklady.vtb.ru"),
    g("alfabank.ru", "vklady.alfabank.ru"),
    g("gazprombank.ru", "vklady.gazprombank.ru"),
    g("rshb.ru", "vklady.rshb.ru"),
    g("sovcombank.ru", "vklady.sovcombank.ru"),
    g("otkritie.ru", "vklady.otkritie.ru"),
    g("pochtabank.ru", "vklady.pochtabank.ru"),
    g("mkb.ru", "vklady.mkb.ru"),
    g("rosbank.ru", "vklady.rosbank.ru"),
  ],

  // Финансы — страхование
  "insurance-companies": [
    g("alfastrah.ru"), g("ingos.ru"), g("rgs.ru"), g("sogaz.ru"), g("reso.ru"),
    g("vsk.ru"), g("renins.ru"), g("zetta.ru"), g("absolutins.ru"), g("energogarant.ru"),
  ],
  "insurance-aggregators": [
    g("sravni.ru", "strahovanie.sravni.ru"),
    g("banki.ru", "insurance.banki.ru"),
    g("calcus.ru"),
    g("polis.online"),
    g("vbr.ru", "strahovanie.vbr.ru"),
    g("finuslugi.ru"),
    g("strahovka.ru"),
    g("insapp.ru"),
    g("napolis.ru"),
    g("strahovanieonline.ru"),
  ],

  // Авто — новые
  "new-car-dealers": [
    g("rolf.ru"), g("avilon.ru"), g("autoworld.ru"), g("inchcape.ru"), g("maxmotors.ru"),
    g("major-auto.ru"), g("genser.ru"), g("tts.ru"), g("avtomir.ru"), g("autospeccentr.ru"),
  ],
  "new-car-manufacturers": [
    g("lada.ru"), g("gaz.ru"), g("uaz.ru"), g("haval.ru"), g("chery.ru"),
    g("geely.ru"), g("changan.ru"), g("omoda.ru"), g("exeed.ru"), g("moskvich.ru"),
  ],
  "new-car-marketplaces": [
    g("auto.ru", "new.auto.ru"),
    g("drom.ru", "new.drom.ru"),
    g("am.ru"),
    g("avito.ru", "new.avito.ru"),
    g("cars.ru"),
    g("farpost.ru"),
    g("youla.ru"),
    g("irr.ru"),
    g("avtoplus.ru"),
    g("carmarket.ru"),
  ],

  // Авто — б/у
  "used-car-listings": [
    g("auto.ru", "msk.auto.ru", "spb.auto.ru"),
    g("drom.ru", "moscow.drom.ru", "baza.drom.ru"),
    g("avito.ru", "avto.avito.ru"),
    g("youla.ru", "auto.youla.ru"),
    g("am.ru"),
    g("carsguru.ru"),
    g("bibinet.ru"),
    g("avtomarket.ru"),
    g("cars.ru"),
    g("quto.ru"),
    g("kolesa.ru"),
  ],
  "used-car-history": [
    g("avtokod.ru"), g("autoteka.ru"), g("avtocod.ru"), g("avtoved.ru"), g("reginfo.ru"),
    g("gibdd.ru"), g("nomerogram.ru"), g("avto-nomer.ru"), g("vin-info.ru"), g("carvertical.ru"),
  ],
  "used-car-tradein": [
    g("maxposter.ru"),
    g("rolf-tradein.ru"),
    g("autorussia.ru"),
    g("avilon.ru", "tradein.avilon.ru"),
    g("major-auto.ru", "tradein.major-auto.ru"),
    g("avtomir.ru", "tradein.avtomir.ru"),
    g("genser.ru", "tradein.genser.ru"),
    g("autospeccentr.ru", "tradein.autospeccentr.ru"),
    g("sberauto.com", "tradein.sberauto.com"),
    g("tts.ru", "tradein.tts.ru"),
  ],

  // Авто — финансы
  "auto-credit-banks": [
    g("vtb.ru", "avtokredit.vtb.ru"),
    g("sberbank.ru", "autocredit.sberbank.ru"),
    g("gazprombank.ru", "avto.gazprombank.ru"),
    g("alfabank.ru", "avtokredit.alfabank.ru"),
    g("rshb.ru", "avtokredit.rshb.ru"),
    g("sovcombank.ru", "avtokredit.sovcombank.ru"),
    g("otkritie.ru", "avtokredit.otkritie.ru"),
    g("rosbank.ru", "avtokredit.rosbank.ru"),
    g("uralsib.ru", "avtokredit.uralsib.ru"),
    g("tinkoff.ru", "avtokredit.tinkoff.ru"),
  ],
  "auto-credit-leasing": [
    g("europlan.ru"), g("baltic-lease.com"), g("sberleasing.ru"), g("vtb-leasing.ru"),
    g("alfaleasing.ru"), g("raiffeisen-leasing.ru"), g("carcade.com"), g("interleasing.ru"),
    g("gpblease.ru"), g("regionleasing.ru"),
  ],

  // Авто — сервис
  "auto-service-shops": [
    g("avtoservice24.ru"), g("autopilot-spb.ru"), g("fit-service.com"), g("bosch-service.ru"),
    g("fitauto.ru"), g("garant-service.ru"), g("avtoritet-service.ru"), g("technoservice.ru"),
    g("avtoban-service.ru"), g("mikado-motors.ru"),
  ],
  "auto-service-parts": [
    g("emex.ru"), g("exist.ru"), g("autodoc.ru"), g("avtoto.ru"), g("zzap.ru"),
    g("autopiter.ru"), g("amayama.com"), g("shate-m.ru"), g("berg.ru"), g("armtek.ru"),
  ],

  // Авто — страхование
  "osago-insurers": [
    g("alfastrah.ru", "osago.alfastrah.ru"),
    g("ingos.ru", "osago.ingos.ru"),
    g("sogaz.ru", "osago.sogaz.ru"),
    g("reso.ru", "osago.reso.ru"),
    g("rgs.ru", "osago.rgs.ru"),
    g("vsk.ru", "osago.vsk.ru"),
    g("renins.ru", "osago.renins.ru"),
    g("zetta.ru", "osago.zetta.ru"),
    g("sberbank.ru", "osago.sberbank.ru"),
    g("tinkoff.ru", "osago.tinkoff.ru"),
  ],
  "osago-calculators": [
    g("calcus.ru"),
    g("sravni.ru", "osago.sravni.ru"),
    g("banki.ru", "osago.banki.ru"),
    g("vbr.ru", "osago.vbr.ru"),
    g("polis.online", "osago.polis.online"),
    g("finuslugi.ru", "osago.finuslugi.ru"),
    g("e-osago.ru"),
    g("rsa.ru"),
    g("osago-calc.ru"),
    g("strahovka.ru", "osago.strahovka.ru"),
  ],

  // Телеком — мобильная связь
  "mobile-competitors": [
    g("mts.ru", "login.mts.ru", "shop.mts.ru"),
    g("megafon.ru", "lk.megafon.ru", "shop.megafon.ru"),
    g("beeline.ru", "my.beeline.ru", "shop.beeline.ru"),
    g("tele2.ru", "msk.tele2.ru", "spb.tele2.ru"),
    g("yota.ru"),
    g("rostelecom.ru", "lk.rostelecom.ru"),
    g("sbermobile.ru"),
    g("tinkoff-mobile.ru"),
    g("motiv.ru"),
    g("danycom.ru"),
    g("gazprombank-mobile.ru"),
  ],
  "mobile-tariff-compare": [
    g("tarifkin.ru"),
    g("sotovik.ru"),
    g("sravni.ru", "svyaz.sravni.ru"),
    g("tarify.ru"), g("vsem-tarifam.ru"), g("1sim.ru"), g("tarifon.ru"),
    g("mob-tarif.ru"), g("svyaznoy.ru"), g("telecombook.ru"),
  ],

  // Телеком — домашний интернет
  "home-isp": [
    g("rostelecom.ru"),
    g("mts.ru", "internet.mts.ru"),
    g("beeline.ru", "internet.beeline.ru"),
    g("dom.ru"),
    g("megafon.ru", "internet.megafon.ru"),
    g("ttk.ru"), g("netbynet.ru"), g("2com.ru"), g("obit.ru"), g("convex.ru"),
  ],
  "home-isp-reviews": [
    g("provider.ru"), g("telecombook.ru"), g("internet-pravda.ru"), g("nag.ru"),
    g("isp-review.ru"), g("providers-rating.ru"), g("telecomdaily.ru"), g("comnews.ru"),
    g("cableman.ru"), g("ixbt.com"),
  ],

  // Телеком — устройства
  "phone-manufacturers": [
    g("samsung.ru"),
    g("apple.com", "ru.apple.com"),
    g("xiaomi.ru"), g("honor.ru"), g("huawei.ru"), g("oppo.com"), g("realme.com"),
    g("vivo.com"), g("tecno.com"), g("nokia.com"),
  ],
  "phone-electronics-shops": [
    g("mvideo.ru"), g("eldorado.ru"), g("dns-shop.ru"), g("citilink.ru"), g("svyaznoy.ru"),
    g("mts.ru", "shop.mts.ru"),
    g("beeline.ru", "shop.beeline.ru"),
    g("re-store.ru"),
    g("samsung.ru", "shop.samsung.ru"),
    g("technopark.ru"),
  ],

  // Недвижимость — квартиры
  "apartment-listings": [
    g("cian.ru"),
    g("avito.ru", "nedvizhimost.avito.ru"),
    g("n1.ru"),
    g("domclick.ru"),
    g("yandex.ru", "realty.yandex.ru"),
    g("etagi.com"), g("restate.ru"), g("novostroy-m.ru"), g("mirkvartir.ru"), g("domofond.ru"),
  ],
  "apartment-developers": [
    g("pik.ru"), g("samolet.ru"), g("lsr.ru"), g("etalon.ru"), g("a101.ru"),
    g("setlgroup.ru"), g("glorax.ru"), g("brusnika.ru"), g("ingrad.ru"), g("level.ru"),
  ],
  "apartment-agencies": [
    g("inkom.ru"), g("miel.ru"), g("etagi.com"), g("azbuka-zhilya.ru"), g("est-a-tet.ru"),
    g("kalinka-realty.ru"), g("penny-lane.ru"), g("bon-ton.ru"), g("mira-realty.ru"), g("restate.ru"),
  ],

  // Недвижимость — аренда
  "rent-listings": [
    g("cian.ru", "arenda.cian.ru"),
    g("domofond.ru"),
    g("the-locals.ru"),
    g("avito.ru", "arenda.avito.ru"),
    g("yandex.ru", "arenda.yandex.ru"),
    g("n1.ru", "arenda.n1.ru"),
    g("restate.ru", "arenda.restate.ru"),
    g("sutochno.ru"), g("ostrovok.ru"),
    g("mirkvartir.ru", "arenda.mirkvartir.ru"),
  ],
  "rent-realtors": [
    g("miel.ru", "arenda.miel.ru"),
    g("etagi.com", "arenda.etagi.com"),
    g("inkom.ru", "arenda.inkom.ru"),
    g("azbuka-zhilya.ru", "arenda.azbuka-zhilya.ru"),
    g("est-a-tet.ru", "arenda.est-a-tet.ru"),
    g("penny-lane.ru", "arenda.penny-lane.ru"),
    g("kalinka-realty.ru", "arenda.kalinka-realty.ru"),
    g("bon-ton.ru", "arenda.bon-ton.ru"),
    g("restate.ru", "arenda.restate.ru"),
    g("mira-realty.ru", "arenda.mira-realty.ru"),
  ],

  // Недвижимость — загородная
  "country-listings": [
    g("cian.ru", "zagorod.cian.ru"),
    g("n1.ru", "dom.n1.ru"),
    g("domofond.ru", "dom.domofond.ru"),
    g("avito.ru", "zagorod.avito.ru"),
    g("yandex.ru", "zagorod.yandex.ru"),
    g("restate.ru", "zagorod.restate.ru"),
    g("mirkvartir.ru", "zagorod.mirkvartir.ru"),
    g("zagorod.ru"), g("domsad.ru"), g("poselkivse.ru"),
  ],
  "country-villages": [
    g("poselkivse.ru"),
    g("kp.ru", "dom.kp.ru"),
    g("vsenovostroyki.ru", "zagorod.vsenovostroyki.ru"),
    g("dnp-vibor.ru"), g("poselok-info.ru"), g("zagorodny.ru"), g("kottedj.ru"),
    g("nasp.ru"), g("zagorodnaya-life.ru"), g("domzagorodom.ru"),
  ],

  // Недвижимость — коммерческая
  "commercial-listings": [
    g("cian.ru", "kommercheskaya.cian.ru"),
    g("officemarket.ru"),
    g("biz-cen.ru"),
    g("avito.ru", "kommercheskaya.avito.ru"),
    g("n1.ru", "kommercheskaya.n1.ru"),
    g("restate.ru", "kommercheskaya.restate.ru"),
    g("arendator.ru"), g("cre.ru"), g("irn.ru"), g("commercialrealty.ru"),
  ],
  "commercial-brokers": [
    g("knightfrank.ru"), g("jll.ru"), g("cushwakerus.com"), g("colliers.ru"), g("cbre.ru"),
    g("nf-group.ru"), g("ricci.ru"), g("praedium.ru"), g("maris.ru"), g("arendator.ru"),
  ],

  // Электроника
  "electronics-marketplaces": [
    g("ozon.ru", "electronics.ozon.ru"),
    g("wildberries.ru", "electronics.wildberries.ru"),
    g("yandex.ru", "market.yandex.ru"),
    g("aliexpress.ru"), g("megamarket.ru"),
    g("avito.ru", "electronics.avito.ru"),
    g("technopark.ru"), g("citilink.ru"), g("dns-shop.ru"), g("mvideo.ru"),
  ],
  "electronics-brand-stores": [
    g("samsung.ru", "shop.samsung.ru"),
    g("lg.com", "ru.lg.com"),
    g("sony.ru"), g("philips.ru"),
    g("apple.com", "ru.apple.com"),
    g("xiaomi.ru"), g("huawei.ru"), g("bosch-home.ru"), g("panasonic.ru"), g("haier.com"),
  ],

  // Фэшн
  "fashion-marketplaces": [
    g("lamoda.ru"),
    g("wildberries.ru", "fashion.wildberries.ru"),
    g("ozon.ru", "fashion.ozon.ru"),
    g("kupivip.ru"), g("aliexpress.ru"), g("sela.ru"), g("gloria-jeans.ru"),
    g("butik.ru"), g("westfalika.ru"), g("modaris.ru"),
  ],
  "fashion-brand-stores": [
    g("zara.com", "ru.zara.com"),
    g("hm.com", "ru.hm.com"),
    g("uniqlo.com", "ru.uniqlo.com"),
    g("ostin.com"), g("befree.ru"), g("zarina.ru"), g("love-republic.ru"), g("incity.ru"),
    g("finn-flare.ru"),
    g("mango.com", "ru.mango.com"),
  ],

  // Дом
  "home-goods-furniture": [
    g("hoff.ru"), g("leroymerlin.ru"), g("mebelshara.ru"), g("askona.ru"), g("divan.ru"),
    g("mnogomebeli.ru"), g("shatura.ru"), g("stolplit.ru"), g("sofa.ru"), g("mebel-store.ru"),
  ],
  "home-goods-construction": [
    g("petrovich.ru"), g("leroymerlin.ru"), g("vseinstrumenti.ru"), g("obi.ru"), g("baucenter.ru"),
    g("maxidom.ru"), g("castorama.ru"), g("stroylandiya.ru"), g("220-volt.ru"), g("vsem-remont.ru"),
  ],

  // Еда
  "food-delivery-services": [
    g("deliveryclub.ru"),
    g("yandex.ru", "eda.yandex.ru", "lavka.yandex.ru"),
    g("samokat.ru"), g("sbermarket.ru"), g("kuper.ru"), g("vkusvill.ru"),
    g("ozon.ru", "fresh.ozon.ru"),
    g("shefmarket.ru"), g("elementaree.ru"), g("grow-food.ru"),
  ],
  "food-grocery": [
    g("vkusvill.ru"), g("perekrestok.ru"), g("magnit.ru"), g("lenta.com"), g("auchan.ru"),
    g("okmarket.ru"), g("metro-cc.ru"), g("dixy.ru"), g("pyaterochka.ru"), g("azbukavkusa.ru"),
  ],

  // Образование — высшее
  "higher-edu-universities": [
    g("msu.ru"), g("hse.ru"), g("mipt.ru"), g("spbu.ru"), g("urfu.ru"),
    g("mgimo.ru"), g("rea.ru"), g("bmstu.ru"), g("itmo.ru"), g("kfu.ru"),
  ],
  "higher-edu-aggregators": [
    g("vuzopedia.ru"), g("ucheba.ru"), g("postupi.online"), g("edunews.ru"), g("abitura.com"),
    g("examer.ru"), g("vuzoteka.ru"), g("moeobrazovanie.ru"), g("5ege.ru"), g("vuzuslugi.ru"),
  ],

  // Образование — курсы
  "courses-edtech": [
    g("skillbox.ru"), g("geekbrains.ru"), g("netology.ru"), g("skillfactory.ru"),
    g("yandex.ru", "practicum.yandex.ru"),
    g("otus.ru"), g("synergy.ru"), g("stepik.org"), g("hexlet.io"), g("loftschool.com"),
  ],
  "courses-professional": [
    g("skillbox.ru", "pro.skillbox.ru"),
    g("eduson.tv"),
    g("hh.ru", "career.hh.ru"),
    g("coursera.org"),
    g("geekbrains.ru", "pro.geekbrains.ru"),
    g("changellenge.com"), g("career.ru"), g("profi-obrazovanie.ru"),
    g("netology.ru", "pro.netology.ru"),
    g("productstar.ru"),
  ],

  // Образование — детское
  "child-edu-centers": [
    g("kidburg.ru"), g("smartkids.ru"), g("lego-edu.ru"), g("algoritmika.org"), g("iq007.ru"),
    g("mental-arithmetic.ru"), g("polyglotik.ru"), g("chudo-detstvo.ru"), g("kidsclub.ru"), g("detskiy-club.ru"),
  ],
  "child-edu-tutors": [
    g("repetit.ru"), g("profi.ru"), g("tutoronline.ru"), g("repetitor.ru"), g("tutortop.ru"),
    g("reshu-ege.ru"), g("skysmart.ru"), g("foxford.ru"), g("znanika.ru"), g("obrazovanie-plus.ru"),
  ],

  // Медицина — клиники
  "medical-private-clinics": [
    g("medsi.ru"), g("smclinic.ru"), g("emcmos.ru"), g("k31.ru"), g("chaika.com"),
    g("medicina.ru"), g("atlasclinic.ru"), g("bestclinic.ru"), g("fdoctor.ru"), g("clinicexpert.ru"),
  ],
  "medical-diagnostics": [
    g("invitro.ru"), g("gemotest.ru"), g("helix.ru"), g("kdl.ru"), g("citilab.ru"),
    g("lab4u.ru"), g("cmd-online.ru"), g("sanmedexpert.ru"),
    g("medsi.ru", "diagnostics.medsi.ru"),
    g("biovita-lab.ru"),
  ],

  // Медицина — фарма
  "pharma-chains": [
    g("apteka.ru"), g("eapteka.ru"), g("asna.ru"), g("rigla.ru"), g("zdravcity.ru"),
    g("apteki.ru"), g("planetazdorovo.ru"), g("neofarm.ru"), g("366.ru"), g("farmani.ru"),
  ],
  "pharma-online": [
    g("apteka-april.ru"), g("samson-pharma.ru"), g("ozerki.ru"), g("eapteka.ru"), g("zdravcity.ru"),
    g("apteka.ru"), g("piluli.ru"), g("megapteka.ru"), g("aptstore.ru"), g("wer.ru"),
  ],

  // Здоровье — спорт
  "fitness-clubs": [
    g("worldclass.ru"), g("fitfit.ru"), g("alexfitness.ru"), g("xfit.ru"), g("planetfit.ru"),
    g("fitness-house.ru"), g("zebra-fitness.ru"), g("cosmos-fitness.ru"), g("gagarinfitness.ru"), g("sportlandia.ru"),
  ],
  "fitness-equipment": [
    g("sportmaster.ru"), g("decathlon.ru"), g("intersport.ru"), g("adidas.ru"),
    g("nike.com", "ru.nike.com"),
    g("reebok.ru"), g("columbia.ru"), g("trial-sport.ru"),
    g("puma.com", "ru.puma.com"),
    g("asics.ru"),
  ],

  // B2B — SaaS
  "saas-platforms": [
    g("amocrm.ru"), g("bitrix24.ru"), g("ispring.ru"), g("yclients.com"), g("moysklad.ru"),
    g("insales.ru"), g("tilda.cc"), g("getcourse.ru"), g("creatium.ru"), g("elama.ru"),
  ],
  "saas-crm": [
    g("bitrix24.ru"), g("amocrm.ru"), g("megaplan.ru"), g("retailcrm.ru"), g("yclients.com"),
    g("creatio.com"), g("freshoffice.ru"), g("envybox.ru"), g("u-on.ru"), g("clientbase.ru"),
  ],

  // B2B — услуги
  "biz-accounting": [
    g("1c.ru"), g("kontur.ru"), g("moedelo.org"), g("sbis.ru"), g("glavbukh.ru"),
    g("buhsoft.ru"), g("astral.ru"), g("nalog.ru"), g("buhonline.ru"), g("sky-consulting.ru"),
  ],
  "biz-banks": [
    g("tinkoff.ru", "business.tinkoff.ru"),
    g("sberbank.ru", "sberbusiness.sberbank.ru"),
    g("alfabank.ru", "sme.alfabank.ru"),
    g("tochka.com"), g("modulbank.ru"),
    g("vtb.ru", "business.vtb.ru"),
    g("gazprombank.ru", "business.gazprombank.ru"),
    g("rshb.ru", "business.rshb.ru"),
    g("otkritie.ru", "business.otkritie.ru"),
    g("pochtabank.ru", "business.pochtabank.ru"),
  ],

  // B2B — HR
  "hr-job-boards": [
    g("hh.ru"), g("superjob.ru"), g("rabota.ru"),
    g("avito.ru", "rabota.avito.ru"),
    g("zarplata.ru"), g("trudvsem.ru"), g("career.ru"),
    g("irr.ru", "rabota.irr.ru"),
    g("job.ru"), g("worki.ru"),
  ],
  "hr-candidate-search": [
    g("hh.ru", "employer.hh.ru"),
    g("superjob.ru", "clients.superjob.ru"),
    g("professionali.ru"),
    g("zarplata.ru", "employer.zarplata.ru"),
    g("rabota.ru", "employer.rabota.ru"),
    g("avito.ru", "employer.avito.ru"),
    g("career.ru", "employer.career.ru"),
    g("linkedin.com", "ru.linkedin.com"),
    g("habr.com", "career.habr.com"),
    g("getmatch.ru"),
  ],

  // B2B — закупки
  "procurement-marketplaces": [
    g("zakupki.gov.ru"), g("b2b-center.ru"), g("rts-tender.ru"), g("sberbank-ast.ru"), g("roseltorg.ru"),
    g("fabrikant.ru"), g("zakazrf.ru"), g("tektorg.ru"), g("torgi.gov.ru"), g("etpgpb.ru"),
  ],
  "procurement-suppliers": [
    g("tiu.ru"), g("all.biz"), g("supl.biz"), g("pulscen.ru"), g("postavshhiki.ru"),
    g("opt-union.ru"), g("b2b-russia.ru"), g("optlist.ru"), g("regmarkets.ru"), g("wbb2b.ru"),
  ],
};

const FALLBACK_DOMAINS: DomainGroup[] = [
  g("site1.ru"),
  g("site2.ru"),
  g("site3.ru"),
  g("site4.ru"),
];

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

/**
 * Плоский, дедуплицированный (по `root`) и отсортированный список всех
 * корневых доменов из TRIGGER_DOMAINS — подсказки для комбобокса «Добавить»
 * в блок-листе доменов (спека #10). Формат {id,label} — под DirectoryEntry.
 */
export function knownTriggerDomains(): { id: string; label: string }[] {
  const seen = new Set<string>();
  for (const groups of Object.values(TRIGGER_DOMAINS)) {
    for (const group of groups) seen.add(group.root);
  }
  return [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map((root) => ({ id: root, label: root }));
}
