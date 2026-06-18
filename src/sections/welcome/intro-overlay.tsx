"use client";

import { useState } from "react";
import Image from "next/image";
import { PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Первый вход: полноэкранный оверлей «Знакомство с ИИ афина» поверх welcome.
 * Три состояния листаются «Далее»; на последнем — финальный CTA. Любой из
 * этих выходов вызывает onDismiss, после чего оверлей помечается показанным и
 * больше не появляется.
 *
 * Порядок на каждом состоянии: крупный маскот → заголовок → текст — значок
 * маскота и есть «знак ИИ», с которым пользователь должен познакомиться.
 */
export function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  // Шаг про нижнюю строку ИИ (index 1): backdrop не доходит до промбара, чтобы
  // он остался в полном цвете. Высоту бара читаем из --promptbar-height,
  // которую публикует PromptBar (+ его отступ bottom-5 ≈ 1.25rem и зазор).
  const isPromptStep = step === 1;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-overlay-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      style={{
        bottom: isPromptStep
          ? "calc(var(--promptbar-height, 96px) + 2rem)"
          : 0,
      }}
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-background/70 px-6 backdrop-blur-sm transition-[bottom] duration-300 ease-out"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.32, ease: EASE_OUT }}
        className="relative w-full max-w-[420px] rounded-2xl border border-border bg-card p-8 shadow-2xl"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={CONTAINER}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex flex-col items-center gap-5 text-center"
          >
            <motion.div variants={ITEM}>
              <Image
                src="/mascot-icon.svg"
                alt=""
                width={72}
                height={72}
                aria-hidden
                priority
                className="select-none"
              />
            </motion.div>

            <motion.h1
              id="intro-overlay-title"
              variants={ITEM}
              className="text-xl font-bold leading-tight text-foreground"
            >
              {current.title}
            </motion.h1>

            <motion.p
              variants={ITEM}
              className="text-sm leading-relaxed text-muted-foreground"
            >
              {current.body}
            </motion.p>

            <motion.div variants={ITEM}>
              <StepDots count={STEPS.length} active={step} />
            </motion.div>

            <motion.div
              variants={ITEM}
              className="flex items-center justify-center gap-2 pt-1"
            >
              {isLast ? (
                <Button
                  onClick={onDismiss}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  Понятно, начать
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)}>Далее</Button>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

type IntroStep = { title: string; body: React.ReactNode };

const STEPS: IntroStep[] = [
  {
    title: "Знакомьтесь — ИИ афина",
    body: "ИИ афина — ваш ассистент в платформе. Помогает собрать аудиторию, настроить кампанию и разобраться в цифрах. Там, где вы видите этот значок, помощь всегда рядом.",
  },
  {
    title: "Спрашивайте в любой момент",
    body: "Внизу — строка ИИ афины. Нажмите подсказку, чтобы начать, или опишите задачу своими словами — афина подскажет следующий шаг или сделает его за вас.",
  },
  {
    title: "Сложное — в боковой панели",
    body: (
      <>
        Если нужно что-то посложнее, нажмите иконку{" "}
        <PanelRightOpen
          aria-hidden
          className="inline-block size-[1.05em] -translate-y-px text-foreground/80"
        />{" "}
        на строке ассистента — афина откроет боковую панель. Там удобно
        разобрать задачу и вернуться к истории разговора.
      </>
    ),
  },
];

function StepDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={
            i === active
              ? "h-1.5 w-1.5 rounded-full bg-foreground"
              : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
}

// Exponential ease-out (≈ ease-out-quint) — спокойно, без bounce/elastic.
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const CONTAINER = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } },
};

const ITEM = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};
