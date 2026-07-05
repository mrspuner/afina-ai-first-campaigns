"use client";

import Image from "next/image";
import { splitSegmentBranches } from "@/state/split-segments";
import type { SplitParams } from "@/types/workflow";
import { cn } from "@/lib/utils";

const BY_LABELS: Record<SplitParams["by"], string> = {
  equal: "Поровну",
  random: "Рандомно",
  segment: "По сегменту",
};

const rowGrid =
  "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

/**
 * Поля сплиттера — ИИ-редактирование (отмена A6, спека #1). «По» и «Ветки»
 * показывают текущее значение и несут визуал ассистента (иконка-маскот); клик
 * открывает дровер ИИ с вопросами о ветвлении, а не селект. При by="segment"
 * число веток авто-выводится из категорий сигнала.
 */
export function SplitFields({
  params,
  dirtyParams,
  readOnly,
  onAiHandoff,
}: {
  params: SplitParams;
  dirtyParams?: string[];
  readOnly: boolean;
  /** Открывает дровер ИИ для поля сплиттера («По» / «Ветки»). */
  onAiHandoff: (field: "По" | "Ветки") => void;
}) {
  const segmentCount = splitSegmentBranches().length;

  const branchesValue =
    params.by === "segment"
      ? `По категориям сигнала (${segmentCount})`
      : String(params.branches);

  return (
    <>
      <AiRow
        label="По"
        value={BY_LABELS[params.by]}
        isDirty={dirtyParams?.includes("by") ?? false}
        readOnly={readOnly}
        onOpen={() => onAiHandoff("По")}
      />
      <AiRow
        label="Ветки"
        value={branchesValue}
        isDirty={dirtyParams?.includes("branches") ?? false}
        readOnly={readOnly}
        onOpen={() => onAiHandoff("Ветки")}
      />
    </>
  );
}

function DirtyDot() {
  return (
    <span
      aria-hidden
      title="Параметр изменён"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
    />
  );
}

/**
 * Строка поля сплиттера с ИИ-аффордансом. Вся строка — кнопка; клик передаёт
 * поле ассистенту и открывает дровер. Read-only (после запуска) — просто показ.
 */
function AiRow({
  label,
  value,
  isDirty,
  readOnly,
  onOpen,
}: {
  label: string;
  value: string;
  isDirty: boolean;
  readOnly: boolean;
  onOpen: () => void;
}) {
  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate text-foreground">{value}</span>
        <span className="flex items-center justify-end">
          {isDirty && <DirtyDot />}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Настроить «${label}» с помощью ИИ`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        rowGrid,
        "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
        "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-foreground">{value}</span>
      <span className="ml-1 flex shrink-0 items-center gap-1.5">
        {isDirty && <DirtyDot />}
        {/* Маскот = сигнал «ИИ готов вмешаться» (PRODUCT.md, принцип 6). */}
        <Image
          src="/mascot-icon.svg"
          width={14}
          height={14}
          alt=""
          aria-hidden
          className="opacity-70 transition-opacity group-hover:opacity-100"
        />
      </span>
    </button>
  );
}
