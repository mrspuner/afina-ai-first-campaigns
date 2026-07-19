"use client";

import { useState } from "react";
import { X, Plus, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "./settings-field";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { cn } from "@/lib/utils";
import type { DomainStatus } from "@/types/account-settings";

/** RU labels for `DomainStatus` — single source of truth for this block's
 *  registry copy (Task 10). Kept in exact sync with the wording resolved
 *  elsewhere against the SAME registry (`AccountSettings.ownDomains`). */
const DOMAIN_STATUS_LABEL: Record<DomainStatus, string> = {
  pending: "На проверке",
  approved: "Одобрен",
  rejected: "Отклонён",
};

/** Tone per status — `pending` reuses the warning AMBER tone (never the
 *  brand yellow `--brand`, which PRODUCT.md reserves for CTA/AI signal),
 *  matching the trigger-card pending chip (Task 9, `DeltaChip` in
 *  `interests-triggers-editor.tsx`). `approved`/`rejected` reuse that same
 *  chip's emerald/rose tones for visual consistency across the app. */
const DOMAIN_STATUS_TONE: Record<DomainStatus, string> = {
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  approved:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function DomainStatusBadge({ status }: { status: DomainStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        DOMAIN_STATUS_TONE[status]
      )}
    >
      {status === "pending" && (
        <Clock className="h-3 w-3 opacity-70" aria-hidden />
      )}
      {DOMAIN_STATUS_LABEL[status]}
    </span>
  );
}

/** One row of the «Собственные домены» registry — read-only display of the
 *  domain + its CURRENT moderation status, resolved straight from
 *  `AccountSettings.ownDomains` (the single source of truth). No moderation
 *  controls here — that timer is global (Task 7, `useDomainModeration`). */
function OwnDomainRow({
  domain,
  status,
}: {
  domain: string;
  status: DomainStatus;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="font-mono text-xs text-foreground">{domain}</span>
      <DomainStatusBadge status={status} />
    </div>
  );
}

function DomainChip({
  domain,
  onRemove,
}: {
  domain: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground">
      {domain}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Убрать ${domain} из блок-листа`}
        className="opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function DomainsBlock() {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  const blocklist = accountSettings.domainBlocklist;
  const ownDomains = accountSettings.ownDomains;

  const [value, setValue] = useState("");

  // Принимаем как одиночный ввод, так и вставленный список: домены могут быть
  // разделены переносом строки, табом, запятой или точкой с запятой (типичная
  // вставка столбца из таблицы). Пустые строки пропускаются, дубликаты (в т.ч.
  // внутри самой вставки) игнорируются.
  function addDomains(raw: string) {
    const seen = new Set(blocklist);
    const toAdd: string[] = [];
    for (const token of raw.split(/[\n\t,;]+/)) {
      const next = token.trim().toLowerCase();
      if (!next) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      toAdd.push(next);
    }
    if (toAdd.length === 0) {
      setValue("");
      return;
    }
    dispatch({
      type: "settings_updated",
      patch: { domainBlocklist: [...blocklist, ...toAdd] },
    });
    setValue("");
  }

  function addDomain() {
    addDomains(value);
  }

  function removeDomain(domain: string) {
    dispatch({
      type: "settings_updated",
      patch: {
        domainBlocklist: blocklist.filter((d) => d !== domain),
      },
    });
  }

  return (
    <SettingsBlock
      title="Собственные домены и исключения"
      description="Домены, добавленные в триггеры кампаний, со статусом модерации, и глобальный список доменов, которые никогда не используются ни в одном триггере."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Собственные домены
          </h3>
          {ownDomains.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {ownDomains.map((d) => (
                <OwnDomainRow key={d.domain} domain={d.domain} status={d.status} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Пока нет добавленных доменов — они появятся здесь, как только
              вы добавите свой домен в триггер кампании.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium text-foreground">
              Глобальные исключения
            </h3>
            <p className="text-xs text-muted-foreground">
              Домены, которые никогда не используются ни в одном триггере.
            </p>
          </div>
          {blocklist.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {blocklist.map((domain) => (
                <DomainChip
                  key={domain}
                  domain={domain}
                  onRemove={() => removeDomain(domain)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Блок-лист пуст.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="example.ru"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPaste={(e) => {
                // Одиночный домен — обычная вставка в поле. Список (есть
                // разделитель) добавляем сразу: <input> всё равно схлопнул бы
                // переносы строк и потерял список.
                const text = e.clipboardData.getData("text/plain");
                if (/[\n\t,;]/.test(text)) {
                  e.preventDefault();
                  addDomains(text);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDomain}
              disabled={value.trim().length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>
        </div>
      </div>
    </SettingsBlock>
  );
}
