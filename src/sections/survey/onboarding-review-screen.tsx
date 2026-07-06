"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DirectionCombobox } from "./direction-combobox";
import { DirectoryChipsField } from "./directory-chips-field";
import type { ChipItem } from "./directory-options";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { buildInterestDirectory } from "@/data/account-interests";
import { RU_REGIONS } from "@/data/ru-regions";
import { knownTriggerDomains } from "@/data/trigger-domains";
import type { AccountSettings } from "@/types/account-settings";
import type { InterestId } from "@/types/directions";
import type { Survey } from "@/types/survey";

interface OnboardingReviewScreenProps {
  /** Данные предыдущего шага (форма) — наследуем сайт/имя/направление (#3). */
  survey: Survey;
  /** Called after the reviewed data has been committed to accountSettings. */
  onContinue: () => void;
  /** Step back to the website-entry screen. Hidden when omitted. */
  onBack?: () => void;
}

function domainOf(website: string): string {
  return website.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Экран проверки данных (спека #3, редизайн aim 2026-07-06). Полноценная форма
 * с лейблами: значения афины редактируются в видимых полях, а справочные наборы
 * (регионы/интересы/домены) — через чипы + комбобокс-справочник. Данные копятся
 * в локальном стейджинге и пишутся в accountSettings РАЗОМ по «Продолжить».
 */
export function OnboardingReviewScreen({
  survey,
  onContinue,
  onBack,
}: OnboardingReviewScreenProps) {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  // Стейджинг: DEMO/аккаунт как «что поняла афина», но сайт (и имя/направление,
  // если заданы) наследуем из формы — суть бага #3.
  const [draft, setDraft] = useState<AccountSettings>(() => ({
    ...accountSettings,
    companyWebsite: survey.companyWebsite.trim() || accountSettings.companyWebsite,
    companyName: survey.companyName.trim() || accountSettings.companyName,
    directionId: survey.directionId ?? accountSettings.directionId,
  }));

  function patch(p: Partial<AccountSettings>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const regionItems: ChipItem[] = draft.regions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => ({ id: r, label: r }));
  function setRegions(next: ChipItem[]) {
    patch({ regions: next.map((r) => r.label).join(", ") });
  }

  const interestItems: ChipItem[] = draft.interests.map((i) => ({
    id: i.id,
    label: i.label,
  }));
  const interestDirectory = buildInterestDirectory(
    draft.directionId,
    draft.interests.map((i) => i.id)
  );

  const domainItems: ChipItem[] = draft.domainBlocklist.map((d) => ({
    id: d,
    label: d,
  }));

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
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" aria-hidden />
          {domain}
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          Проверьте, что афина поняла о вашей компании
        </h1>
      </header>

      {/* ГРУППА 1 · Компания */}
      <Group label="Компания">
        <Field label="Название компании">
          <Input
            value={draft.companyName}
            placeholder="Название компании"
            onChange={(e) => patch({ companyName: e.target.value })}
          />
        </Field>
        <Field label="Направление">
          <DirectionCombobox
            value={draft.directionId}
            onChange={(next) => patch({ directionId: next })}
          />
        </Field>
        <Field label="Регионы">
          <DirectoryChipsField
            items={regionItems}
            directory={RU_REGIONS}
            onAdd={(item) => {
              if (!regionItems.some((r) => r.id === item.id)) {
                setRegions([...regionItems, item]);
              }
            }}
            onRemove={(id) => setRegions(regionItems.filter((r) => r.id !== id))}
            addLabel="Добавить регион"
            removeLabel={(r) => `Убрать регион ${r.label}`}
          />
        </Field>
      </Group>

      {/* ГРУППА 2 · О бизнесе */}
      <Group label="О бизнесе">
        <Field label="Описание бизнеса">
          <Textarea
            rows={4}
            value={draft.aiSummary}
            placeholder="Короткое описание бизнеса"
            onChange={(e) => patch({ aiSummary: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Интересы">
          <DirectoryChipsField
            items={interestItems}
            directory={interestDirectory}
            onAdd={(item) =>
              patch({
                interests: [
                  ...draft.interests,
                  { id: item.id as InterestId, label: item.label },
                ],
                suggestedInterests: draft.suggestedInterests.filter(
                  (s) => s.id !== item.id
                ),
              })
            }
            onRemove={(id) =>
              patch({
                interests: draft.interests.filter((i) => i.id !== id),
              })
            }
            addLabel="Добавить интерес"
            removeLabel={(i) => `Убрать интерес ${i.label}`}
          />
        </Field>
      </Group>

      {/* ГРУППА 3 · Коммуникации */}
      <Group label="Коммуникации">
        <Field label="Тон бренда">
          <Textarea
            rows={2}
            value={draft.brandTone}
            placeholder="Например, дружелюбный и уверенный"
            onChange={(e) => patch({ brandTone: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Ключевые сообщения">
          <Textarea
            rows={2}
            value={draft.brandMessages}
            placeholder="Что важно доносить в каждом сообщении"
            onChange={(e) => patch({ brandMessages: e.target.value })}
            className="text-sm leading-relaxed"
          />
        </Field>
        <Field label="Исключения (домены)">
          <DirectoryChipsField
            items={domainItems}
            directory={knownTriggerDomains()}
            allowCustom
            onAdd={(item) => {
              const dm = item.label.trim().toLowerCase();
              if (dm && !draft.domainBlocklist.includes(dm)) {
                patch({ domainBlocklist: [...draft.domainBlocklist, dm] });
              }
            }}
            onRemove={(id) =>
              patch({
                domainBlocklist: draft.domainBlocklist.filter((x) => x !== id),
              })
            }
            addLabel="Добавить"
            searchPlaceholder="Домен или поиск"
            removeLabel={(d) => `Убрать исключение ${d.label}`}
          />
        </Field>
      </Group>

      {/* Действия — кнопки визарда: outline «Назад» + default «Продолжить» */}
      <div className="mt-2 flex items-center justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            Назад
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={confirm}>Всё верно, продолжить</Button>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
