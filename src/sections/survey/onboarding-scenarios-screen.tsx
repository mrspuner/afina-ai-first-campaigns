"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { curatedScenarioCount } from "@/data/scenarios";

interface OnboardingScenariosScreenProps {
  onChooseScenario: () => void;
  onBack: () => void;
}

export function OnboardingScenariosScreen({ onChooseScenario, onBack }: OnboardingScenariosScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="mx-auto flex w-full max-w-2xl flex-col items-start gap-6"
    >
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
        className="text-[38px] font-semibold leading-[1.1] tracking-tight"
      >
        Готово — подобрали {curatedScenarioCount} сценариев<br />под ваш бизнес
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
        className="max-w-md text-sm text-muted-foreground"
      >
        Каждый сценарий заточен под вашу аудиторию. Выберите подходящий — дальше запустим поиск сигналов по нему.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3"
      >
        <Button variant="outline" onClick={onBack}>Назад</Button>
        <Button onClick={onChooseScenario}>Далее</Button>
      </motion.div>
    </motion.div>
  );
}
