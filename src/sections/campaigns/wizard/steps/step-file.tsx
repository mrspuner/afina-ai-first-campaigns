"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepData, StepProps } from "@/types/campaign";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { FILE_SCREEN_HINTS } from "./screen-hints";
import { SIGNAL_TYPES, type SignalType } from "@/state/app-state";
import { rngFor, seededInt } from "@/state/metrics";

/** Deterministic stand-in for parsing an uploaded file's row count. */
export function simulateRowCount(f: File): number {
  return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
}

/** Total simulated rows across every uploaded base. */
function totalRows(files: File[]): number {
  return files.reduce((sum, f) => sum + simulateRowCount(f), 0);
}

/** Pure continue-gate for the Файл step: at least one base is required. */
export function canContinueFromFiles(files: File[]): boolean {
  return files.length > 0;
}

/** Per-source copy for the upload step. */
export function fileCopy(sourceType: StepProps["data"]["sourceType"]): {
  title: string;
  subtitle: string;
} {
  if (sourceType === "own") {
    return {
      title: "Загрузите ваш список сигналов",
      subtitle: "Готовый список сигналов — загрузим как есть, без скоринга.",
    };
  }
  if (sourceType === "stream") {
    return {
      title: "Загрузите базу номеров",
      subtitle: "Номера, которые нужно поставить на мониторинг.",
    };
  }
  return {
    title: "Загрузите вашу базу",
    subtitle: "Добавьте файл с аудиторной базой — оценим качество и размер.",
  };
}

/**
 * Own-source signal-type dropdown — a simple select over the 6 signal types
 * (`SIGNAL_TYPES`). The selection is HELD LOCALLY by the parent step and
 * reflected back via `value`. Choosing only calls `onChange` (a local state
 * update) — it does NOT advance the wizard. The chosen type is flushed into the
 * wizard's dedicated `ownSignalType` field only when the user clicks the
 * existing «Далее» button, so neither the upload nor the step progress is ever
 * reset (handleNext's scenarioChanged reset watches `scenario`, not this field).
 */
function OwnSignalTypeSelector({
  value,
  onChange,
}: {
  value: SignalType | null;
  onChange: (value: SignalType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Тип сигнала
      </h2>
      <Select value={value ?? null} onValueChange={(v) => onChange(v as SignalType)}>
        <SelectTrigger className="w-full" aria-label="Тип сигнала">
          <SelectValue placeholder="Выберите тип сигнала" />
        </SelectTrigger>
        <SelectContent>
          {SIGNAL_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function StepFile({ data, onNext, onBack, active }: StepProps) {
  useScreenHints(active ? FILE_SCREEN_HINTS : null);
  // One or more bases (Block 4b). Seeded from the wizard's `files`, so revisits
  // keep the uploaded set and skip re-hashing unless the user changes it.
  const seededFiles = data.files;
  const [files, setFiles] = useState<File[]>(seededFiles);
  // Whether an empty "add another base" slot is visible. Open by default when
  // nothing is uploaded yet; the «Загрузить ещё одну базу» button reopens it.
  const [showAddSlot, setShowAddSlot] = useState(seededFiles.length === 0);
  const [isHashing, setIsHashing] = useState(false);
  const isOwn = data.sourceType === "own";

  // Own-source signal-type choice held LOCALLY (seeded from the wizard's
  // dedicated field). Selecting only updates this state — it never calls
  // onNext, so the wizard does not advance and the upload is not reset. The
  // value is flushed into `ownSignalType` on «Далее» (see emit()).
  const [ownSignalType, setOwnSignalType] = useState<SignalType | null>(
    data.ownSignalType ?? null
  );

  const { title, subtitle } = fileCopy(data.sourceType);

  function addFile(f: File) {
    setFiles((prev) => [...prev, f]);
    setShowAddSlot(false);
  }

  function replaceAt(index: number, f: File) {
    setFiles((prev) => prev.map((x, i) => (i === index ? f : x)));
  }

  function removeAt(index: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setShowAddSlot(true);
      return next;
    });
  }

  function emit(rowCount: number) {
    const partial: Partial<StepData> = { files, fileRowCount: rowCount };
    // Carry the own-source signal-type choice on the DEDICATED field — never on
    // `scenario` — so handleNext's scenarioChanged reset never fires.
    if (isOwn && ownSignalType) {
      partial.ownSignalType = ownSignalType;
    }
    onNext(partial);
  }

  // The uploaded set is unchanged from what we seeded — same files, same order —
  // so a previously-computed row count can be reused instead of re-hashing.
  const unchanged =
    files.length === seededFiles.length &&
    files.every((f, i) => f === seededFiles[i]);

  function handleContinue() {
    if (files.length === 0) return;
    if (!unchanged) {
      setIsHashing(true);
      return;
    }
    const rowCount =
      typeof data.fileRowCount === "number" ? data.fileRowCount : totalRows(files);
    emit(rowCount);
  }

  function handleHashingComplete() {
    setIsHashing(false);
    emit(totalRows(files));
  }

  const canContinue = canContinueFromFiles(files);

  return (
    <StepContent title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {isHashing ? (
            <div className="relative flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card">
              <HashingLoader onComplete={handleHashingComplete} />
            </div>
          ) : (
            <>
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative">
                  <DropZone
                    accept=".csv,.xlsx,.txt"
                    file={f}
                    onFile={(nf) => replaceAt(i, nf)}
                  />
                  <button
                    type="button"
                    aria-label="Удалить базу"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAt(i);
                    }}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {showAddSlot && (
                <DropZone accept=".csv,.xlsx,.txt" file={null} onFile={addFile} />
              )}

              {files.length > 0 && !showAddSlot && (
                <button
                  type="button"
                  onClick={() => setShowAddSlot(true)}
                  className="flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Загрузить ещё одну базу
                </button>
              )}
            </>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Поддерживаемые форматы: CSV, XLSX, TXT · Данные будут захешированы перед отправкой
          </p>
        </div>

        {isOwn ? (
          <OwnSignalTypeSelector
            value={ownSignalType}
            onChange={setOwnSignalType}
          />
        ) : null}

        <StepFooter
          onBack={onBack}
          onContinue={handleContinue}
          continueLabel="Далее"
          continueDisabled={!canContinue || isHashing}
        />
      </div>
    </StepContent>
  );
}
