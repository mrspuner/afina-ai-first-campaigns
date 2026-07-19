# Спека 3 — Домены: модель `root + subdomains` + датасет (Трек 2 · часть 1)

Дата: 2026-07-17
Источник: `~/Downloads/afina-spec-2026-07-17.md`, части B2.1, B2.3, B2.8, B3.
Трек: **Домены**. Параллелен треку «Карточка» (непересекающиеся файлы). Строгий порядок: **эта спека → [спека 4](2026-07-17-domains-registry-moderation-design.md)**.

Покрывает: новую модель домена (группа = домен 2-го уровня + поддомены), плотность/овэрфлоу карточки триггера, персист `triggerConfig` на кампании, расширение датасета всех 62 триггеров. НЕ покрывает: комбобокс, реестр, модерацию, судьбу доменов в описании (спека 4).

---

## Цель

Перевести доменную модель с плоских строк на **группы `root + subdomains[]`**, где единица отображения — регистрируемый домен 2-го уровня со счётчиком поддоменов и tooltip'ом; сделать пользовательские правки доменов durable (на сессию) через `Campaign.triggerConfig`; расширить `TRIGGER_DOMAINS` до нового формата для всех триггеров.

## Решения, вшитые в эту спеку

- **Персист = in-memory на сессию** (не reload). `triggerConfig` сейчас теряется на 5 границах — переносим на `Campaign` и прокидываем `initialDeltas` в редактор.
- **Правило путь→поддомен** для датасета (см. ниже) — иначе ~12 триггеров схлопываются в дубли.
- **Датасет — все 62 триггера по ≥10 root** (генерация делегируется агенту по шаблону B3).

## AS IS (проверено против кода 2026-07-17)

- `src/data/trigger-domains.ts:8` — `TRIGGER_DOMAINS: Record<TriggerId, string[]>`, плоские строки. Форматы в данных: 2-й уровень (`sberbank.ru`), путь (`sberbank.ru/ipoteka`, `ozon.ru/dolyame`), редкие поддомены (`eda.yandex.ru`). Типично 3–5 доменов. `knownTriggerDomains()` (`:157-165`) — плоский дедуп-список, формат `{id,label}`.
- `src/lib/trigger-domain-view.ts` — `splitSystemDomains(systemDomains, delta)` (active/excluded, партиция только по `delta.excluded`), `previewDomains` (первые `PREVIEW_VISIBLE_COUNT = 3` + «+N»).
- `src/lib/trigger-edit-parser.ts:125` — `TriggerDelta { added:string[]; excluded:string[] }`. Добавленный домен — строка в `added`, **без статуса**.
- `src/sections/campaigns/wizard/steps/interests-triggers-editor.tsx` (1035 строк) — общий редактор. `deltas` — **локальный `useState<Record<string,TriggerDelta>>({})`** (`:587`), keyed по trigger id. Есть `initialInterestIds`/`initialTriggerIds` (`:484-485`), но **нет `initialDeltas`** → правки доменов теряются при remount/переоткрытии дровера уже внутри сессии. Чипы: `SystemDomainChip` (`:263-300`), `DeltaChip` (`:210-241`). Есть **симулятор проверки** `checkDomainAvailability` (`:840-874`) — исключает 1–4 случайных домена (паттерн под модерацию, используется спекой 4).
- Потеря `triggerConfig` (5 границ): (1) `interests-triggers-editor.tsx:619-633` схлопывает deltas в `triggerConfig` (по label, строки через запятую) → (2) `step-2-interests.tsx:46-52` в `StepData` → (3) `guided-campaign-section.tsx` диспатчит `campaign_created_from_wizard` → (4) **редьюсер `app-state.ts:525-543` не читает `sd.triggerConfig`** → (5) дровер `scoring-interests-panel.tsx:69-91` диспатчит `campaign_scoring_set` только с `interests`/`triggers`, `triggerConfig` отбрасывает; `ScoringParams` поля под него не имеет.
- `Campaign` (`app-state.ts:54-93`): несёт `triggers?:string[]`, `interests?:string[]`, `files?:CampaignFile[]`, но **не `triggerConfig`**.
- `TriggerConfig` (`types/campaign.ts:26-29`) = `{ add:string; exclude:string }` (строки), используется в `StepData.triggerConfig: Record<string,TriggerConfig>` (по label).

## TO BE

### 1. Модель домена (B2.1)

Единица отображения — **регистрируемый домен 2-го уровня** (`sberbank.ru`), под ним свёрнуты поддомены. Разделы/пути (`host/path`) **не моделируем**. Член группы — только поддомен.

Структура данных (расширение `TRIGGER_DOMAINS`):

```ts
TriggerId → DomainGroup[]
DomainGroup = {
  root: string          // домен 2-го уровня, "sberbank.ru"
  subdomains: string[]  // ["online.sberbank.ru", "kredit.sberbank.ru", ...]  (может быть [])
}
```

- Свёрнутый чип = `root` + счётчик `subdomains.length`: «`sberbank.ru ·8`». Если `subdomains` пуст — просто `root` без счётчика.
- По клику на чип — **tooltip** с полным списком поддоменов (просмотр, без управления каждым).
- Группа осмысленна **в пределах одного триггера**: один `root` (бренд) входит в разные триггеры разными поддоменами (`sberbank.ru` в `credit-banks` = `{online,kredit,...}`, в `mortgage-bank-programs` = `{ipoteka.sberbank.ru}`).
- Операции (исключить/добавить/проверка/модерация — модерация в спеке 4) — на уровне **всей группы**.

Переработать `trigger-domain-view.ts` под группы: `splitSystemDomains` работает с `DomainGroup[]` и `delta` (партиция групп active/excluded), `previewDomains` возвращает первые `PREVIEW_VISIBLE_COUNT = 3` групп (свёрнутое превью не меняется).

### 2. Плотность и овэрфлоу (B2.3)

- В **раскрытой** карточке триггера / панели: показываем **10** групп → чип **«+N»** (сколько ещё) → чип **«Добавить свой домен»** (сам комбобокс — спека 4).
- Свёрнутое превью — три группы (`PREVIEW_VISIBLE_COUNT = 3`, без изменений).

### 3. Персист `triggerConfig` на кампании (B2.8)

- Расширить `Campaign` полем `triggerConfig` (durable на сессию, in-memory): по каждому триггеру — добавленные/исключённые домены. `TriggerDelta.added` из строк расширяется до записи, готовой нести статус (статус — спека 4; здесь достаточно домена + признака «системный/добавленный»).
- Прокинуть данные сквозь 5 границ: редьюсер `campaign_created_from_wizard` читает `sd.triggerConfig`; дровер `campaign_scoring_set` сохраняет `triggerConfig`; `ScoringParams` (или сопутствующая durable-структура на кампании) несёт его.
- В `InterestsTriggersEditor` добавить проп **`initialDeltas`** и засеивать `deltas` из него — чинит потерю правок при переоткрытии дровера/возврате на step-2 в пределах сессии.
- Ключевание: внутри редактора `deltas` keyed по trigger **id**; на `Campaign`/`StepData` исторически по label — сохранить единый ключ (рекомендуется id) и маппинг в одной точке, чтобы не плодить рассинхрон.

### 4. Датасет (B3) — все 62 триггера

Расширить `TRIGGER_DOMAINS` до `Record<TriggerId, DomainGroup[]>`, **каждый триггер ≥10 `root`**, у части root — поддомены (для счётчика и tooltip).

**Правило трансформации текущих данных:**
- Плоский 2-й уровень (`vtb.ru`) → `{ root:"vtb.ru", subdomains:[] }`.
- Путь (`sberbank.ru/ipoteka`) → поддомен под root: `{ root:"sberbank.ru", subdomains:["ipoteka.sberbank.ru"] }`. Пути в карте не остаются.
- Поддомен (`eda.yandex.ru`) → `{ root:"yandex.ru", subdomains:["eda.yandex.ru"] }`.
- Один `root` в пределах триггера не дублируется — пути/поддомены одного бренда сливаются в его `subdomains`.
- Добор до ≥10 root — прототипными моками того же рынка (как текущие данные). Домены не тарифная сетка.

Эталоны (из B3, дословно) — трек-контроль качества, демо-путь идёт по ним:
- `credit-banks`: sberbank.ru{online,kredit,ipoteka}, vtb.ru{online,kredit}, alfabank.ru{online,credit}, gazprombank.ru, tinkoff.ru{credit,id}, raiffeisen.ru, otkritie.ru, rshb.ru, sovcombank.ru{halva}, pochtabank.ru, mkb.ru, uralsib.ru.
- `mobile-competitors`: mts.ru{login,shop}, megafon.ru{lk,shop}, beeline.ru{my,shop}, tele2.ru{msk,spb}, yota.ru, rostelecom.ru{lk}, sbermobile.ru, tinkoff-mobile.ru, motiv.ru, danycom.ru, gazprombank-mobile.ru.
- `used-car-listings`: auto.ru{msk,spb}, drom.ru{moscow,baza}, avito.ru{avto}, youla.ru{auto}, am.ru, carsguru.ru, bibinet.ru, avtomarket.ru, cars.ru, quto.ru, kolesa.ru.

`knownTriggerDomains()` обновить: возвращать `root`-домены (плоский дедуп по root) — источник для комбобокса спеки 4. `getTriggerDomains`/`FALLBACK_DOMAINS` перевести на новый тип.

**Генерация датасета делегируется агенту** по этому шаблону + правилу трансформации; три эталонные вертикали — образец плотности/качества.

## Критерии приёмки

1. `TRIGGER_DOMAINS` — тип `Record<TriggerId, DomainGroup[]>`; каждый триггер ≥10 `root`; пути отсутствуют; поддомены собраны под root. Три эталонные вертикали совпадают с B3.
2. Домен в триггере — чип 2-го уровня; при непустых поддоменах — счётчик «`root ·N`»; клик → tooltip с полным списком поддоменов.
3. В раскрытой карточке — 10 групп → «+N» → «Добавить свой домен» (кнопка-плейсхолдер; комбобокс — спека 4). Свёрнутое превью — 3 группы.
4. Правки доменов (add/exclude) durable на сессию: сохраняются на `Campaign.triggerConfig`, переживают навигацию карточка↔граф↔оплата и переоткрытие панели «Интересы и триггеры» (`initialDeltas` засеивается).
5. `splitSystemDomains`/`previewDomains` работают на `DomainGroup[]`; сборка/типы/визуальные тесты зелёные.

## Маппинг файлов

| Область | Файлы |
|---|---|
| Модель домена, статусы-группы | `data/trigger-domains.ts`, `lib/trigger-domain-view.ts`, `lib/trigger-edit-parser.ts` |
| Чип-группа, счётчик, tooltip, 10→«+N» | `interests-triggers-editor.tsx` (`SystemDomainChip`, `DeltaChip`, `previewDomains`) |
| `initialDeltas` | `interests-triggers-editor.tsx`, `scoring-interests-panel.tsx`, `step-2-interests.tsx` |
| Персист на кампании | `types/campaign.ts`, `types/workflow.ts` (`ScoringParams`?), `app-state.ts` (`Campaign`, `campaign_created_from_wizard`, `campaign_scoring_set`) |

## Взаимодействие

- **Спека 4** добавит статус домену (pending/approved/rejected), комбобокс, реестр, таймер, судьбу в описании — поверх этой модели. Здесь запись домена уже готова нести статус, но статус ещё не вводится.
- **Трек «Карточка»** (спека 1) открывает панель «Интересы и триггеры» из нодо-блока скоринга — интерфейс раскрытия стабилен, датасет-изменения его не ломают.
