"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Globe, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DescriptionTag } from "@/state/graph-description";
import type { NodeParams, WorkflowNodeType } from "@/types/workflow";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import {
  channelForNodeKind,
  templateOptionsForKind,
  templateParamKeyForKind,
} from "@/state/node-template-options";
import { STEP_ICON } from "./wizard/campaign-stepper";
import { NODE_ICON, NODE_STYLES } from "./node-visuals";
import { NodeTemplateList } from "./node-template-select";

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

  // Шаблон (Task 7): поповер раскрывается прямо у пилюли, клик наверх
  // (onActivate) не поднимается — спека §2.12 велит `template` оставаться на
  // карточке. Без известного nodeType (лукап не нашёл ноду) деградируем к
  // обычной кнопке-тултипу ниже — она хотя бы не выглядит сломанной.
  if (tag.target.kind === "template" && nodeType) {
    return (
      <TemplateTagPopover
        nodeId={tag.target.nodeId}
        nodeType={nodeType}
        selectedName={tag.label}
        className={cn(PILL_BASE, className)}
        style={style}
        title={title}
      >
        {content}
      </TemplateTagPopover>
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

/**
 * Поповер выбора шаблона у тега названия (Task 7). Список — тот же
 * `NodeTemplateList`, что карточка узла графа использует внутри
 * `NodeTemplateSelect`: одна и та же «сходимость» списка, что и раньше была у
 * значения (правка 9).
 *
 * Выбор шаблона пишет в тот же params-ключ, что резолвит имя шаблона в тексте
 * описания (`templateParamKeyForKind` — единый источник с `graph-description.ts`,
 * никакой третьей копии карты). Дальше всё как и с любой другой правкой поля
 * ноды: `workflow_node_field_set` уходит в mailbox-слот AppState, который
 * headless-апплаер карточки (`useCampaignGraphApplier`, уже смонтирован в
 * `CampaignScreen`) применяет к durable-кэшу графа и бампает его версию —
 * `useCachedGraphVersion` в `CampaignScreen` перерисовывает описание.
 *
 * Превью НЕ закрывает поповер (глазик в списке); «Создать новый шаблон»
 * закрывает — оба поведения зеркалят `NodeTemplateSelect`.
 *
 * Триггер несёт И тултип «Нажмите для изменения» (спека §2.4/AC17 — ЛЮБОЙ
 * интерактивный тег обязан показывать его через секунду наведения; `template`
 * не исключение), И поповер — `TooltipTrigger render={<PopoverTrigger …/>}`
 * стекует два base-ui триггера на одном DOM-узле через их общий
 * `useRenderElement`-merge (тот же приём, что `prompt-input.tsx` уже
 * использует для `DropdownMenuTrigger render={<PromptInputButton/>}`, где
 * `PromptInputButton` сама оборачивает в `Tooltip`). Клик по-прежнему
 * раскрывает список — оба триггера работают одновременно, не взаимоисключающе.
 * Задержку 1с отдельно не задаём — она приходит от единственного
 * `TooltipProvider delay={1000}`, которым `WorkflowDescription` оборачивает
 * всё описание целиком.
 */
function TemplateTagPopover({
  nodeId,
  nodeType,
  selectedName,
  className,
  style,
  title,
  children,
}: {
  nodeId: string;
  nodeType: WorkflowNodeType;
  selectedName: string;
  className: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  const { openTemplatePreview, openTemplateCreate } = useChat();

  const channel = channelForNodeKind(nodeType);
  const paramKey = templateParamKeyForKind(nodeType);
  const options = templateOptionsForKind(templates, nodeType);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger className={className} style={style} title={title} />}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>Нажмите для изменения</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72 p-0">
        <NodeTemplateList
          templates={options}
          selectedName={selectedName}
          onSelect={(t) => {
            if (!paramKey) return;
            const next = (t.content as Record<string, unknown>)[paramKey];
            dispatch({
              type: "workflow_node_field_set",
              nodeId,
              patch: {
                [paramKey]: typeof next === "string" ? next : t.name,
              } as Partial<NodeParams>,
            });
            setOpen(false);
          }}
          onPreview={(templateId) => openTemplatePreview(templateId)}
          onCreate={() => {
            if (channel) openTemplateCreate(channel);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
