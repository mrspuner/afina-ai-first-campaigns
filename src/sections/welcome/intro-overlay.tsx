"use client";

import { useLayoutEffect, useState } from "react";
import Image from "next/image";
import { PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Первый вход: полноэкранный оверлей знакомства с афиной ИИ поверх welcome.
 * Четыре шага (знакомство → строка ввода → подсказки → боковая панель)
 * листаются «Далее»; на последнем — финальный CTA. Любой выход вызывает
 * onDismiss, после чего оверлей помечается показанным и больше не появляется.
 *
 * На шагах про промпт-бар обсуждаемый элемент ПРОСВЕЧИВАЕТСЯ сквозь затемнение
 * и обводится жёлтым (точечная подсветка) — горит ровно тот элемент, о котором
 * идёт речь (поле ввода / подсказки / иконка панели), а не весь бар.
 */
export function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const spot = useSpotlight(current.target);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-overlay-title"
      className="fixed inset-0 z-50"
    >
      {/* Слой затемнения: сплошной blur на знакомстве, точечная подсветка на
          шагах про бар. Просвет показывает живой элемент сквозь backdrop. */}
      <AnimatePresence initial={false}>
        {current.target && spot ? (
          <motion.div
            key={`spot-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            aria-hidden
            className="pointer-events-none fixed rounded-[10px]"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              boxShadow: SPOT_SHADOW,
            }}
          />
        ) : (
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            aria-hidden
            className="fixed inset-0 bg-background/70 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Карточка: по центру на знакомстве, над подсвеченным элементом на
          остальных шагах. pointer-events только у самой карточки. */}
      <div
        className="pointer-events-none fixed inset-x-0 flex justify-center px-6"
        style={
          spot
            ? { bottom: spot.cardBottom, top: "auto" }
            : { top: 0, bottom: 0, alignItems: "center" }
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
          className="pointer-events-auto relative w-full max-w-[420px] rounded-2xl border border-border bg-card p-8 shadow-2xl"
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
      </div>
    </div>
  );
}

// ── Spotlight geometry ────────────────────────────────────────────────────────

interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Отступ снизу для карточки — она садится над подсвеченным элементом. */
  cardBottom: number;
}

/** Толщина «воздуха» вокруг подсвеченного элемента. */
const SPOT_PAD = 8;
/** Зазор между подсвеченным элементом и карточкой. */
const CARD_GAP = 16;
/** Тёплая тьма (не чистый чёрный) для затемнения вне просвета. */
const DIM = "rgba(9, 9, 6, 0.72)";
/** Жёлтая рамка + мягкое свечение + огромный спред затемнения. Порядок теней:
 *  рамка и свечение поверх, сплошная тьма — под ними. */
const SPOT_SHADOW = `0 0 0 2px var(--brand), 0 0 24px 6px color-mix(in srgb, var(--brand) 38%, transparent), 0 0 0 100vmax ${DIM}`;

/**
 * Измеряет элемент по CSS-селектору и отдаёт геометрию просвета. Пере-меряет на
 * resize/scroll. setState вызывается только в rAF-колбэке (не синхронно в теле
 * эффекта), чтобы не плодить каскадные рендеры.
 */
function useSpotlight(target: string | undefined): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null);

  useLayoutEffect(() => {
    let raf = 0;
    // Всё обновление стейта — внутри rAF-колбэка (не синхронно в теле эффекта),
    // чтобы избежать каскадных рендеров.
    function measure() {
      const el = target ? document.querySelector(target) : null;
      if (!el) {
        setSpot(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setSpot({
        top: r.top - SPOT_PAD,
        left: r.left - SPOT_PAD,
        width: r.width + SPOT_PAD * 2,
        height: r.height + SPOT_PAD * 2,
        cardBottom: window.innerHeight - (r.top - SPOT_PAD) + CARD_GAP,
      });
    }
    function schedule() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    }
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [target]);

  return spot;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

type IntroStep = {
  title: string;
  body: React.ReactNode;
  /** CSS-селектор подсвечиваемого элемента бара (undefined — знакомство). */
  target?: string;
};

const STEPS: IntroStep[] = [
  {
    title: "Знакомьтесь — афина ИИ",
    body: "Афина ИИ — ваш ассистент в платформе. Помогает собрать аудиторию, настроить кампанию и разобраться в цифрах. Там, где вы видите этот значок, помощь всегда рядом.",
  },
  {
    title: "Спрашивайте своими словами",
    body: "Внизу — строка афины ИИ. Опишите задачу словами — афина подскажет следующий шаг или сделает его за вас.",
    target: '[data-onboarding="prompt-input"]',
  },
  {
    title: "Или начните с подсказки",
    body: "Под строкой — частые запросы для этого экрана. Нажмите подсказку, чтобы начать в один клик.",
    target: '[data-onboarding="prompt-suggestions"]',
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
    target: '[data-onboarding="prompt-panel"]',
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
