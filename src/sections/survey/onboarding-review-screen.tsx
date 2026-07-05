"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Globe, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DirectionCombobox } from "./direction-combobox";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import {
  moveActiveToSuggestion,
  moveSuggestionToActive,
} from "@/data/account-interests";
import type { AccountSettings } from "@/types/account-settings";
import { cn } from "@/lib/utils";

interface OnboardingReviewScreenProps {
  /** Called after the reviewed data has been committed to accountSettings. */
  onContinue: () => void;
  /** Step back to the website-entry screen. Hidden when omitted. */
  onBack?: () => void;
}

function domainOf(website: string): string {
  return website.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Экран проверки данных (спека #3). Показывает всё, что «афина поняла» о
 * компании, ДО применения. Значения — типографика; клик превращает значение в
 * контрол на месте (click-to-edit). Данные копятся в локальном стейджинге и
 * пишутся в accountSettings РАЗОМ по «Всё верно, продолжить».
 */
export function OnboardingReviewScreen({
  onContinue,
  onBack,
}: OnboardingReviewScreenProps) {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();
  // Стейджинг: засеян текущими данными аккаунта (в прототипе — DEMO). Правки
  // не трогают глобальный стейт до подтверждения.
  const [draft, setDraft] = useState<AccountSettings>(accountSettings);

  function patch(p: Partial<AccountSettings>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const regions = draft.regions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  function setRegions(next: string[]) {
    patch({ regions: next.join(", ") });
  }

  function confirm() {
    dispatch({ type: "account_review_confirmed", settings: draft });
    onContinue();
  }

  const domain = domainOf(draft.companyWebsite) || "ваш сайт";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
    >
      {/* Шапка: favicon + домен (read-only) · заголовок · подзаголовок */}
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" aria-hidden />
          {domain}
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            Проверьте, что афина поняла о вашей компании
          </h1>
          <p className="text-sm text-muted-foreground">
            Афина изучила {domain} — поправьте, если что-то не так.
          </p>
        </div>
      </header>

      {/* ГРУППА 1 · Компания */}
      <Group label="Компания">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field>
            <InlineText
              value={draft.companyName}
              placeholder="Название компании"
              onCommit={(v) => patch({ companyName: v })}
              className="text-base font-medium"
            />
          </Field>
          <Field>
            <DirectionCombobox
              value={draft.directionId}
              onChange={(next) => patch({ directionId: next })}
            />
          </Field>
        </div>
        <ChipEditRow
          items={regions}
          onRemove={(r) => setRegions(regions.filter((x) => x !== r))}
          onAdd={(r) => {
            if (!regions.includes(r)) setRegions([...regions, r]);
          }}
          addPlaceholder="Добавить регион"
          removeLabel={(r) => `Убрать регион ${r}`}
        />
      </Group>

      {/* ГРУППА 2 · О бизнесе */}
      <Group label="О бизнесе">
        <InlineParagraph
          value={draft.aiSummary}
          placeholder="Короткое описание бизнеса"
          onCommit={(v) => patch({ aiSummary: v })}
        />
        <InterestChips
          active={draft.interests}
          suggested={draft.suggestedInterests}
          onAccept={(id) => setDraft((d) => moveSuggestionToActive(d, id))}
          onRemove={(id) => setDraft((d) => moveActiveToSuggestion(d, id))}
        />
      </Group>

      {/* ГРУППА 3 · Коммуникации (единственная группа с микро-лейблами) */}
      <Group label="Коммуникации">
        <LabeledField label="Тон бренда">
          <InlineText
            value={draft.brandTone}
            placeholder="Например, дружелюбный и уверенный"
            onCommit={(v) => patch({ brandTone: v })}
          />
        </LabeledField>
        <LabeledField label="Ключевые сообщения">
          <InlineParagraph
            value={draft.brandMessages}
            placeholder="Что важно доносить в каждом сообщении"
            onCommit={(v) => patch({ brandMessages: v })}
            rows={2}
          />
        </LabeledField>
        <LabeledField label="Исключения">
          <DomainChips
            domains={draft.domainBlocklist}
            onRemove={(dm) =>
              patch({
                domainBlocklist: draft.domainBlocklist.filter((x) => x !== dm),
              })
            }
          />
        </LabeledField>
      </Group>

      {/* Действия: единственный акцент — «Всё верно, продолжить» */}
      <div className="mt-2 flex items-center justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
            Назад
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={confirm}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          Всё верно, продолжить
        </Button>
      </div>
    </motion.div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground/60">{label}</span>
      {children}
    </div>
  );
}

// ── Click-to-edit primitives ──────────────────────────────────────────────────

function InlineText({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setV(value); // seed the edit buffer from the current value on open
          setEditing(true);
        }}
        className={cn(
          "-mx-1.5 -my-0.5 w-full truncate rounded px-1.5 py-0.5 text-left transition-colors hover:bg-white/5",
          !value && "text-muted-foreground",
          className
        )}
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        onCommit(v.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(v.trim());
          setEditing(false);
        }
        if (e.key === "Escape") {
          setV(value);
          setEditing(false);
        }
      }}
      className={cn("h-8", className)}
    />
  );
}

function InlineParagraph({
  value,
  placeholder,
  onCommit,
  rows = 3,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setV(value); // seed the edit buffer from the current value on open
          setEditing(true);
        }}
        className={cn(
          "-mx-1.5 -my-0.5 whitespace-pre-wrap rounded px-1.5 py-0.5 text-left text-sm leading-relaxed transition-colors hover:bg-white/5",
          value ? "text-foreground/90" : "text-muted-foreground"
        )}
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <Textarea
      autoFocus
      rows={rows}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        onCommit(v.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setV(value);
          setEditing(false);
        }
      }}
      className="text-sm leading-relaxed"
    />
  );
}

// ── Chips ─────────────────────────────────────────────────────────────────────

function ChipEditRow({
  items,
  onRemove,
  onAdd,
  addPlaceholder,
  removeLabel,
}: {
  items: string[];
  onRemove: (item: string) => void;
  onAdd: (item: string) => void;
  addPlaceholder: string;
  removeLabel: (item: string) => string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={removeLabel(item)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center rounded-full border border-brand/50 bg-brand-muted px-2 py-0.5">
          <Input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder={addPlaceholder}
            className="h-7 w-40 border-0 bg-transparent px-1 text-sm focus-visible:ring-0"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {addPlaceholder}
        </button>
      )}
    </div>
  );
}

function InterestChips({
  active,
  suggested,
  onAccept,
  onRemove,
}: {
  active: { id: string; label: string }[];
  suggested: { id: string; label: string }[];
  onAccept: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {active.map((it) => (
        <span
          key={it.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground"
        >
          {it.label}
          <button
            type="button"
            onClick={() => onRemove(it.id)}
            aria-label={`Убрать интерес ${it.label}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {/* Предложенные — полупрозрачные, клик добавляет в принятые */}
      {suggested.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onAccept(it.id)}
          aria-label={`Добавить интерес ${it.label}`}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground opacity-70 transition-all hover:border-brand/50 hover:text-foreground hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          {it.label}
        </button>
      ))}
    </div>
  );
}

function DomainChips({
  domains,
  onRemove,
}: {
  domains: string[];
  onRemove: (domain: string) => void;
}) {
  if (domains.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {domains.map((dm) => (
        <span
          key={dm}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-sm text-muted-foreground"
        >
          {dm}
          <button
            type="button"
            onClick={() => onRemove(dm)}
            aria-label={`Убрать исключение ${dm}`}
            className="transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
