"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptBarProps {
  /** Тело бара — инпут, футер, чипсы конкретного экрана. */
  children: ReactNode;
  /** Открывает правый AI-drawer. */
  onOpenDrawer: () => void;
  /** Контент между шапкой и телом (transient reply, budget-help ответ). */
  slot?: ReactNode;
  /** Доп. классы карточки. */
  cardClassName?: string;
  /**
   * Одноразовая подсветка бара под цвет выбранной ноды (B1). `token`
   * монотонно растёт при каждом новом выборе ноды; смена `token` запускает
   * мягкую box-shadow-анимацию цветом `color`. Повторный выбор той же ноды
   * `token` не меняет — подсветка не мерцает.
   */
  glow?: { color: string; token: number } | null;
}

/**
 * Единая обёртка промпт-бара для всех экранов. Шапка (маскот + «Афина ИИ» +
 * кнопка drawer) одинакова везде; тело передаётся через children.
 * Карточка измеряется через ResizeObserver — это единственный источник
 * CSS-переменной --promptbar-height (потребляется утилитой pb-promptbar).
 */
export function PromptBar({ children, onOpenDrawer, slot, cardClassName, glow }: PromptBarProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Одноразовая подсветка под цвет выбранной ноды. Перезапуск анимации —
  // через remove → reflow → add, как в wf-graph-flash.
  const glowToken = glow?.token ?? 0;
  useEffect(() => {
    if (glowToken === 0) return;
    const el = cardRef.current;
    if (!el || !glow) return;
    el.style.setProperty("--node-glow", glow.color);
    el.classList.remove("promptbar-glow");
    void el.offsetWidth;
    el.classList.add("promptbar-glow");
    const onEnd = () => el.classList.remove("promptbar-glow");
    el.addEventListener("animationend", onEnd, { once: true });
    return () => el.removeEventListener("animationend", onEnd);
    // Цвет читаем из свежего glow внутри эффекта; перезапуск — только по token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glowToken]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--promptbar-height",
        `${Math.round(h)}px`
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--promptbar-height");
    };
  }, []);

  return (
    <div
      // Правая граница = ширина активного правого дровера (реестр
      // right-rail, A2.5) — вместо хардкода right-0. Внутренний
      // max-w-[720px] (ниже) пере-центрируется в оставшейся видимой области
      // (viewport − sidebar 120px − rail) автоматически через justify-center,
      // т.к. сам блок сужается вместе с right.
      style={{ right: "var(--right-rail-width, 0px)" }}
      className="fixed left-[120px] bottom-5 z-30 flex justify-center px-6 transition-[right] duration-300"
    >
      <div
        ref={cardRef}
        // data-onboarding: цель дыры-затемнения онбординга на весь блок (спека #5).
        data-onboarding="prompt-block"
        className={cn(
          "flex w-full max-w-[720px] flex-col gap-2 rounded-[16px] p-3",
          "bg-[rgba(10,10,10,0.75)] shadow-[0_0_17px_9px_rgba(0,0,0,0.19)] backdrop-blur-[2px]",
          cardClassName
        )}
      >
        <div className="flex w-full items-center justify-between px-1 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Image
              src="/mascot-icon.svg"
              alt=""
              width={14}
              height={14}
              aria-hidden
              className="shrink-0"
            />
            афина ИИ
          </span>
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Открыть в drawer"
            data-onboarding="prompt-panel"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        </div>
        {slot}
        {children}
      </div>
      <style>{`
        @keyframes promptbar-glow-anim {
          0% {
            box-shadow: 0 0 0 0 transparent,
              0 0 17px 9px rgba(0, 0, 0, 0.19);
          }
          35% {
            box-shadow: 0 0 26px 7px color-mix(in srgb, var(--node-glow) 55%, transparent),
              0 0 17px 9px rgba(0, 0, 0, 0.19);
          }
          100% {
            box-shadow: 0 0 0 0 transparent,
              0 0 17px 9px rgba(0, 0, 0, 0.19);
          }
        }
        .promptbar-glow {
          animation: promptbar-glow-anim 1.1s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
