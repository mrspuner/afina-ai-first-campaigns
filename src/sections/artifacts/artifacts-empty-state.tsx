"use client";

import { Card } from "@/components/ui/card";

/**
 * Empty state for the Сигналы tab. Artifacts are produced by launched
 * campaigns — there is no manual create/upload here (spec block 13).
 */
export function ArtifactsEmptyState() {
  return (
    <Card className="gap-2 border-2 border-dashed border-border bg-transparent px-5 py-4 ring-0">
      <p className="text-sm font-semibold text-foreground">Пока нет артефактов</p>
      <p className="text-xs text-muted-foreground">
        Артефакты появляются здесь, когда кампания собирает сигналы. Запустите
        кампанию — результат окажется тут.
      </p>
    </Card>
  );
}
