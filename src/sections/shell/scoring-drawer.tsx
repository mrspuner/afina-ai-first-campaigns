"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useChat } from "@/state/chat-context";
import {
  PromptComposer,
  DRAWER_INPUT_CLASS,
  type PromptComposerHandle,
} from "./prompt-composer";
import { ScoringInterestsPanel } from "./scoring-interests-panel";

/**
 * Отдельный дровер второго уровня «Интересы и триггеры» скоринг-ноды.
 *
 * Раньше редактор интересов/триггеров вставлялся ПРЯМО в общий ИИ-дровер
 * (chat-drawer), захватывая чат. Теперь он открывается как самостоятельная
 * боковая панель (по образцу предпросмотра шаблона / email-редактора) —
 * взаимоисключаемо с ИИ-чатом. Резервирование места справа
 * (--chat-sidebar-width) остаётся за chat-drawer (единый владелец).
 * Редактируемо только в незапущенной кампании (флаг `editable`): тогда снизу
 * свой промпт-бар «Настроить триггер»; в запущенной — read-only, без композера.
 */
export function ScoringDrawer() {
  const chat = useChat();
  const composerRef = useRef<PromptComposerHandle>(null);
  const { open, editable } = chat.scoringDrawer;

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
          {/* Шапка второго уровня: подпись + закрыть (стиль предпросмотра). */}
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

          {/* Тело — тот же общий редактор интересов/триггеров. */}
          <ScoringInterestsPanel />

          {/* Промпт-бар «Настроить триггер» — только для редактируемой (черновик)
              кампании; в запущенной панель read-only, композер не нужен. */}
          {editable && (
            <PromptComposer
              ref={composerRef}
              placeholder="Настроить триггер…"
              inputClassName={DRAWER_INPUT_CLASS}
            />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
