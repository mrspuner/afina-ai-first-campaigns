"use client";

import { cn } from "@/lib/utils";

type Plate = {
  heading: string;
  description: string;
};

const PLATES: readonly Plate[] = [
  {
    heading: "Сигналы",
    description:
      "Определяем, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.",
  },
  {
    heading: "Коммуникация",
    description:
      "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
  },
  {
    heading: "Статистика",
    description:
      "Показываем результат в цифрах — кто отреагировал, сколько принесла кампания.",
  },
] as const;

function plateClass() {
  return cn(
    "flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left",
    // Page-entrance: each card cascades in with a 60 ms stagger between
    // siblings. Per-card delay is set via inline style at the call site.
    "animate-in fade-in-0 slide-in-from-bottom-2 [--tw-animation-duration:280ms] [--tw-ease:var(--ease-out)]"
  );
}

function staggerStyle(i: number): React.CSSProperties | undefined {
  return i > 0 ? { animationDelay: `${i * 60}ms` } : undefined;
}

export function OnboardingStepCards() {
  return (
    <div className="grid w-full grid-cols-3 gap-3">
      {PLATES.map((plate, i) => (
        <div key={plate.heading} className={plateClass()} style={staggerStyle(i)}>
          <span className="text-base font-medium text-foreground">
            {plate.heading}
          </span>
          <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {plate.description}
          </span>
        </div>
      ))}
    </div>
  );
}
