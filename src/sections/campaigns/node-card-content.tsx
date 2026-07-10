"use client";

import { Fragment, useRef } from "react";
import { AlertTriangle, Eye, Plus, X } from "lucide-react";
import Image from "next/image";
import type { NodeParams, WorkflowNodeData } from "@/types/workflow";
import { getFieldMeta } from "@/state/node-field-editability";
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
import { DirtyDot } from "./dirty-dot";

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
  statistics: () => [],
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
export function ScoringRow({
  nodeId,
  params,
}: {
  nodeId: string;
  params: Extract<NodeParams, { kind: "scoring" }>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const state = useAppState();
  const readOnly = useWorkflowReadOnly();
  const chat = useChat();
  const { removeChip } = usePromptChips();

  const editable = !readOnly;
  const campaignId =
    state.view.kind === "workflow" ? state.view.campaign.id : undefined;
  const canEdit = editable && campaignId !== undefined;

  const files = params.files ?? [];

  // Open «Интересы и триггеры» in the AI sidebar (chat-drawer) — the drawer that
  // already hosts «Афина ИИ» + the prompt composer. The editor there is the SAME
  // one the wizard uses; edits persist to the campaign scoring params. Drop the
  // auto scoring-node chip so the drawer's bar matches the wizard's bar (parity).
  function openInterestsDrawer() {
    if (!campaignId) return;
    removeChip(`node_${nodeId}`);
    chat.openScoringDrawer({ nodeId, campaignId, editable });
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

  // Обратная к добавлению: удаляем базу по ИНДЕКСУ (имена CampaignFile не
  // гарантированно уникальны). Снимаем и с Campaign.files (durable), и с параметра
  // ноды (чтобы карточка обновилась сразу) — зеркалит handleAddFile.
  function handleRemoveFile(index: number) {
    if (!campaignId) return;
    dispatch({ type: "campaign_file_removed", campaignId, index });
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: { files: files.filter((_, i) => i !== index) } as Partial<NodeParams>,
    });
  }

  return (
    <>
      {/* Файлы — одна удаляемая строка на каждую загруженную базу (в черновике);
          read-only после запуска. «Добавить файл» — под списком. */}
      <div className="grid grid-cols-[minmax(72px,max-content)_1fr] items-start gap-x-2.5 px-1 py-0.5 text-[11px]">
        <span className="text-muted-foreground">Файлы</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {files.length === 0 ? (
            <span className="text-foreground">—</span>
          ) : (
            files.map((file, i) => (
              <div
                key={`${file.name}__${i}`}
                className="group/file flex min-w-0 items-center gap-1.5"
              >
                <span className="truncate text-foreground" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground/50">
                  ~{file.rowCount.toLocaleString("ru-RU")} строк
                </span>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Удалить файл: ${file.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(i);
                    }}
                    className="nodrag ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:text-foreground focus-visible:outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          )}
          {canEdit && (
            <button
              type="button"
              aria-label="Добавить файл"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="nodrag -mx-1 mt-0.5 flex w-fit items-center gap-1 rounded px-1 py-0.5 text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:text-foreground focus-visible:outline-none"
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span>Добавить файл</span>
            </button>
          )}
        </div>
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
            openInterestsDrawer();
          }}
          className="nodrag flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
        >
          {editable ? (
            <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
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
  // openSidebar — открыть дровер ИИ для полей сплиттера (спека #1).
  const { openTemplateCreate, openTemplatePreview, openSidebar } = useChat();
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

  // Сплиттер (спека #1): клик по полю «По»/«Ветки» не только кладёт тег поля в
  // композер, но и открывает дровер ИИ — там пользователь описывает ветвление
  // (сколько веток, по какому признаку, куда ведёт новая, что удалить).
  function handleSplitAiField(field: "По" | "Ветки") {
    handleAiField(field);
    openSidebar();
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

      {/* Сплиттер (спека #1): поля «По»/«Ветки» — ИИ-редактирование. Клик по
          строке кладёт тег поля в композер и открывает дровер ИИ (не селект). */}
      {data.params?.kind === "split" && (
        <div className="flex flex-col gap-0.5">
          <SplitFields
            params={data.params}
            dirtyParams={data.dirtyParams}
            readOnly={readOnly}
            onAiHandoff={handleSplitAiField}
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
                // #6 — постоянный глазик превью рядом с полем «Шаблон» для ВСЕХ
                // каналов (по образцу IVR): виден при выбранном шаблоне и открывает
                // предпросмотр, не раскрывая селект. Работает и в read-only (осмотр
                // запущенной кампании).
                <div key={row.label} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <NodeTemplateSelect
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
                  </div>
                  {selected && (
                    <button
                      type="button"
                      aria-label="Предпросмотр"
                      title="Предпросмотр"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTemplatePreview(selected.id);
                      }}
                      className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            }

            // A7 — combo-контрол: справочник + ручной ввод + ИИ.
            if (control === "combo" && meta?.optionsKey && meta.paramKey) {
              if (readOnly) {
                return (
                  <div key={row.label} className={cn(rowGrid, "px-1 py-0.5")}>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {row.label}
                      {isDirty && <DirtyDot />}
                    </span>
                    <span className="truncate text-foreground" title={row.value}>
                      {row.value}
                    </span>
                    <span className="flex items-center justify-end" />
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
                      className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"
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
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {row.label}
                    {isDirty && <DirtyDot />}
                  </span>
                  <span className="truncate text-foreground" title={row.value}>
                    {row.value}
                  </span>
                  <span className="flex items-center justify-end" />
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
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {row.label}
                  {isDirty && <DirtyDot />}
                </span>
                <span className="truncate text-foreground" title={row.value}>
                  {row.value}
                </span>
                <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
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
