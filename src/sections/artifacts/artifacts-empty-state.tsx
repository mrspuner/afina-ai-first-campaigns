"use client";

import { Card } from "@/components/ui/card";

/**
 * Empty state for the Сигналы tab in Артефакты. Artifacts are produced by
 * launched campaigns — there is no manual create/upload (spec §3/§13). Copy
 * tone carried over from the old signals empty state.
 */
export function ArtifactsEmptyState() {
  return (
    <Card className="gap-2 border-2 border-dashed border-border bg-transparent px-5 py-4 ring-0">
      <p className="text-sm font-semibold text-foreground">Пока нет артефактов</p>
      <p className="text-xs text-muted-foreground">
        Артефакты появляются здесь, когда кампания собирает сигналы. Запустите
        кампанию — собранная база окажется тут.
      </p>
      <p className="text-xs text-muted-foreground/80">
        Своя база подключается на шаге «Источник» при создании кампании — без
        отдельной загрузки в этом разделе.
      </p>
    </Card>
  );
}
