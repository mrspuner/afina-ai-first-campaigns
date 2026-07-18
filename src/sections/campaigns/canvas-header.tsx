"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Campaign } from "@/state/app-state";
import { StatusBadge } from "./status-badge";

export interface CanvasHeaderToast {
  kind: "error" | "info";
  text: string;
}

type ConfirmKind = "pause";

interface CanvasHeaderProps {
  campaign: Campaign;
  onRename: (name: string) => void;
  onLaunch: () => void;
  onPause: () => void;
  onResume: () => void;
  toast?: CanvasHeaderToast | null;
  onDismissToast?: () => void;
  /**
   * Visual mode of the header.
   * - "edit" (default) — full editable canvas header used while a campaign
   *   is a draft; scenario name as subtitle.
   * - "read-only" — used when the workflow is opened in launched/preview
   *   mode. Replaces the scenario subtitle with a static «Просмотр workflow»
   *   label. Pencil-edit of the campaign name is preserved — renaming a
   *   launched campaign is allowed. The only status action surfaced here is
   *   start/stop (запуск/остановка); дублирование и статистика живут в
   *   карточке кампании.
   */
  mode?: "edit" | "read-only";
  /**
   * Invoked when the user clicks the «Назад» arrow to the left of the title
   * — the back affordance is shown in both modes (edit and read-only) and
   * navigates to the campaign card, the inverse of `openWorkflow`. Omit to
   * hide the arrow.
   */
  onBack?: () => void;
  /**
   * Состояние сохранения черновика (B7). Показывается только в edit-режиме для
   * draft-кампании: `saved` — изменений нет, `unsaved` — есть несохранённые.
   * `undefined` → индикатор не показываем.
   */
  saveState?: "saved" | "unsaved";
  /** Сохранить черновик (сбрасывает несохранённое состояние). */
  onSave?: () => void;
  /**
   * Расчётная стоимость кампании (₽), посчитанная из текущего графа. Когда
   * задана и > 0, в шапке показывается блок «Расчётная стоимость ≈ {cost} ₽»
   * с иконкой афины. Пересчитывается на каждое изменение сценария.
   */
  cost?: number | null;
  /**
   * Клик по иконке афины рядом со стоимостью — ассистент объясняет расчёт.
   */
  onExplainCost?: () => void;
  /**
   * A1: можно ли запускать кампанию. Когда `false`, кнопка «Запустить»
   * disabled и показывает причину в тултипе. `undefined` → не гейтим.
   */
  canLaunch?: boolean;
  /** Причина блокировки запуска (текст тултипа над disabled-кнопкой). */
  launchBlockReason?: string;
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} в ${time}`;
}

function statusDescription(c: Campaign): string {
  if (c.status === "active" && c.launchedAt)
    return `Запущена ${formatDateTime(c.launchedAt)}`;
  if (c.status === "paused" && c.pausedAt)
    return `Приостановлена ${formatDateTime(c.pausedAt)}`;
  if (c.status === "completed" && c.completedAt)
    return `Завершена ${formatLongDate(c.completedAt)}`;
  return `Создана ${formatLongDate(c.createdAt)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function CanvasHeader({
  campaign,
  onRename,
  onLaunch,
  onPause,
  onResume,
  toast,
  onDismissToast,
  mode = "edit",
  onBack,
  saveState,
  cost,
  onExplainCost,
  canLaunch,
  launchBlockReason,
}: CanvasHeaderProps) {
  const isReadOnly = mode === "read-only";
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(campaign.name);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync draft name when the campaign is renamed externally (e.g.,
  // reducer-driven rename from another surface). eslint-disable is used
  // so the rule react-hooks/set-state-in-effect doesn't flag the intentional
  // external→internal state sync.
  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftName(campaign.name);
    }
  }, [campaign.name, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraftName(campaign.name);
    setEditing(true);
  }

  function commit() {
    const next = draftName.trim();
    setEditing(false);
    if (!next || next === campaign.name) return;
    onRename(next);
  }

  function cancel() {
    setEditing(false);
  }

  const scenarioLine = campaign.scenario?.name ?? "Сценарий не выбран";

  // #4 — группа статус-кнопок (Запустить / Приостановить / Возобновить) живёт
  // рядом с названием, а не в дальнем правом углу шапки. Логика доступности
  // («Запустить» заблокирован до готовности + причина в тултипе) сохранена.
  const statusActions = (
    <>
      {campaign.status === "draft" && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  canLaunch === false ? "cursor-not-allowed" : undefined
                )}
              />
            }
          >
            <Button onClick={onLaunch} disabled={canLaunch === false}>
              Запустить
            </Button>
          </TooltipTrigger>
          {canLaunch === false && launchBlockReason && (
            <TooltipContent>{launchBlockReason}</TooltipContent>
          )}
        </Tooltip>
      )}
      {campaign.status === "active" && (
        <Button
          variant="outline"
          className="text-amber-600 border-amber-500/40 hover:bg-amber-500/10"
          onClick={() => setConfirm("pause")}
        >
          Приостановить
        </Button>
      )}
      {campaign.status === "paused" && (
        <Button onClick={onResume}>Возобновить</Button>
      )}
    </>
  );

  return (
    <div
      className="sticky top-0 z-20 border-b border-border bg-background/90 py-3 pl-6 backdrop-blur transition-[padding] duration-300"
      // Правый отступ растёт на ширину AI-дровера, когда тот открыт
      // (--chat-sidebar-width задаётся ChatDrawer на <html>). Так кнопка
      // действия (Запустить / Приостановить / Возобновить) уезжает из-под
      // дровера и сохраняет те же 1.5rem отступа, что и до его открытия.
      style={{ paddingRight: "calc(1.5rem + var(--chat-sidebar-width, 0px))" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={onBack}
              aria-label="Назад"
              className="shrink-0"
            >
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-3">
          {editing ? (
            <Input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              aria-label="Название кампании"
              className="h-9 max-w-sm text-xl font-semibold"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Переименовать кампанию"
              className="group flex items-center gap-2 self-start rounded-md text-left text-xl font-semibold text-foreground hover:text-foreground/80"
            >
              <span className="truncate">{campaign.name}</span>
              <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          )}
          {statusActions}
          </div>
          {isReadOnly ? (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Просмотр workflow
            </p>
          ) : (
            <p
              className={
                campaign.scenario?.name
                  ? "text-xs text-muted-foreground"
                  : "text-xs font-medium text-destructive"
              }
            >
              {scenarioLine}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <span className="text-xs text-muted-foreground">
              {!isReadOnly && campaign.status === "draft" && saveState
                ? saveState === "unsaved"
                  ? "Сохранение…"
                  : "Изменения сохранены"
                : statusDescription(campaign)}
            </span>
          </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {typeof cost === "number" && cost > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Расчётная стоимость
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  ≈ {formatNumber(cost)} ₽
                </span>
              </div>
              <button
                type="button"
                onClick={onExplainCost}
                aria-label="Как посчитана стоимость"
                className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <Image src="/mascot-icon.svg" width={16} height={16} alt="" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={
            toast.kind === "error"
              ? "mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
              : "mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          }
        >
          <span>{toast.text}</span>
          {onDismissToast && (
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onDismissToast}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          )}
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          {confirm === "pause" && (
            <>
              <DialogHeader>
                <DialogTitle>Приостановить кампанию?</DialogTitle>
                <DialogDescription>
                  Кампания перестанет выполнять шаги сценария. Возобновить
                  можно в любой момент.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Отмена
                </Button>
                <Button
                  onClick={() => {
                    setConfirm(null);
                    onPause();
                  }}
                >
                  Приостановить
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
