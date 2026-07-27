"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { HashingLoader } from "@/components/ui/hashing-loader";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { BaseFile, StepData, StepProps } from "@/types/campaign";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { FILE_SCREEN_HINTS } from "./screen-hints";
import { getScenario } from "@/data/scenarios";
import { rngFor, seededInt } from "@/state/metrics";

/** Deterministic stand-in for parsing an uploaded file's row count. */
export function simulateRowCount(f: File): number {
  return seededInt(rngFor("rowcount", f.name, f.size), 1000, 100_000);
}

/** Total simulated rows across every uploaded base. */
function totalRows(files: BaseFile[]): number {
  return files.reduce((sum, f) => sum + f.rowCount, 0);
}

/** Pure continue-gate for the Файл step: at least one base is required. */
export function canContinueFromFiles(files: BaseFile[]): boolean {
  return files.length > 0;
}

/**
 * Набор баз не изменился — сравнение ПО ЗНАЧЕНИЮ (имя + число строк), а не по
 * ссылке: после перехода на `BaseFile` объекты пересоздаются при каждой
 * гидрации снапшота, и сравнение по ссылке всегда давало бы «изменился»,
 * запуская лишнее хеширование на каждом входе в шаг.
 */
export function sameFileSet(a: readonly BaseFile[], b: readonly BaseFile[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((f, i) => f.name === b[i].name && f.rowCount === b[i].rowCount);
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
 * Own-source warning callout (жёлтая нотификация, стиль welcome-экрана): при
 * загрузке собственной базы напоминаем, что база должна соответствовать
 * выбранному сценарию, иначе кампания покажет низкие результаты. Категория
 * берётся из выбранного сценария (`data.scenario` — его id).
 */
function ScenarioMatchNotice({ scenarioId }: { scenarioId: string | null }) {
  const category = scenarioId ? getScenario(scenarioId)?.category : undefined;
  return (
    <div className="rounded-lg border border-brand/30 bg-brand-muted p-4">
      <p className="text-sm leading-relaxed text-foreground/80">
        {category ? (
          <>
            Выбран сценарий категории «{category}», убедитесь что ваша база
            сигналов соответствует этому сценарию, иначе кампания может показать
            низкие результаты.
          </>
        ) : (
          <>
            Убедитесь, что ваша база сигналов соответствует выбранному сценарию,
            иначе кампания может показать низкие результаты.
          </>
        )}
      </p>
    </div>
  );
}

export function StepFile({
  data,
  onNext,
  onBack,
  active,
  onValueChange,
  footerOverride,
}: StepProps) {
  useScreenHints(active ? FILE_SCREEN_HINTS : null);
  // One or more bases (Block 4b). Seeded from the wizard's `files`, so revisits
  // keep the uploaded set and skip re-hashing unless the user changes it.
  const seededFiles = data.files;
  const [files, setFiles] = useState<BaseFile[]>(seededFiles);
  // Whether an empty "add another base" slot is visible. Open by default when
  // nothing is uploaded yet; the «Загрузить ещё одну базу» button reopens it.
  const [showAddSlot, setShowAddSlot] = useState(seededFiles.length === 0);
  const [isHashing, setIsHashing] = useState(false);
  const isOwn = data.sourceType === "own";

  const { title, subtitle } = fileCopy(data.sourceType);

  // DropZone hands back a raw browser `File` only inside its upload handler —
  // convert it immediately to the lightweight, serializable shape used everywhere else.
  const toBase = (f: File): BaseFile => ({ name: f.name, rowCount: simulateRowCount(f) });

  // `onValueChange` уведомляет РОДИТЕЛЯ (изолированную сессию правки) — вызывать
  // его нужно из обработчика события напрямую, а не изнутри функционального
  // апдейтера `setFiles`: апдейтер выполняется React во время рендера ЭТОГО
  // компонента, и setState другого компонента оттуда — ошибка "Cannot update a
  // component while rendering a different component" (тот же баг, что был в
  // step-channels.tsx, проверено вживую в браузере).
  function addFile(f: File) {
    const next = [...files, toBase(f)];
    setFiles(next);
    onValueChange?.({ files: next });
    setShowAddSlot(false);
  }

  function replaceAt(index: number, f: File) {
    const next = files.map((x, i) => (i === index ? toBase(f) : x));
    setFiles(next);
    onValueChange?.({ files: next });
  }

  function removeAt(index: number) {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    if (next.length === 0) setShowAddSlot(true);
    onValueChange?.({ files: next });
  }

  function emit(rowCount: number) {
    const partial: Partial<StepData> = { files, fileRowCount: rowCount };
    onNext(partial);
  }

  // The uploaded set is unchanged from what we seeded — same files, same order —
  // so a previously-computed row count can be reused instead of re-hashing.
  const unchanged = sameFileSet(files, seededFiles);

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
        {/* Жёлтая нотификация над загрузкой (для собственной базы): напоминаем
            согласовать базу с выбранным сценарием. */}
        {isOwn && <ScenarioMatchNotice scenarioId={data.scenario} />}

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

        {!footerOverride?.hidden && (
          <StepFooter
            onBack={onBack}
            onContinue={handleContinue}
            continueLabel={footerOverride?.continueLabel ?? "Далее"}
            backLabel={footerOverride?.backLabel}
            continueDisabled={!canContinue || isHashing}
          />
        )}
      </div>
    </StepContent>
  );
}
