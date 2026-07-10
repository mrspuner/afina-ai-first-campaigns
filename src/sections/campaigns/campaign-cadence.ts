import type { SourceType } from "@/types/campaign";

/** Каденс кампании для чипа карточки. stream → потоковая; new/own → разовая;
 *  не определён → null (чип не показываем). Тип источника пользователю не
 *  показываем — только разовая/потоковая (работаем через интент). */
export function campaignCadenceLabel(
  sourceType: SourceType | undefined,
): "Разовая" | "Потоковая" | null {
  if (!sourceType) return null;
  return sourceType === "stream" ? "Потоковая" : "Разовая";
}
