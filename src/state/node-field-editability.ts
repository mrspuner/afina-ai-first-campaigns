import type { NodeParams } from "@/types/workflow";
import type { FieldOptionsKey } from "./field-directory";

export type FieldEditability = "manual" | "ai" | "readonly";

/**
 * Контрол поля (спека A7/A5):
 *  - combo — справочник + ручной ввод + ИИ (бывшие manual);
 *  - email — спец-контрол письма (дропдаун писем + «Создать новое» + «Открыть»);
 *  - template — селект именованных шаблонов канала ноды (правки 9/10);
 * для `ai` и `readonly` контрол не задаётся (поведение по `editability`).
 */
export type FieldControl = "combo" | "email" | "select" | "template";

export interface NodeFieldMeta {
  /** Способ редактирования поля. */
  editability: FieldEditability;
  /** Имя поля в NodeParams — нужно редактору для записи значения. */
  paramKey?: string;
  /** Контрол поля для manual-полей (A7): combo или email. */
  control?: FieldControl;
  /** Ключ справочника готовых значений для combo-контрола (A7). */
  optionsKey?: FieldOptionsKey;
}

/**
 * Каталог редактируемости полей нод (задача 7 спеки).
 * Ключи: kind ноды → label строки из PARAM_RENDERERS (node-card-content.tsx).
 *
 * manual   — карандаш, поле становится текстовым инпутом (все manual-поля строковые).
 * ai       — иконка-ассистент, тег поля улетает в промпт-бар.
 * readonly — вычисляемое/системное значение, только показ.
 */
export const NODE_FIELD_EDITABILITY: Record<
  NodeParams["kind"],
  Record<string, NodeFieldMeta>
> = {
  // Block 7 §1 — на ноде канала остаётся «Шаблон» (несёт все компоненты
  // сообщения); alpha-name/тема/отправитель/ссылка/deeplink/голос ушли внутрь
  // редактора шаблона. SMS дополнительно несёт «Время» (таймпикер отправки).
  sms: {
    "Шаблон": { editability: "manual", paramKey: "text", control: "template" },
    "Время": { editability: "manual", paramKey: "scheduledAt", control: "combo", optionsKey: "smsTime" },
  },
  email: {
    "Шаблон": { editability: "manual", paramKey: "body", control: "template" },
  },
  push: {
    "Шаблон": { editability: "manual", paramKey: "body", control: "template" },
  },
  ivr: {
    // «Сценарий» — это текст для проговаривания (выбор текста + ИИ-пункт).
    "Текст": { editability: "manual", paramKey: "scenario", control: "combo", optionsKey: "ivrScenario" },
  },
  // Block 7 §3 — «Событие» берётся из общего справочника событий (combo + ИИ).
  wait: {
    "Режим": { editability: "readonly", paramKey: "mode" },
    "Длительность": { editability: "ai", paramKey: "durationHours" },
    "Событие": { editability: "manual", paramKey: "untilEvent", control: "combo", optionsKey: "eventCatalog" },
  },
  condition: {
    // Триггер заменён на «Событие» из справочника (Block 7 §3).
    "Событие": { editability: "manual", paramKey: "trigger", control: "combo", optionsKey: "eventCatalog" },
  },
  split: {
    // Отмена A6 (спека #1): сплиттер переведён в ИИ-редактирование. Клик по полю
    // открывает дровер ИИ с вопросами (сколько веток / по какому признаку /
    // куда ведёт новая ветка / какие пути удалить), а не селект.
    "По": { editability: "ai", paramKey: "by" },
    "Ветки": { editability: "ai", paramKey: "branches" },
  },
  merge: {},
  scoring: {
    // Block C #8 — интересы/триггеры показываются в дровере скоринга
    // (полноценная правка полей — отдельный трек Блока 7; пока только показ).
    "Интересы": { editability: "readonly", paramKey: "interests" },
    "Триггеры": { editability: "readonly", paramKey: "triggers" },
  },
  signal: {
    "Файл": { editability: "readonly", paramKey: "fileName" },
    "Сигналов": { editability: "readonly", paramKey: "count" },
    "Сегменты": { editability: "readonly", paramKey: "segments" },
  },
  success: {
    "Цель": { editability: "manual", paramKey: "goal", control: "combo", optionsKey: "successGoal" },
  },
  end: {
    "Причина": { editability: "manual", paramKey: "reason", control: "combo", optionsKey: "endReason" },
  },
};

/** Метаданные поля по kind ноды и label строки, либо undefined. */
export function getFieldMeta(
  kind: NodeParams["kind"],
  label: string
): NodeFieldMeta | undefined {
  return NODE_FIELD_EDITABILITY[kind]?.[label];
}
