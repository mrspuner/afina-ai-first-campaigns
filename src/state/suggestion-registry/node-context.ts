/**
 * Контекстные подсказки активного тега узла workflow. Индексация:
 * `nodeType` → `paramLabel | "__node__"` → массив `SuggestionItem`.
 *
 * Покрывает все актуальные `WorkflowNodeType` (signal, success, end, split,
 * wait, condition, sms, email, push, ivr, storefront, landing).
 * Legacy-типы (`default`, `channel`, `retarget`, `result`, `new`) попадают в
 * GENERIC-fallback.
 */

import type { WorkflowNodeType } from "@/types/workflow";
import type { SuggestionItem } from "./types";

const WHOLE_NODE_KEY = "__node__";

type ParamSuggestions = Record<string, SuggestionItem[]>;

function ask(id: string, label: string, prompt: string): SuggestionItem {
  return { id, label, action: { kind: "ask", prompt } };
}

/**
 * Выделенная (brand) подсказка-объяснение «Как работает нода» — первой в
 * `WHOLE_NODE_KEY` каждого типа. По нажатию ИИ коротко поясняет назначение
 * ноды, её параметры и когда её применять.
 */
function howNode(id: string, prompt: string): SuggestionItem {
  return {
    id,
    label: "Как работает нода",
    action: { kind: "ask", prompt },
    variant: "brand",
  };
}

const SMS: ParamSuggestions = {
  "Текст": [
    ask("sms-text-shorter", "Короче", "сделай текст короче, до 1 SMS-сегмента"),
    ask("sms-text-friendly", "Дружелюбнее", "перепиши текст в более тёплом, дружелюбном тоне"),
    ask("sms-text-benefit", "Добавить выгоду", "добавь в текст конкретную выгоду для клиента"),
  ],
  "Alpha-name": [
    ask("sms-alpha-brand", "Имя бренда", "поставь alpha-name с названием нашего бренда"),
    ask("sms-alpha-short", "Короткое имя", "сделай alpha-name короче, до 11 символов"),
  ],
  "Время": [
    ask("sms-time-morning", "Утро буднего дня", "отправлять в 10:00 по будням"),
    ask("sms-time-now", "Сразу", "отправлять сразу после входа в сегмент"),
  ],
  "Ссылка": [
    ask("sms-link-short", "Короткая ссылка", "поставь сокращённую ссылку с UTM-метками"),
    ask("sms-link-landing", "На лендинг", "веди ссылку на посадочную страницу акции"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("sms-how", "Объясни простыми словами, как работает нода SMS: что она делает, какие у неё параметры (текст, alpha-name, время, ссылка) и когда её стоит применять."),
    ask("sms-node-laconic", "Сделать лаконичнее", "сократи сообщение и убери лишние детали"),
    ask("sms-node-cta", "Усилить призыв", "усиль призыв к действию в конце сообщения"),
  ],
};

const EMAIL: ParamSuggestions = {
  "Тема": [
    ask("email-subj-catchy", "Цепляющая тема", "сделай тему письма цепляющей, до 50 символов"),
    ask("email-subj-nospam", "Без спам-слов", "перепиши тему без слов-триггеров спам-фильтров"),
  ],
  "Текст": [
    ask("email-body-shorter", "Короче", "сократи тело письма, оставь только суть"),
    ask("email-body-struct", "Добавить структуру", "разбей текст письма на абзацы с подзаголовками"),
    ask("email-body-formal", "Деловой тон", "перепиши письмо в более деловом тоне"),
  ],
  "Отправитель": [
    ask("email-from-brand", "От имени бренда", "поставь отправителем имя нашего бренда"),
    ask("email-from-person", "Личное имя", "сделай отправителем имя конкретного менеджера"),
  ],
  "Ссылка": [
    ask("email-link-utm", "С UTM-метками", "добавь UTM-метки в ссылку для трекинга"),
    ask("email-link-landing", "На лендинг", "веди ссылку на посадочную страницу акции"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("email-how", "Объясни простыми словами, как работает нода Email: что она делает, какие у неё параметры (тема, текст, отправитель, ссылка) и когда её стоит применять."),
    ask("email-node-openrate", "Повысить открываемость", "перепиши письмо так, чтобы повысить открываемость"),
    ask("email-node-compress", "Сократить целиком", "сократи письмо целиком в полтора раза"),
  ],
};

const PUSH: ParamSuggestions = {
  "Заголовок": [
    ask("push-title-short", "Короче", "сократи заголовок до 30 символов"),
    ask("push-title-cta", "С призывом", "перепиши заголовок с явным призывом к действию"),
  ],
  "Текст": [
    ask("push-body-shorter", "Короче", "сделай текст пуш-уведомления компактнее"),
    ask("push-body-emoji", "С эмодзи", "добавь подходящее эмодзи в начало текста"),
    ask("push-body-benefit", "Добавить выгоду", "добавь конкретную выгоду для клиента"),
  ],
  "Deeplink": [
    ask("push-deeplink-screen", "На нужный экран", "веди deeplink на профильный экран приложения"),
    ask("push-deeplink-utm", "С UTM-метками", "добавь UTM-метки в deeplink для трекинга"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("push-how", "Объясни простыми словами, как работает нода Push: что она делает, какие у неё параметры (заголовок, текст, deeplink) и когда её стоит применять."),
    ask("push-node-concise", "Сделать лаконичнее", "сократи пуш и убери лишние детали"),
    ask("push-node-urgency", "Добавить срочность", "добавь ощущение срочности — ограниченное время или количество"),
  ],
};

const IVR: ParamSuggestions = {
  "Сценарий": [
    ask("ivr-scenario-short", "Короче", "сократи сценарий звонка до главного"),
    ask("ivr-scenario-warm", "Теплее", "перепиши сценарий в более тёплом, человеческом тоне"),
  ],
  "Голос": [
    ask("ivr-voice-female", "Женский", "выбери женский голос"),
    ask("ivr-voice-male", "Мужской", "выбери мужской голос"),
    ask("ivr-voice-neutral", "Нейтральный", "выбери нейтральный голос"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("ivr-how", "Объясни простыми словами, как работает нода IVR (звонок): что она делает, какие у неё параметры (сценарий, голос) и когда её стоит применять."),
    ask("ivr-node-concise", "Сделать короче", "сократи общую длительность звонка"),
    ask("ivr-node-natural", "Естественнее", "сделай звонок естественнее, меньше шаблонных фраз"),
  ],
};

const WAIT: ParamSuggestions = {
  "Длительность": [
    ask("wait-dur-1h", "1 час", "поставь паузу 1 час"),
    ask("wait-dur-24h", "24 часа", "поставь паузу 24 часа"),
    ask("wait-dur-3d", "3 дня", "поставь паузу 3 дня"),
  ],
  "До события": [
    ask("wait-event-open", "До открытия", "ждать до открытия сообщения"),
    ask("wait-event-click", "До клика", "ждать до клика по ссылке"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("wait-how", "Объясни простыми словами, как работает нода Пауза: что она делает, какие у неё параметры (длительность, ожидание события) и когда её стоит применять."),
    ask("wait-node-shorter", "Сократить ожидание", "сделай паузу короче, чтобы быстрее догнать сегмент"),
    ask("wait-node-longer", "Удлинить ожидание", "увеличь паузу, чтобы дать клиенту больше времени"),
  ],
};

const CONDITION: ParamSuggestions = {
  "Триггер": [
    ask("cond-trigger-opened", "По открытию", "поставь условие: клиент открыл сообщение"),
    ask("cond-trigger-clicked", "По клику", "поставь условие: клиент кликнул по ссылке"),
    ask("cond-trigger-notdelivered", "Без доставки", "поставь условие: сообщение не доставлено"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("cond-how", "Объясни простыми словами, как работает нода Условие: что она делает, по какому триггеру ветвит сценарий и когда её стоит применять."),
    ask("cond-node-strict", "Ужесточить условие", "сделай условие ветвления строже"),
    ask("cond-node-loose", "Ослабить условие", "сделай условие мягче, чтобы захватить больше клиентов"),
  ],
};

const SPLIT: ParamSuggestions = {
  "По": [
    ask("split-by-equal", "Поровну", "разделяй аудиторию поровну на равные ветки"),
    ask("split-by-segment", "По сегменту", "разделяй по сегменту аудитории"),
    ask("split-by-random", "Случайно", "разделяй случайно для A/B-теста"),
  ],
  "Ветки": [
    ask("split-branches-2", "2 ветки", "сделай 2 равные ветки"),
    ask("split-branches-3", "3 ветки", "сделай 3 ветки"),
  ],
  [WHOLE_NODE_KEY]: [
    // Промпт совпадает с match-фразой informational-replies (A6) — клик даёт
    // содержательный ответ про разделение, а не общий fallback.
    howNode("split-how", "как работает разделение"),
    ask("split-node-balance", "Уравновесить", "сделай ветки одинакового объёма"),
    ask("split-node-skew", "Сместить трафик", "пусти 80% трафика в первую ветку, 20% — во вторую"),
  ],
};

const SCORING: ParamSuggestions = {
  [WHOLE_NODE_KEY]: [
    howNode("scoring-how", "Объясни простыми словами, как работает скоринг базы: что он делает и как отбирает аудиторию."),
    ask("scoring-narrow", "Сузить аудиторию", "Сделай отбор строже — оставь только самых горячих."),
    ask("scoring-widen", "Расширить охват", "Ослабь отбор — добавь тёплую аудиторию."),
  ],
  "База": [
    ask("scoring-base-reupload", "Перезалить базу", "Хочу заменить загруженную базу на другую."),
    ask("scoring-base-add", "Добавить базу", "Добавь ещё один файл базы к текущим."),
    ask("scoring-base-quality", "Оценить базу", "Оцени качество и размер загруженной базы."),
  ],
  "Интересы": [
    ask("scoring-int-narrow", "Сузить интересы", "Убери лишние интересы, оставь ключевые."),
    ask("scoring-int-widen", "Добавить интересы", "Предложи ещё релевантные интересы."),
  ],
  "Триггеры": [
    { id: "scoring-trg-domains", label: "Проверить домены",
      action: { kind: "submit", phrase: "проверить доступность доменов" } },
    ask("scoring-trg-add", "Добавить триггер", "Добавь триггер по конкретному домену."),
  ],
};

const SIGNAL: ParamSuggestions = {
  [WHOLE_NODE_KEY]: [
    howNode("signal-how", "Объясни простыми словами, как работает нода Сигнал: что она задаёт в сценарии (исходную аудиторию по сигналу), как влияет на охват и когда её стоит настраивать."),
    ask("signal-node-narrow", "Сузить аудиторию", "сузь сегмент до самых горячих сигналов"),
    ask("signal-node-wide", "Расширить охват", "расширь сегмент, добавь средне-тёплые сигналы"),
    ask("signal-node-fresh", "Свежие сигналы", "оставь только сигналы за последние 7 дней"),
  ],
};

const SUCCESS: ParamSuggestions = {
  "Цель": [
    ask("success-goal-purchase", "Покупка", "цель — клиент совершил покупку"),
    ask("success-goal-form", "Заявка", "цель — клиент оставил заявку"),
    ask("success-goal-visit", "Визит", "цель — клиент посетил сайт"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("success-how", "Объясни простыми словами, как работает нода Успех: что она фиксирует (достижение цели), какой у неё параметр (цель) и когда её стоит применять."),
    ask("success-node-clarify", "Уточнить условие", "уточни, что именно считается успехом"),
  ],
};

const END: ParamSuggestions = {
  "Причина": [
    ask("end-reason-converted", "Сконвертирован", "причина — клиент сконвертирован"),
    ask("end-reason-unsub", "Отписка", "причина — клиент отписался"),
    ask("end-reason-timeout", "Таймаут", "причина — истёк срок сценария"),
  ],
  [WHOLE_NODE_KEY]: [
    howNode("end-how", "Объясни простыми словами, как работает нода Конец: что она означает (выход из сценария), какой у неё параметр (причина) и когда её стоит применять."),
    ask("end-node-clarify", "Указать причину", "добавь конкретную причину выхода из сценария"),
  ],
};

const CATALOG: Partial<Record<WorkflowNodeType, ParamSuggestions>> = {
  sms: SMS,
  email: EMAIL,
  push: PUSH,
  ivr: IVR,
  wait: WAIT,
  condition: CONDITION,
  split: SPLIT,
  scoring: SCORING,
  signal: SIGNAL,
  success: SUCCESS,
  end: END,
};

const GENERIC: SuggestionItem[] = [
  howNode("generic-how", "Объясни простыми словами, как работает эта нода: что она делает, какие у неё параметры и когда её стоит применять."),
  ask("generic-shorter", "Сделать короче", "сделай текст короче и яснее"),
  ask("generic-tone", "Сменить тон", "перепиши в более дружелюбном тоне"),
  ask("generic-benefit", "Добавить выгоду", "добавь конкретную выгоду для клиента"),
];

/**
 * Подсказки для тега: по `nodeType` + `paramLabel`. `paramLabel` undefined →
 * подсказки тега узла целиком. Неизвестный `nodeType` или известный +
 * неизвестный `paramLabel` → fallback на whole-node, затем на GENERIC.
 */
export function resolveNodeContext(
  nodeType: WorkflowNodeType,
  paramLabel: string | undefined
): SuggestionItem[] {
  const byNode = CATALOG[nodeType];
  if (!byNode) return GENERIC;
  const key = paramLabel ?? WHOLE_NODE_KEY;
  return byNode[key] ?? byNode[WHOLE_NODE_KEY] ?? GENERIC;
}
