"use client";

import { AlertTriangle } from "lucide-react";
import Image from "next/image";
import type { NodeParams, WorkflowNodeData } from "@/types/workflow";
import { getFieldMeta } from "@/state/node-field-editability";
import { usePromptChips } from "@/state/prompt-chips-context";
import type { NodeTagPayload } from "@/state/prompt-chips-context";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { channelForNodeKind, templateOptionsForKind } from "@/state/node-template-options";
import { cn } from "@/lib/utils";
import { getNodeColor } from "./node-visuals";
import { UNIT_COST } from "./campaign-cost";
import { useWorkflowReadOnly } from "./workflow-readonly-context";
import { NodeFieldCombobox } from "./node-field-combobox";
import { NodeTemplateSelect } from "./node-template-select";
import { EmailField } from "./email-field";
import { SplitFields } from "./split-fields";

type ParamRow = { label: string; value: string };

const PARAM_RENDERERS: {
  [K in NodeParams["kind"]]: (p: Extract<NodeParams, { kind: K }>) => ParamRow[];
} = {
  sms: (p) => [
    { label: "Шаблон", value: p.text || "—" },
    { label: "Alpha-name", value: p.alphaName || "—" },
    { label: "Время", value: p.scheduledAt === "immediate" ? "Сразу" : p.scheduledAt },
    ...(p.link ? [{ label: "Ссылка", value: p.link }] : []),
    costRow("sms"),
  ],
  email: (p) => [
    { label: "Тема", value: p.subject || "—" },
    { label: "Шаблон", value: p.body || "—" },
    { label: "Отправитель", value: p.sender || "—" },
    ...(p.link ? [{ label: "Ссылка", value: p.link }] : []),
    costRow("email"),
  ],
  push: (p) => [
    { label: "Шаблон", value: p.body || p.title || "—" },
    ...(p.deeplink ? [{ label: "Deeplink", value: p.deeplink }] : []),
    costRow("push"),
  ],
  ivr: (p) => [
    { label: "Сценарий", value: p.scenario || "—" },
    {
      label: "Голос",
      value:
        p.voiceType === "male"
          ? "Мужской"
          : p.voiceType === "female"
            ? "Женский"
            : "Нейтральный",
    },
    costRow("ivr"),
  ],
  wait: (p) => [
    { label: "Режим", value: p.mode === "duration" ? "Длительность" : "До события" },
    ...(p.mode === "duration" && p.durationHours !== undefined
      ? [{ label: "Длительность", value: formatDuration(p.durationHours) }]
      : []),
    ...(p.mode === "until_event" && p.untilEvent
      ? [{ label: "Событие", value: p.untilEvent }]
      : []),
  ],
  condition: (p) => [
    { label: "Триггер", value: conditionTriggerLabel(p.trigger) },
  ],
  split: (p) => [
    {
      label: "По",
      value:
        p.by === "segment"
          ? "По сегменту"
          : p.by === "random"
            ? "Рандомно"
            : "Поровну",
    },
    {
      label: "Ветки",
      value:
        p.by === "segment"
          ? "По категориям сигнала"
          : String(p.branches),
    },
  ],
  merge: () => [],
  scoring: (p) => [
    { label: "Интересы", value: p.interests.length ? p.interests.join(", ") : "—" },
    { label: "Триггеры", value: p.triggers.length ? p.triggers.join(", ") : "—" },
  ],
  signal: (p) => [
    { label: "Файл", value: p.fileName },
    { label: "Сигналов", value: String(p.count) },
    {
      label: "Сегменты",
      value: `${p.segments.max}/${p.segments.high}/${p.segments.mid}/${p.segments.low}`,
    },
  ],
  success: (p) => [{ label: "Цель", value: p.goal }],
  end: (p) => (p.reason ? [{ label: "Причина", value: p.reason }] : []),
  storefront: (p) => [
    { label: "Офферы", value: p.offers.length > 0 ? p.offers.join(", ") : "—" },
  ],
  landing: (p) => [
    { label: "CTA", value: p.cta },
    { label: "Оффер", value: p.offerTitle },
  ],
};

/** Readonly «средняя стоимость одной отправки» row for a communication node. */
function costRow(channel: keyof typeof UNIT_COST): ParamRow {
  const unit = UNIT_COST[channel].toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
  return { label: "Стоимость", value: `≈ ${unit} ₽ за отправку` };
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  if (hours < 24) return `${hours} ч`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
}

function conditionTriggerLabel(t: string): string {
  switch (t) {
    case "delivered":
      return "Доставлено";
    case "not_delivered":
      return "Не доставлено";
    case "opened":
      return "Открыто";
    case "not_opened":
      return "Не открыто";
    case "clicked":
      return "Кликнуто";
    case "not_clicked":
      return "Не кликнуто";
    default:
      return t;
  }
}

export function getParamRows(params: NodeParams): ParamRow[] {
  const renderer = PARAM_RENDERERS[params.kind];
  // @ts-expect-error — mapped-type narrowing limitation for discriminated union
  return renderer(params);
}

interface NodeCardBodyProps {
  id: string;
  data: WorkflowNodeData;
}

/**
 * Shared body for the expanded node card: attention banner, id, and
 * params list with per-field edit icons.
 * - manual fields: pencil icon (inline edit handler wired in Task 11)
 * - ai fields: mascot icon, pushes chip + prompt template to the prompt bar
 * - readonly fields: no icon
 * Rendered inline inside WorkflowNodeComponent when the node is selected.
 */
export function NodeCardBody({ id, data }: NodeCardBodyProps) {
  const { pushChip } = usePromptChips();
  const dispatch = useAppDispatch();
  // Единый источник шаблонов (правка 9) — тот же массив, что карточки Артефактов.
  const { templates } = useAppState();
  // Реальный шов блока 6: создание/предпросмотр шаблонов через чат-дровер.
  const { openTemplateCreate, openTemplatePreview } = useChat();
  // Launched/paused/completed campaigns: the card opens for inspection only —
  // every field stays read-only regardless of its manual/ai editability.
  const readOnly = useWorkflowReadOnly();

  const rows = data.params ? getParamRows(data.params) : [];

  /** Применяет значение combo-поля к параметрам ноды (A7). */
  function applyFieldValue(paramKey: string, value: string) {
    dispatch({
      type: "workflow_node_field_set",
      nodeId: id,
      patch: { [paramKey]: value } as Partial<NodeParams>,
    });
  }

  function handleAiField(rowLabel: string) {
    const nodeType = data.nodeType;
    const payload: NodeTagPayload = {
      nodeId: id,
      nodeType,
      color: getNodeColor(nodeType),
      paramLabel: rowLabel,
    };
    pushChip({
      // Один активный тег на инпут — id фиксированный по узлу+полю, повторный
      // клик переписывает чип, а не плодит новые (push дедупит по id).
      id: `nodefield_${id}_${rowLabel}`,
      kind: "node",
      // Имя узла не пишем — цвет тега обозначает узел (спека M5.2).
      label: rowLabel,
      payload,
      removable: true,
    });
  }

  return (
    <div className="flex flex-col gap-2 text-left">
      {data.attentionReason && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{data.attentionReason}</span>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground/50">id: {id}</div>

      {/* A6 — сплиттер: поля «По»/«Ветки» рендерятся селектами (не из общего
          цикла), т.к. «Ветки» зависят от типа разделения и категорий сигнала. */}
      {data.params?.kind === "split" && (
        <div className="flex flex-col gap-0.5">
          <SplitFields
            nodeId={id}
            params={data.params}
            dirtyParams={data.dirtyParams}
            readOnly={readOnly}
            onAiHandoff={() => handleAiField("По")}
          />
        </div>
      )}

      {data.params?.kind !== "split" && rows.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rows.map((row) => {
            const meta = data.params
              ? getFieldMeta(data.params.kind, row.label)
              : undefined;
            const editability = meta?.editability;
            const control = meta?.control;
            // Persistent yellow dot on a field whose param was edited.
            const isDirty = meta?.paramKey
              ? data.dirtyParams?.includes(meta.paramKey) ?? false
              : false;
            const dirtyDot = isDirty ? (
              <span
                aria-hidden
                title="Параметр изменён"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
              />
            ) : null;
            const rowGrid =
              "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";
            const rawValue = row.value === "—" ? "" : row.value;

            // A5 — поле письма email.Текст: спец-контрол (дропдаун писем).
            if (control === "email" && data.params?.kind === "email") {
              return (
                <EmailField
                  key={row.label}
                  nodeId={id}
                  params={data.params}
                  isDirty={isDirty}
                  readOnly={readOnly}
                />
              );
            }

            // Правки 9/10 — селект шаблонов канала: свободного текста нет.
            if (control === "template" && data.params && meta?.paramKey) {
              const paramKey = meta.paramKey;
              const channel = channelForNodeKind(data.params.kind);
              const opts = templateOptionsForKind(templates, data.params.kind);
              // Текущий выбор: ищем шаблон, чей соответствующий компонент совпал
              // с params ноды (path-2 модели — без явного templateId в NodeParams).
              const current = data.params
                ? (data.params as Record<string, unknown>)[paramKey]
                : undefined;
              const selected = opts.find(
                (t) =>
                  (t.content as Record<string, unknown>)[paramKey] === current
              );
              return (
                <NodeTemplateSelect
                  key={row.label}
                  label={row.label}
                  templates={opts}
                  selectedName={selected?.name ?? ""}
                  isDirty={isDirty}
                  readOnly={readOnly}
                  onSelect={(t) => {
                    // Применяем компонент шаблона в params ноды (path-1 модели):
                    // нода реально несёт текст шаблона через существующий reducer.
                    const next = (t.content as Record<string, unknown>)[paramKey];
                    applyFieldValue(
                      paramKey,
                      typeof next === "string" ? next : t.name
                    );
                  }}
                  onPreview={(templateId) => openTemplatePreview(templateId)}
                  onCreate={() => {
                    if (channel) openTemplateCreate(channel);
                  }}
                />
              );
            }

            // A7 — combo-контрол: справочник + ручной ввод + ИИ.
            if (control === "combo" && meta?.optionsKey && meta.paramKey) {
              if (readOnly) {
                return (
                  <div key={row.label} className={cn(rowGrid, "px-1 py-0.5")}>
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="truncate text-foreground" title={row.value}>
                      {row.value}
                    </span>
                    <span className="flex items-center justify-end">{dirtyDot}</span>
                  </div>
                );
              }
              const paramKey = meta.paramKey;
              return (
                <NodeFieldCombobox
                  key={row.label}
                  label={row.label}
                  value={rawValue}
                  optionsKey={meta.optionsKey}
                  isDirty={isDirty}
                  onSelect={(next) => applyFieldValue(paramKey, next)}
                  onAiHandoff={() => handleAiField(row.label)}
                />
              );
            }

            // ai — иконка-маскот, тег поля улетает ассистенту (без изменений).
            const interactive = !readOnly && editability === "ai";
            const icon =
              editability === "ai" ? (
                <Image src="/mascot-icon.svg" width={12} height={12} alt="" aria-hidden />
              ) : null;

            if (!interactive) {
              return (
                <div key={row.label} className={cn(rowGrid, "px-1 py-0.5")}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="truncate text-foreground" title={row.value}>
                    {row.value}
                  </span>
                  <span className="flex items-center justify-end">{dirtyDot}</span>
                </div>
              );
            }

            return (
              <button
                key={row.label}
                type="button"
                aria-label={`Передать поле «${row.label}» ассистенту`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAiField(row.label);
                }}
                className={cn(
                  rowGrid,
                  "group nodrag rounded px-1 py-0.5 text-left transition-colors",
                  "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                )}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="truncate text-foreground" title={row.value}>
                  {row.value}
                </span>
                <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
                  {dirtyDot}
                  {icon}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
