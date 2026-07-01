"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Pencil, Plus } from "lucide-react";
import Image from "next/image";
import type { NodeParams, WorkflowNodeData } from "@/types/workflow";
import { ScoringInsightsDrawer } from "./scoring-insights-drawer";
import { resolveInterestOptions } from "./interest-options";
import { getFieldMeta } from "@/state/node-field-editability";
import { fileSummaryLine } from "@/state/workflow-templates";
import { rngFor, seededInt } from "@/state/metrics";
import { usePromptChips } from "@/state/prompt-chips-context";
import type { NodeTagPayload } from "@/state/prompt-chips-context";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import {
  channelForNodeKind,
  ivrNodePreviewTemplate,
  templateOptionsForKind,
} from "@/state/node-template-options";
import { cn } from "@/lib/utils";
import { getNodeColor } from "./node-visuals";
import { UNIT_COST } from "./campaign-cost";
import { useWorkflowReadOnly } from "./workflow-readonly-context";
import { NodeFieldCombobox } from "./node-field-combobox";
import { NodeTemplateSelect } from "./node-template-select";
import { EmailField } from "./email-field";
import { SplitFields } from "./split-fields";
import { WaitFields } from "./wait-fields";

type ParamRow = { label: string; value: string };

const PARAM_RENDERERS: {
  [K in NodeParams["kind"]]: (p: Extract<NodeParams, { kind: K }>) => ParamRow[];
} = {
  // Block 7 §1 — каналы показывают только «Шаблон» (+ SMS «Время»); остальные
  // компоненты сообщения живут внутри шаблона.
  sms: (p) => [
    { label: "Шаблон", value: p.text || "—" },
    { label: "Время", value: p.scheduledAt === "immediate" ? "Сразу" : p.scheduledAt },
    costRow("sms"),
  ],
  email: (p) => [
    { label: "Шаблон", value: p.body || "—" },
    costRow("email"),
  ],
  push: (p) => [
    { label: "Шаблон", value: p.body || p.title || "—" },
    costRow("push"),
  ],
  ivr: (p) => [
    { label: "Текст", value: p.scenario || "—" },
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
    { label: "Событие", value: conditionTriggerLabel(p.trigger) },
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
  ],
  success: (p) => [{ label: "Цель", value: p.goal }],
  end: (p) => (p.reason ? [{ label: "Причина", value: p.reason }] : []),
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

/** Deterministic stand-in for parsing an uploaded base's row count — matches the
 *  wizard's upload step (seeded, never Math.random). */
function scoringFileRowCount(f: File): number {
  return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
}

/**
 * Scoring node body: a «Файлы» row (the uploaded bases, folded onto the scoring
 * node when the standalone «Файл» graph node was removed) and an «Интересы и
 * триггеры» row whose value is a pencil/eye affordance opening the drawer. Both
 * come from the wizard/campaign (overlaid onto params by `applyCampaignContext`)
 * — the card stays compact; the interests/triggers editor lives in the drawer.
 *
 * 2c — while the campaign is a draft (not launched) the interests/triggers
 * drawer is editable AND a control lets the user add more base files; every
 * change persists to BOTH the campaign (source of truth, survives a graph
 * rebuild) and this node's params (so the card reflects it immediately). Once
 * launched everything is read-only.
 */
function ScoringRow({
  nodeId,
  params,
}: {
  nodeId: string;
  params: Extract<NodeParams, { kind: "scoring" }>;
}) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const state = useAppState();
  const readOnly = useWorkflowReadOnly();

  const editable = !readOnly;
  const campaignId =
    state.view.kind === "workflow" ? state.view.campaign.id : undefined;
  const canEdit = editable && campaignId !== undefined;
  const interestOptions = useMemo(
    () => resolveInterestOptions(state.clientDirection),
    [state.clientDirection]
  );

  const files = params.files ?? [];
  const filesSummary =
    files.length > 0
      ? fileSummaryLine(files) ?? files.map((f) => f.name).join(", ")
      : "—";

  function handleChange(next: { interests: string[]; triggers: string[] }) {
    // Persist to the campaign (durable source of truth) …
    if (campaignId) {
      dispatch({
        type: "campaign_scoring_set",
        id: campaignId,
        interests: next.interests,
        triggers: next.triggers,
      });
    }
    // … and to this scoring node's params, so the open card/drawer update now.
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: { interests: next.interests, triggers: next.triggers } as Partial<NodeParams>,
    });
  }

  function handleAddFile(f: File) {
    if (!campaignId) return;
    const file = { name: f.name, rowCount: scoringFileRowCount(f) };
    // Persist to Campaign.files (durable) AND to this node's «Файлы» param, so
    // the open card updates immediately (mirrors the interests/triggers path).
    dispatch({ type: "campaign_file_added", campaignId, file });
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: { files: [...files, file] } as Partial<NodeParams>,
    });
  }

  return (
    <>
      {/* Файлы — the uploaded bases, with an add-file control in a draft. */}
      <div className="grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 px-1 py-0.5 text-[11px]">
        <span className="text-muted-foreground">Файлы</span>
        <span className="truncate text-foreground" title={filesSummary}>
          {filesSummary}
        </span>
        {canEdit ? (
          <button
            type="button"
            aria-label="Добавить файл"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="nodrag flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>
      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAddFile(f);
            e.target.value = "";
          }}
        />
      )}

      {/* Интересы и триггеры — pencil (draft) / eye (launched) opens the drawer. */}
      <div className="grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 px-1 py-0.5 text-[11px]">
        <span className="text-muted-foreground">Интересы и триггеры</span>
        <span aria-hidden />
        <button
          type="button"
          aria-label={
            editable
              ? "Изменить интересы и триггеры"
              : "Показать интересы и триггеры"
          }
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="nodrag flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
        >
          {editable ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <ScoringInsightsDrawer
        open={open}
        onOpenChange={setOpen}
        interests={params.interests}
        triggers={params.triggers}
        editable={editable && campaignId !== undefined}
        interestOptions={interestOptions}
        onChange={handleChange}
      />
    </>
  );
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

      {/* Block 7 §3 — нода ожидания: «Режим» (Select) + «Длительность»
          (число+единица) либо «Событие» (combo из справочника). */}
      {data.params?.kind === "wait" && (
        <div className="flex flex-col gap-0.5">
          <WaitFields
            nodeId={id}
            params={data.params}
            dirtyParams={data.dirtyParams}
            readOnly={readOnly}
            onEventAiHandoff={() => handleAiField("Событие")}
          />
        </div>
      )}

      {/* Скоринг — одна строка «Интересы и триггеры» с дровером (редактируемым
          в черновике, read-only после запуска — 2c). */}
      {data.params?.kind === "scoring" && (
        <ScoringRow nodeId={id} params={data.params} />
      )}

      {data.params?.kind !== "split" &&
        data.params?.kind !== "wait" &&
        data.params?.kind !== "scoring" &&
        rows.length > 0 && (
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
              const combo = (
                <NodeFieldCombobox
                  label={row.label}
                  value={rawValue}
                  optionsKey={meta.optionsKey}
                  isDirty={isDirty}
                  onSelect={(next) => applyFieldValue(paramKey, next)}
                  onAiHandoff={() => handleAiField(row.label)}
                />
              );
              // IVR «Текст» — рядом с полем «глаз»: предпросмотр СЦЕНАРИЯ ноды в
              // том же дровере/IvrRenderer, что и sms/email/push. Контент берём из
              // текущих params ноды (сценарий/голос живут внутри ноды).
              if (data.params?.kind === "ivr") {
                const ivrParams = data.params;
                return (
                  <div key={row.label} className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">{combo}</div>
                    <button
                      type="button"
                      aria-label="Предпросмотр"
                      title="Предпросмотр"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTemplatePreview(ivrNodePreviewTemplate(id, ivrParams));
                      }}
                      className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }
              // Прочие combo-поля (sms «Время», condition/success/end) — без «глаза»,
              // DOM неизменен (без обёртки), чтобы не тронуть визуальные снапшоты.
              return <Fragment key={row.label}>{combo}</Fragment>;
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
