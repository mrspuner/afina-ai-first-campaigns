"use client";

import { useId, useLayoutEffect } from "react";

/**
 * Реестр ширин активных правых дроверов (спека A2.5). Заменяет одиночную
 * CSS-переменную `--email-preview-width`, которую раньше публиковали три
 * независимых `useLayoutEffect` (scoring-drawer, email-editor-panel,
 * template-preview-drawer) без координации — при двух открытых дроверах
 * побеждал последний писавший, а первый закрывшийся стирал переменную
 * `removeProperty`-ом из-под ещё открытого второго.
 *
 * Реестр — refcount по `id`: каждый дровер резервирует свою ширину на
 * mount/open и снимает на close/unmount; опубликованное значение — МАКСИМУМ
 * активных ширин, а не «последний записавший». `widthPx=0` означает «сейчас
 * не резервирую» (дровер закрыт, но компонент остаётся смонтированным ради
 * exit-анимации) и не влияет на максимум, пока жива хотя бы одна ненулевая
 * резервация.
 */
export interface RightRail {
  reserve(id: string, widthPx: number): void;
  release(id: string): void;
  current(): number;
}

export function createRightRail(): RightRail {
  const widths = new Map<string, number>();
  return {
    reserve(id, widthPx) {
      widths.set(id, widthPx);
    },
    release(id) {
      widths.delete(id);
    },
    current() {
      let max = 0;
      for (const width of widths.values()) {
        if (width > max) max = width;
      }
      return max;
    },
  };
}

/** CSS-переменная, которую читает промпт-бар, чтобы сжаться и не оказаться под дровером. */
export const RIGHT_RAIL_CSS_VAR = "--right-rail-width";

/**
 * Единый на всё приложение реестр — общий для всех вызовов хука, переживает
 * ре-рендеры (модульный синглтон, а не per-hook state).
 */
const rightRail = createRightRail();

function publishRightRail() {
  const width = rightRail.current();
  if (width > 0) {
    document.documentElement.style.setProperty(RIGHT_RAIL_CSS_VAR, `${width}px`);
  } else {
    document.documentElement.style.removeProperty(RIGHT_RAIL_CSS_VAR);
  }
}

/**
 * Резервирует место под правый дровер шириной `widthPx` в общем реестре.
 * На mount/изменение ширины — резервирует и публикует новый максимум в
 * `--right-rail-width`; на unmount — снимает резервацию и публикует заново.
 *
 * Дровер вызывает хук безусловно (Rules of Hooks) и передаёт `0`, когда сам
 * закрыт (например `open ? WIDTH_PX : 0`) — так резервация снимается без
 * условного вызова хука.
 */
export function useReserveRightRail(widthPx: number): void {
  const id = useId();
  useLayoutEffect(() => {
    rightRail.reserve(id, widthPx);
    publishRightRail();
    return () => {
      rightRail.release(id);
      publishRightRail();
    };
  }, [id, widthPx]);
}
