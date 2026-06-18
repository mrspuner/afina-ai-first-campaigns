"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface NewCampaignCardProps {
  onCreate: () => void;
}

export function NewCampaignCard({ onCreate }: NewCampaignCardProps) {
  return (
    <Card className="gap-2 border-2 border-dashed border-border bg-transparent px-5 py-4 ring-0">
      <p className="text-sm font-semibold text-foreground">
        Создайте первую кампанию
      </p>
      <p className="text-xs text-muted-foreground">
        Соберём горячую аудиторию и запустим на неё кампанию за несколько шагов.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Создать кампанию
        </Button>
      </div>
    </Card>
  );
}
