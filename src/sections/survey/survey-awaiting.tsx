"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

const TOTAL_DURATION = 2400; // ms — short, this is a mock
const TICK = 50;

interface SurveyAwaitingProps {
  onDone: () => void;
  /** Override the heading. Defaults to the task-analysis copy. */
  title?: string;
  /** Override the sub-line. When omitted, falls back to the source-agnostic
   *  task-analysis copy. */
  subtitle?: string;
}

export function SurveyAwaiting({ onDone, title, subtitle }: SurveyAwaitingProps) {
  const [progress, setProgress] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const steps = TOTAL_DURATION / TICK;
    let count = 0;
    const id = setInterval(() => {
      count++;
      setProgress(Math.min((count / steps) * 100, 100));
      if (count >= steps) {
        clearInterval(id);
        setTimeout(() => onDoneRef.current(), 200);
      }
    }, TICK);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title ?? "Изучаем ваш бизнес"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {subtitle ??
          "Афина анализирует вашу задачу и сопоставляет с данными об аудитории."}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full w-full origin-left rounded-full bg-primary will-change-transform"
            style={{
              transform: `scaleX(${progress / 100})`,
              transition: "transform 50ms linear",
            }}
          />
        </div>
        <p className="text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(progress)}%
        </p>
      </div>
    </motion.div>
  );
}
