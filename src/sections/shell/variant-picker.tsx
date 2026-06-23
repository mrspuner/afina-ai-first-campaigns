"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { X, CornerDownLeft, Pencil } from "lucide-react";
import type { TemplateQuestion } from "@/state/chat-context";

export const VARIANT_PICKER_HINT = "↑↓ — навигация · Enter — выбрать · или впишите ниже";

export interface VariantPickerProps {
  question: TemplateQuestion;
  onSelect: (optionId: string) => void;
  onClose: () => void;
  /** Только для allowFreeInput-вопросов. */
  onSkip: () => void;
}

/**
 * Пикер вариантов над промпт-баром (#14). Нумерованные опции с навигацией
 * ↑↓ / Enter / цифры; у активного пункта — иконка ⏎. Под названием опции —
 * состав компонентов шаблона (#15). Строка «Другой вариант» + «Пропустить»
 * показывается только для вопросов с allowFreeInput. Все строки русские.
 */
export function VariantPicker({ question, onSelect, onClose, onSkip }: VariantPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = question.options.length;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (count === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = question.options[activeIndex];
      if (opt) onSelect(opt.id);
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const opt = question.options[idx];
      if (opt) {
        e.preventDefault();
        onSelect(opt.id);
      }
    }
  }

  return (
    <motion.div
      data-testid="variant-picker"
      role="listbox"
      aria-label={question.prompt}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2 flex flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[#131313]"
    >
      {/* Header = question text + close */}
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <span className="text-xs font-medium text-white/90">{question.prompt}</span>
        <button
          type="button"
          aria-label="закрыть"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Numbered options */}
      <ul className="flex flex-col py-1">
        {question.options.map((opt, i) => {
          const active = i === activeIndex;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(opt.id)}
                className={[
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors",
                  active ? "bg-primary/10 text-white" : "text-white/80 hover:bg-white/5",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px]",
                    active ? "bg-primary/20 text-primary" : "bg-white/8 text-white/50",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.components && opt.components.length > 0 && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {opt.components.join(" · ")}
                    </span>
                  )}
                </span>
                {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Free-input row — ONLY for open questions */}
      {question.allowFreeInput && (
        <div className="flex items-center justify-between border-t border-white/8 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Pencil className="h-3 w-3" />
            Другой вариант
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="rounded border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
          >
            Пропустить
          </button>
        </div>
      )}

      {/* Navigation hint */}
      <p className="border-t border-white/8 px-3 py-1.5 text-[11px] text-muted-foreground">
        {VARIANT_PICKER_HINT}
      </p>
    </motion.div>
  );
}
