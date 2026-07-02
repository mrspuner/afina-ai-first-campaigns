# Карта продукта Afina — разделы, сущности, зависимости

> Срез по ветке `integration`. Полная карта: как связаны разделы, какие сущности есть и как они порождаются друг из друга.

## Что это за продукт

Afina — **single-page приложение** (Next.js 16 App Router): ровно один URL-маршрут `/` плюс один API `/api/ai/assist`. Всё, что выглядит как «переходы между разделами», — это смена `state.view` в едином reducer (`src/state/app-state.ts`), а не навигация по URL. Доменных данных в БД нет — все сущности живут в этом же reducer-стейте.

Карта читается в три слоя:

1. **Навигация** — куда пользователь может попасть и через что.
2. **Сущности** — что хранится и как одно ссылается на другое.
3. **Жизненный цикл** — какое действие порождает какую сущность.

Статистика показана упрощённо — это раздел-потребитель данных, он ничего не создаёт.

---

## 1. Карта навигации

Вход — `Welcome`. Онбординг ведёт через `Survey` к визарду кампании. Дальше всё крутится вокруг оболочки с сайдбаром. **«Сигналы» и «Настройки» намеренно скрыты** из основного сайдбара — в них попадают через flyout «Последнее» и меню профиля.

```mermaid
flowchart LR
  Welcome["Welcome<br/>стартовый экран"]
  Survey["Survey · онбординг<br/>5 фаз"]
  Shell["Оболочка / · сайдбар"]
  Settings["🔒 Настройки"]
  Flyout["«Последнее» · flyout"]
  Campaigns["Кампании"]
  Artifacts["Артефакты · badge"]
  Stats["Статистика"]
  Signals["🔒 Сигналы"]
  Wizard["Визард кампании<br/>Сценарий → Источник → Каналы → Бюджет"]
  DArtifact["Артефакт · деталь"]
  DSignal["Сигнал · деталь"]

  Welcome -->|онбординг| Survey
  Welcome -->|лого| Shell
  Survey -->|выбор сценария| Wizard
  Shell -. профиль .-> Settings
  Shell --> Campaigns
  Shell --> Artifacts
  Shell --> Stats
  Shell -->|Последнее| Flyout
  Flyout --> Signals
  Flyout --> Campaigns
  Campaigns -->|создать| Wizard
  Artifacts --> DArtifact
  Signals --> DSignal
```

Сплошные стрелки — основной путь; пунктир — вход через меню профиля. 🔒 — разделы вне основного сайдбара.

---

## 2. Сущности и их связи

Четыре коллекции в стейте (`signals`, `campaigns`, `artifacts`, `templates`) плюс одиночные слайсы (`survey`, `accountSettings`). `Scenario` / `Direction` / `Interest` / `Trigger` — это **справочники** из `src/data/`, не создаются пользователем.

```mermaid
erDiagram
  Survey ||--|| AccountSettings : "проливает поля при завершении"
  Signal ||--o{ Campaign : "по wizardData.scenario"
  Campaign ||--o{ Artifact : "выход кампании"
  Campaign }o--o{ MessageTemplate : "templateIds"

  Survey {
    string companyName
    string companyWebsite "@deprecated алиас taskDescription"
    string taskDescription "nullable · описание задачи"
    DirectionId directionId FK
    enum surveyStatus "not_started | completed"
  }
  AccountSettings {
    string companyName
    string companyWebsite
    DirectionId directionId
    array interests
    string brandTone
    array domainBlocklist
  }
  Signal {
    string id PK "sig_…"
    SignalType type "6 типов сценария"
    number count
    object segments "{max,high,mid,low} → split в графе"
    SignalStatus status "draft…ready"
    StepData wizardData "снимок визарда"
  }
  Campaign {
    string id PK "cmp_…"
    string name
    enum status "draft|active|paused|completed"
    string signalId FK "@deprecated"
    object scenario "{id,name} → Scenario.id"
    array channels
    number budget "nullable"
    array templateIds FK
    enum phase "scoring|communicating · nullable"
  }
  Artifact {
    string id PK "art_…"
    string campaignId FK
    enum kind "signals | signals_conversions"
    number count
    number createdAt
  }
  MessageTemplate {
    string id PK
    Channel channel
    string name
    NodeParams content
    number usedInCampaigns
  }
```

---

## 3. Жизненный цикл: что порождает что

Главная цепочка слева направо: **анкета → сигнал → кампания → артефакт**. Справочники только питают данные. Граф workflow — редактор кампании, сегменты сигнала задают его split-ветки.

```mermaid
flowchart LR
  subgraph REF ["Справочники · src/data"]
    direction TB
    Dir["Direction → Interest → Trigger"]
    Scen["Scenario + SignalType"]
  end
  Survey["Survey · анкета"]
  Account["AccountSettings · карточка аккаунта"]
  Signal["Signal<br/>sig_ · segments · wizardData"]
  Campaign["Campaign<br/>cmp_ · draft → active → paused"]
  Workflow["Workflow · граф<br/>split по сегментам"]
  Artifact["Artifact<br/>art_ · выход кампании"]
  Template["MessageTemplate<br/>канал + контент"]

  Survey -->|завершение анкеты| Account
  Dir -->|интересы / триггеры| Signal
  Scen -->|задаёт type| Signal
  Signal -->|создать кампанию| Campaign
  Signal -->|segments → split| Workflow
  Campaign -->|редактируется графом| Workflow
  Campaign -->|campaign_artifact_ready| Artifact
  Campaign -->|templateIds при запуске| Template
```

### Таблица: действие → сущность

| Действие пользователя | Где | Создаёт / меняет | Action |
|---|---|---|---|
| Завершить анкету | Survey | заполняет `survey`, сидит `accountSettings` | `survey_completed` |
| Завершить визард сигнала / загрузить базу | guided-flow / upload-dialog | **Signal** (`sig_…`) | `signal_added` |
| «Создать кампанию» из сигнала | деталь/список сигнала | **Campaign** (draft, scenario из сигнала) | `campaign_from_signal` |
| Запуск кампании (после оплаты) | экран оплаты | Campaign → `active`, мердж шаблонов | `campaign_launched` |
| Старт / пауза / возобновление | workflow / деталь | смена `status` + даты | `campaign_status_changed` |
| Готовность артефакта | (только reducer) | **Artifact** (`art_…`), зажигает badge | `campaign_artifact_ready` |

---

## Незавершённые провода (на ветке integration)

Это не баги, а недоделанная миграция — но без них карта вводит в заблуждение.

> ⚠️ **Артефакты не рождаются «вживую».** Action `campaign_artifact_ready` определён в reducer (`app-state.ts:584`), но его не диспатчит ни один UI/таймер. Артефакты появляются только через dev-пресеты (`preset_applied`).

> ⚠️ **Шаблоны не инкрементируются при запуске.** Reducer `campaign_launched` умеет мерджить `templates`, но `campaign-payment-screen.tsx:186` диспатчит без этого поля. В рантайме `MessageTemplate` = только `PRESET_TEMPLATES`.

> ℹ️ **`companyWebsite` ↔ `taskDescription`** — миграция в процессе: форма пишет текст в оба поля, reducer читает legacy `companyWebsite`, и оно проливается в «сайт компании» в Настройках.

---

## Карта файлов

| Файл | Что | Ориентиры |
|---|---|---|
| `src/state/app-state.ts` | Сердце: стейт, `View`, reducer | `View` 197–207; сущности `Signal`:46 / `Campaign`:79 / `Artifact`:119 / `MessageTemplate`:131; кейсы `signal_added`:454, `campaign_from_signal`:554, `campaign_artifact_ready`:584, `survey_completed`:930, `campaign_launched`:1067 |
| `src/app/page.tsx` | Шелл и «роутинг» | `renderMain()` (78–105) диспатчит экран по `view.kind` |
| `src/sections/shell/app-sidebar.tsx` | Сайдбар | `navItems` (44–48): 3 видимых пункта; меню профиля (140–152) |
| `src/sections/artifacts/artifacts-section.tsx` | Раздел Артефакты | Табы Сигналы\|Шаблоны (33–44) |
| `src/sections/campaigns/wizard/campaign-stepper.tsx` | Визард кампании | `STEPPER_ITEMS` (6–11): 4 шага |
| `src/sections/survey/survey-section.tsx` | Онбординг | `Phase` (16–21): форма→awaiting→interests→matching→scenarios |
| `src/types/` | Типы сущностей | `survey.ts`, `campaign.ts` (StepData), `workflow.ts`, `directions.ts`, `signal-status.ts` |
