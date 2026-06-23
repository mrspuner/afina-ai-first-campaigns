"use client";

import { useEffect } from "react";

/** Макс. длительность лейбла «Сохранение…» до авто-разрешения в «сохранено». */
export const SAVE_TIMEOUT_MS = 10000;

/**
 * Не даёт лейблу «Сохранение…» висеть вечно (aim #12): пока есть
 * несохранённый дифф (`active`), запускает таймер на {@link SAVE_TIMEOUT_MS};
 * по срабатыванию вызывает `onTimeout` (= сохранить, см. WorkflowSection).
 * Любая новая правка (смена `resetKey`) перезапускает окно.
 */
export function useSaveTimeout(
  active: boolean,
  resetKey: string | null,
  onTimeout: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(onTimeout, SAVE_TIMEOUT_MS);
    return () => clearTimeout(id);
    // resetKey в deps: новая правка → новый 10-секундный отсчёт.
    // onTimeout намеренно не в deps (как в useAiReplyAutoDismiss), чтобы
    // пересоздание колбэка на каждый рендер не перезапускало таймер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resetKey]);
}
