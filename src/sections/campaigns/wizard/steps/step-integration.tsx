"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { StepContent } from "@/sections/campaigns/wizard/steps/step-content";
import { StepFooter } from "@/sections/campaigns/wizard/steps/step-footer";
import { StepProps } from "@/types/campaign";

export function StepIntegration({ data, onNext, onBack }: StepProps) {
  const [apiKey, setApiKey] = useState<string>(data.apiKey ?? "");

  return (
    <StepContent
      title="Подключите поток сигналов"
      subtitle="Укажите API-ключ — мы начнём принимать сигналы автоматически."
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Поток подключается на стороне платформы. Вставьте API-ключ из личного
          кабинета — новые сигналы будут поступать в реальном времени без
          ручной загрузки файлов.
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="integration-api-key"
            className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
          >
            API-ключ
          </label>
          <Input
            id="integration-api-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </div>

        <StepFooter
          onBack={onBack}
          onContinue={() => onNext({ apiKey: apiKey.trim() })}
          continueLabel="Далее"
        />
      </div>
    </StepContent>
  );
}
