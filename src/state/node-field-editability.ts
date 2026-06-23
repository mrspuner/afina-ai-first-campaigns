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
  sms: {
    // Правка 10: свободный «Текст» убран — текст приходит из именованного шаблона.
    "Шаблон": { editability: "manual", paramKey: "text", control: "template" },
    "Alpha-name": { editability: "ai", paramKey: "alphaName" },
    "Время": { editability: "ai", paramKey: "scheduledAt" },
    "Ссылка": { editability: "ai", paramKey: "link" },
  },
  email: {
    "Тема": { editability: "manual", paramKey: "subject", control: "combo", optionsKey: "emailSubject" },
    // Правка 10: свободное тело письма убрано — заменено селектом шаблонов канала email.
    "Шаблон": { editability: "manual", paramKey: "body", control: "template" },
    "Отправитель": { editability: "ai", paramKey: "sender" },
    "Ссылка": { editability: "ai", paramKey: "link" },
  },
  push: {
    // Правка 10: свободные «Заголовок»/«Текст» убраны — заменены селектом шаблонов.
    "Шаблон": { editability: "manual", paramKey: "body", control: "template" },
    "Deeplink": { editability: "ai", paramKey: "deeplink" },
  },
  ivr: {
    "Сценарий": { editability: "manual", paramKey: "scenario", control: "combo", optionsKey: "ivrScenario" },
    "Голос": { editability: "ai", paramKey: "voiceType" },
  },
  wait: {
    "Режим": { editability: "readonly", paramKey: "mode" },
    "Длительность": { editability: "ai", paramKey: "durationHours" },
    "Событие": { editability: "ai", paramKey: "untilEvent" },
  },
  condition: {
    "Триггер": { editability: "ai", paramKey: "trigger" },
  },
  split: {
    // A6 — сознательное исключение из A7: сплиттер задаётся селектами, не ИИ.
    "По": { editability: "manual", paramKey: "by", control: "select" },
    "Ветки": { editability: "manual", paramKey: "branches", control: "select" },
  },
  merge: {},
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
  storefront: {
    "Офферы": { editability: "ai", paramKey: "offers" },
  },
  landing: {
    "CTA": { editability: "manual", paramKey: "cta", control: "combo", optionsKey: "landingCta" },
    "Оффер": { editability: "manual", paramKey: "offerTitle", control: "combo", optionsKey: "landingOffer" },
  },
};

/** Метаданные поля по kind ноды и label строки, либо undefined. */
export function getFieldMeta(
  kind: NodeParams["kind"],
  label: string
): NodeFieldMeta | undefined {
  return NODE_FIELD_EDITABILITY[kind]?.[label];
}
