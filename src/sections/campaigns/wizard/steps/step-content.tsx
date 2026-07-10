"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type Phase = "title" | "subtitle" | "done";

interface StepContentProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function StepContent({
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
}: StepContentProps) {
  // prefers-reduced-motion: печатающая машинка выключается целиком — текст
  // показывается сразу, дети монтируются без задержки. Это и доступность, и
  // детерминизм: setInterval-печать не глушится ни CSS-, ни motion-настройками,
  // из-за чего визуальные снапшоты визарда ловили случайный кадр печати.
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>(reduceMotion ? "done" : "title");
  const [displayedTitle, setDisplayedTitle] = useState(reduceMotion ? title : "");
  const [displayedSubtitle, setDisplayedSubtitle] = useState(
    reduceMotion ? subtitle : ""
  );

  // Reset all state when title/subtitle change (new step mounted)
  useEffect(() => {
    if (reduceMotion) {
      setPhase("done");
      setDisplayedTitle(title);
      setDisplayedSubtitle(subtitle);
      return;
    }
    setPhase("title");
    setDisplayedTitle("");
    setDisplayedSubtitle("");
  }, [title, subtitle, reduceMotion]);

  // Type the title
  useEffect(() => {
    if (reduceMotion || phase !== "title") return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayedTitle(title.slice(0, i));
      if (i >= title.length) {
        clearInterval(id);
        setPhase("subtitle");
      }
    }, 25);
    return () => clearInterval(id);
  }, [phase, title, reduceMotion]);

  // Type the subtitle
  useEffect(() => {
    if (reduceMotion || phase !== "subtitle") return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayedSubtitle(subtitle.slice(0, i));
      if (i >= subtitle.length) {
        clearInterval(id);
        setPhase("done");
      }
    }, 18);
    return () => clearInterval(id);
  }, [phase, subtitle, reduceMotion]);

  return (
    <div className={`w-full ${maxWidth}`}>
      <div className="mb-8 text-left">
        <h1 className="min-h-[2rem] text-2xl font-semibold tracking-tight text-foreground">
          {displayedTitle}
          {phase === "title" && (
            <span className="ml-0.5 animate-pulse opacity-60">|</span>
          )}
        </h1>
        <p className="mt-1.5 min-h-[1.25rem] text-sm text-muted-foreground">
          {displayedSubtitle}
          {phase === "subtitle" && (
            <span className="ml-0.5 animate-pulse opacity-60">|</span>
          )}
        </p>
      </div>

      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            key="content"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.28, ease: [0.23, 1, 0.32, 1] }
            }
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
