import { z } from "zod";

/**
 * Цель навигации — плоская форма (Gemini ломает discriminated unions в tools,
 * см. ops-wire-schema.ts). kind определяет, какое из полей обязательно;
 * toNavigateTarget собирает строгую цель.
 */
export const wireNavigateSchema = z.object({
  kind: z.enum(["section", "campaign-workflow"]),
  section: z
    .enum(["Статистика", "Артефакты", "Кампании", "Настройки"])
    .optional()
    .describe("Для kind=section"),
  campaignId: z
    .string()
    .optional()
    .describe("Для kind=campaign-workflow: id из данных аккаунта"),
});
export type WireNavigate = z.infer<typeof wireNavigateSchema>;

export type NavigateTarget =
  | { kind: "section"; name: "Статистика" | "Артефакты" | "Кампании" | "Настройки" }
  | { kind: "campaign-workflow"; campaignId: string };

/**
 * Маппит плоскую wire-форму в строгую NavigateTarget.
 * Возвращает null, если обязательное поле для данного kind отсутствует.
 */
export function toNavigateTarget(w: WireNavigate): NavigateTarget | null {
  if (w.kind === "section") {
    return w.section ? { kind: "section", name: w.section } : null;
  }
  // campaign-workflow
  return w.campaignId ? { kind: "campaign-workflow", campaignId: w.campaignId } : null;
}
