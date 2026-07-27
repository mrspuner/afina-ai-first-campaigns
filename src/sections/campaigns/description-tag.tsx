"use client";

import type { CSSProperties } from "react";
import { Globe, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DescriptionTag } from "@/state/graph-description";
import type { WorkflowNodeType } from "@/types/workflow";
import { STEP_ICON } from "./wizard/campaign-stepper";
import { NODE_ICON, NODE_STYLES } from "./node-visuals";

/**
 * Общая геометрия пилюли. `items-baseline`+`align-baseline` — пилюля сидит НА
 * строке текста, а не плавает над/под ней и не раздувает line-height абзаца
 * (спека Task 5: «этот деталь легче всего сломать»).
 */
const PILL_BASE =
  "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0 align-baseline text-[0.95em]";

/** Нейтральный вид — тот же, что у карточки, без брендового жёлтого. */
const NEUTRAL_CLASS = "border-border bg-card text-foreground";

interface ResolvedVisual {
  className: string;
  style?: CSSProperties;
  Icon?: LucideIcon;
}

/**
 * Визуал пилюли по цели тега. `wizard-step`/`domains`/`none` — нейтральные
 * Tailwind-классы; `template`/`node-fields` красятся под ноду графа из
 * `NODE_STYLES`/`NODE_ICON` — источник истины для цвета нод (см. node-visuals.ts).
 * Тип ноды тег не хранит, поэтому приходит пропом; без него — нейтральный вид.
 *
 * `none` (кампания запущена, либо граф больше не правится) остаётся
 * нейтральным по фону/бордеру — цвет узла означал бы «кликабельно», а это
 * больше не так (спека §2.12). Но иконку демоция снимать не должна: без неё
 * «12 000 строк» и «разовый» становятся одинаковыми серыми табличками, и
 * прочитать, какой тег о чём, нельзя (fix round 2, Finding 2). Иконку
 * резолвим по личности, которую демоция сохранила на `none` — `step`
 * (шаговый тег → `STEP_ICON`) либо `nodeType`, пришедший пропом по `nodeId`,
 * который тоже пережил демоцию (шаблон/пауза → `NODE_ICON`).
 */
function resolveVisual(tag: DescriptionTag, nodeType: WorkflowNodeType | undefined): ResolvedVisual {
  const target = tag.target;
  switch (target.kind) {
    case "wizard-step":
      return { className: NEUTRAL_CLASS, Icon: STEP_ICON[target.step] };
    case "template":
    case "node-fields": {
      if (!nodeType) return { className: NEUTRAL_CLASS };
      const s = NODE_STYLES[nodeType];
      return {
        className: "",
        style: { borderColor: s.border, backgroundColor: s.bg, color: s.color },
        Icon: NODE_ICON[nodeType],
      };
    }
    case "domains":
      return { className: NEUTRAL_CLASS, Icon: Globe };
    case "none":
      return {
        className: NEUTRAL_CLASS,
        Icon: target.step ? STEP_ICON[target.step] : nodeType ? NODE_ICON[nodeType] : undefined,
      };
  }
}

interface DescriptionTagPillProps {
  tag: DescriptionTag;
  onActivate?: (tag: DescriptionTag) => void;
  /** Тип ноды для целей `template`/`node-fields` — сам тег его не знает. */
  nodeType?: WorkflowNodeType;
}

/**
 * Значение параметра кампании, вынесенное из текста описания в пилюлю
 * (Task 4 → `describeWorkflow`). Цель `none` — носитель значения без клика:
 * запущенная кампания или шаг, которого нет в её визарде (спека §2.12).
 * Отдельной read-only-ветки поэтому не требуется — это она и есть.
 */
export function DescriptionTagPill({ tag, onActivate, nodeType }: DescriptionTagPillProps) {
  const { className, style, Icon } = resolveVisual(tag, nodeType);
  const title = tag.hoverList?.join(", ");

  const content = (
    <>
      {Icon && <Icon className="h-3 w-3 shrink-0 self-center" aria-hidden />}
      <span>{tag.label}</span>
    </>
  );

  if (tag.target.kind === "none") {
    return (
      <span className={cn(PILL_BASE, className)} style={style} title={title}>
        {content}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(PILL_BASE, className)}
            style={style}
            title={title}
            onClick={() => onActivate?.(tag)}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>Нажмите для изменения</TooltipContent>
    </Tooltip>
  );
}
