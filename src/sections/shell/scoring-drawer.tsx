"use client";

import { X } from "lucide-react";
import { useLayoutEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useChat } from "@/state/chat-context";
import { ScoringInterestsPanel } from "./scoring-interests-panel";

const SCORING_DRAWER_WIDTH_PX = 480;

/**
 * Самостоятельный слой «Интересы и триггеры» скоринг-ноды — чистая панель
 * ВЫБОРА (чипы интересов + карточки триггеров), по образцу предпросмотра
 * шаблона: БЕЗ композера и чата внутри.
 *
 * Независим от ИИ-дровера (два независимых слоя): резервирует место справа
 * через --email-preview-width (тот же шов, что предпросмотр/email-редактор), а
 * ИИ-дровер, если открыт, встаёт СЛЕВА от него (он читает эту же переменную).
 * AI-настройка триггеров («добавить домен») идёт через отдельный ИИ-бар/дровер,
 * не внутри этого слоя.
 */
export function ScoringDrawer() {
  const chat = useChat();
  const { open } = chat.scoringDrawer;

  useLayoutEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.style.setProperty(
      "--email-preview-width",
      `${SCORING_DRAWER_WIDTH_PX}px`,
    );
    return () => {
      root.style.removeProperty("--email-preview-width");
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="scoring-drawer"
          data-testid="scoring-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          className="fixed right-0 top-0 z-40 flex h-screen w-[480px] flex-col border-l border-white/10 bg-[rgba(14,14,12,0.96)] p-4 backdrop-blur-[2px]"
        >
          {/* Шапка слоя: подпись + закрыть (стиль предпросмотра). */}
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
              Скоринг · нода
            </span>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={chat.closeScoringDrawer}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Тело — общий редактор интересов/триггеров (только выбор). */}
          <ScoringInterestsPanel />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
