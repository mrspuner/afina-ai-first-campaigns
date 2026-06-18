"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface TemplatesEmptyStateProps {
  onCreateManual: () => void;
}

/**
 * Empty state for the Шаблоны tab. Templates are materialized when a campaign
 * with communication launches — or created manually here.
 */
export function TemplatesEmptyState({ onCreateManual }: TemplatesEmptyStateProps) {
  return (
    <Card className="gap-2 border-2 border-dashed border-border bg-transparent px-5 py-4 ring-0">
      <p className="text-sm font-semibold text-foreground">Пока нет шаблонов</p>
      <p className="text-xs text-muted-foreground">
        Шаблоны сообщений появятся здесь после запуска кампании с коммуникацией
        — или создайте вручную.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="outline" onClick={onCreateManual}>
          <Plus className="h-4 w-4" />
          Создать шаблон вручную
        </Button>
      </div>
    </Card>
  );
}
