"use client";

import { useLayoutEffect, useState } from "react";
import Image from "next/image";
import { PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Первый вход: полноэкранный оверлей знакомства с афиной ИИ поверх welcome.
 * Четыре шага (знакомство → строка ввода → подсказки → боковая панель)
 * листаются «Далее»/«Назад»; на последнем — финальный CTA. Любой выход
 * вызывает onDismiss, после чего оверлей помечается показанным.
 *
 * Карточка ВСЕГДА по центру экрана. На шагах про промпт-бар затемнение имеет
 * прозрачную дыру ровно по всему блоку промпт-бара (он виден целиком, без
 * затемнения), а обсуждаемый элемент внутри дополнительно обводится тонким
 * жёлтым контуром впритык (0.5px, без отступа). На шаге подсказок каждый чип
 * получает собственный контур.
 */
export function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const geom = useOverlayGeometry(current);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-overlay-title"
      className="fixed inset-0 z-50"
    >
      {/* Слой затемнения: сплошной dim+blur на знакомстве; на шагах про бар —
          то же затемнение с blur, но с дырой ровно по блоку промпт-бара (он
          остаётся чётким, без dim и blur). Дыру собираем четырьмя полосами:
          backdrop-blur нельзя «прорезать» на одном элементе. */}
      <AnimatePresence initial={false}>
        {geom.block ? (
          <motion.div
            key="block-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            aria-hidden
            className="pointer-events-none fixed inset-0"
          >
            {dimStrips(geom.block).map((s, i) => (
              <div
                key={i}
                className="absolute bg-background/70 backdrop-blur-sm"
                style={s}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="full-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            aria-hidden
            className="fixed inset-0 bg-background/70 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Тонкие подсветки обсуждаемых элементов — контур впритык (0.5px). */}
      <AnimatePresence initial={false}>
        {geom.spots.map((s, i) => (
          <motion.div
            key={`spot-${step}-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              top: s.top,
              left: s.left,
              width: s.width,
              height: s.height,
              borderRadius: current.spot?.radius,
              boxShadow: SPOT_RING,
            }}
          />
        ))}
      </AnimatePresence>

      {/* Карточка знакомства — всегда по центру экрана. pointer-events только
          у самой карточки, фон-скрим клики гасит (модальность). */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center px-6">
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
                {step > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    Назад
                  </Button>
                )}
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

// ── Overlay geometry ──────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Geometry {
  /** Дыра в затемнении на весь блок промпт-бара (null — сплошное затемнение). */
  block: Rect | null;
  /** Прямоугольники тонких подсветок обсуждаемых элементов. */
  spots: Rect[];
}

/**
 * Четыре полосы затемнения вокруг rect блока — сверху, снизу, слева, справа.
 * Оставляют дыру ровно по блоку промпт-бара. Каждая полоса несёт dim+blur;
 * blur нельзя «прорезать» дырой на одном элементе, поэтому кадрируем полосами.
 */
function dimStrips(b: Rect): React.CSSProperties[] {
  return [
    { top: 0, left: 0, width: "100%", height: b.top }, // над блоком
    { top: b.top + b.height, left: 0, width: "100%", bottom: 0 }, // под блоком
    { top: b.top, left: 0, width: b.left, height: b.height }, // слева
    { top: b.top, left: b.left + b.width, right: 0, height: b.height }, // справа
  ];
}

/** Тонкий жёлтый контур (0.5px, впритык) + мягкое свечение (как было). */
const SPOT_RING =
  "0 0 0 0.5px var(--brand), 0 0 24px 6px color-mix(in srgb, var(--brand) 38%, transparent)";

/**
 * Измеряет геометрию затемнения по текущему шагу: дыру на весь блок промпт-бара
 * и прямоугольники подсветок. Пере-меряет на resize/scroll. setState только
 * внутри rAF-колбэка (не синхронно в теле эффекта), чтобы не плодить каскады.
 */
function useOverlayGeometry(step: IntroStep): Geometry {
  const [geom, setGeom] = useState<Geometry>({ block: null, spots: [] });

  const blockSel = step.block;
  const spotSel = step.spot?.selector;
  const spotEach = step.spot?.each ?? false;

  useLayoutEffect(() => {
    let raf = 0;
    function rectOf(el: Element): Rect {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
    function measure() {
      const blockEl = blockSel ? document.querySelector(blockSel) : null;
      const block = blockEl ? rectOf(blockEl) : null;

      let spots: Rect[] = [];
      if (spotSel) {
        const el = document.querySelector(spotSel);
        if (el) {
          // each: подсвечиваем каждый чип-кнопку внутри контейнера отдельно.
          spots = spotEach
            ? Array.from(el.querySelectorAll("button")).map(rectOf)
            : [rectOf(el)];
        }
      }
      setGeom({ block, spots });
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
  }, [blockSel, spotSel, spotEach]);

  return geom;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

type IntroStep = {
  title: string;
  body: React.ReactNode;
  /** Селектор всего блока промпт-бара — дыра в затемнении (undefined — знакомство). */
  block?: string;
  /** Обсуждаемый элемент(ы) для тонкой подсветки. */
  spot?: {
    selector: string;
    /** true — подсветить каждую кнопку-потомка отдельно (чипы подсказок). */
    each?: boolean;
    /** Радиус скругления контура под форму элемента. */
    radius: number;
  };
};

const PROMPT_BLOCK = '[data-onboarding="prompt-block"]';

const STEPS: IntroStep[] = [
  {
    title: "Знакомьтесь — афина ИИ",
    body: "Афина ИИ — ваш ассистент в платформе. Помогает собрать аудиторию, настроить кампанию и разобраться в цифрах. Там, где вы видите этот значок, помощь всегда рядом.",
  },
  {
    title: "Спрашивайте своими словами",
    body: "Внизу — строка афины ИИ. Опишите задачу словами — афина подскажет следующий шаг или сделает его за вас.",
    block: PROMPT_BLOCK,
    spot: { selector: '[data-onboarding="prompt-input"]', radius: 10 },
  },
  {
    title: "Или начните с подсказки",
    body: "Под строкой — частые запросы для этого экрана. Нажмите подсказку, чтобы начать в один клик.",
    block: PROMPT_BLOCK,
    spot: {
      selector: '[data-onboarding="prompt-suggestions"]',
      each: true,
      radius: 9999,
    },
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
    block: PROMPT_BLOCK,
    spot: { selector: '[data-onboarding="prompt-panel"]', radius: 8 },
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
