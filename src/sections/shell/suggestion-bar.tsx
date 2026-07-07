"use client";

import { AnimatePresence, motion } from "motion/react";
import { Suggestion } from "@/components/ai-elements/suggestion";
import type {
  SuggestionResolution,
} from "@/state/select-prompt-suggestions";
import type { SuggestionItem } from "@/state/suggestion-registry";

interface SuggestionBarProps {
  /** Что показывать (резолв из {@link selectPromptSuggestions}). */
  resolution: SuggestionResolution;
  /** Клик по чипу — единый обработчик. Маппит item.action в реальную операцию. */
  onPick: (item: SuggestionItem) => void;
}

const ZONE_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;
const ITEM_TRANSITION = { duration: 0.26, ease: [0.23, 1, 0.32, 1] } as const;

const DEFAULT_CLASSES =
  "border-white/10 bg-[#171717] text-white hover:bg-[#1f1f1f]";
const BRAND_CLASSES =
  "border-[var(--color-brand)]/50 bg-[var(--color-brand)]/10 text-[var(--color-brand)] hover:bg-[var(--color-brand)]/15";

/**
 * Зона подсказок под промпт-баром. Тонкий рендерер: получает резолв из
 * {@link selectPromptSuggestions} и маппит каждый item в {@link Suggestion}.
 * Решение про state (welcome/context/apply-all/stats/wizard/section) теперь
 * принимается селектором + реестром, не этим компонентом.
 */
export function SuggestionBar({ resolution, onPick }: SuggestionBarProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {resolution.kind === "items" && (
        <motion.div
          key={resolution.scope.kind}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={ZONE_TRANSITION}
        >
          <div
            data-onboarding="prompt-suggestions"
            className="flex flex-wrap items-center gap-2"
          >
            {resolution.items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ y: 6, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ ...ITEM_TRANSITION, delay: i * 0.04 }}
              >
                <Suggestion
                  suggestion={item.label}
                  onClick={() => onPick(item)}
                  className={
                    item.variant === "brand" ? BRAND_CLASSES : DEFAULT_CLASSES
                  }
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
