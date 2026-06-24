import { FIELD_PRESETS } from "./field-directory";
import type { Channel } from "@/types/campaign";

export interface StarterVariant {
  name: string;
  content: Record<string, unknown>;
}

/**
 * Стартовые варианты шаблона из осиротевших пресетов канала (Block 7 §5).
 * Свободные текстовые поля каналов ушли с нод в шаблон — их пресеты
 * (`smsText` / `pushTitle` / `pushText` / …) не выбрасываем, а используем как
 * стартовые тексты при создании нового шаблона: ими наполняется драфт, когда
 * AI-генерация недоступна (нет ключа / ошибка), чтобы создание шаблона всегда
 * работало в прототипе.
 */
export function starterTemplateVariants(channel: Channel): StarterVariant[] {
  const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length];
  const three = [0, 1, 2];

  switch (channel) {
    case "sms":
      return three.map((i) => ({
        name: `Вариант ${i + 1}`,
        content: {
          kind: "sms",
          text: pick(FIELD_PRESETS.smsText, i),
          alphaName: "BRAND",
          scheduledAt: "immediate",
        },
      }));
    case "push":
      return three.map((i) => ({
        name: `Вариант ${i + 1}`,
        content: {
          kind: "push",
          title: pick(FIELD_PRESETS.pushTitle, i),
          body: pick(FIELD_PRESETS.pushText, i),
        },
      }));
    case "email":
      return three.map((i) => ({
        name: `Вариант ${i + 1}`,
        content: {
          kind: "email",
          subject: pick(FIELD_PRESETS.emailSubject, i),
          body: "Здравствуйте! Подготовили для вас персональное предложение — детали по кнопке ниже.",
          sender: "noreply@brand.com",
        },
      }));
    case "ivr":
      return three.map((i) => ({
        name: `Вариант ${i + 1}`,
        content: {
          kind: "ivr",
          scenario: pick(FIELD_PRESETS.ivrScenario, i),
          voiceType: "neutral",
        },
      }));
  }
}
