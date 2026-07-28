"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { pluralRu } from "@/lib/plural-ru";

interface DropZoneProps {
  accept: string;
  /**
   * Displayed file. Widened past `File` to `{ name; rowCount }` because the
   * «Файл» step seeds this with `BaseFile` snapshots on revisit/hydration —
   * a real `File` only ever arrives inside `onFile`, never as this prop.
   */
  file: { name: string; rowCount: number } | null;
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function DropZone({ accept, file, onFile, disabled, className }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    onFile(f);
  }, [onFile]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
        isDragging
          ? "border-primary bg-accent"
          : "border-border bg-card hover:border-primary/50 hover:bg-accent/50",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {file ? (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            ~{file.rowCount.toLocaleString("ru-RU")}{" "}
            {pluralRu(file.rowCount, ["строка", "строки", "строк"])}
          </p>
          <p className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
            Нажмите чтобы заменить
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Перетащите файл или нажмите для выбора
          </p>
        </div>
      )}
    </div>
  );
}
