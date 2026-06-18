"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import {
  isWebsiteValid,
  normalizeWebsite,
} from "@/state/survey-validation";
import type { Survey } from "@/types/survey";

interface SurveyFormProps {
  onSubmit: (survey: Survey) => void;
  title?: string;
  subtitle?: string;
}

export function SurveyForm({
  onSubmit,
  title = "С чего начнём — дайте ссылку на ваш сайт",
  subtitle = "По сайту афина поймёт, чем вы занимаетесь, и подберёт подходящие сценарии.",
}: SurveyFormProps) {
  const { survey } = useAppState();
  const dispatch = useAppDispatch();

  const [website, setWebsite] = useState(survey.companyWebsite);
  const [showErrors, setShowErrors] = useState(false);

  const websiteOk = isWebsiteValid(website);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteOk) {
      setShowErrors(true);
      return;
    }
    const filled: Survey = {
      companyName: survey.companyName,
      companyWebsite: normalizeWebsite(website),
      directionId: survey.directionId,
    };
    // Persist the partial as we go so navigation away keeps draft state.
    dispatch({ type: "survey_updated", patch: filled });
    onSubmit(filled);
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="w-full max-w-2xl"
      noValidate
    >
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {subtitle}
        </p>
      </header>
      <Field
        id="survey-website"
        label="Сайт компании"
        error={
          showErrors && !websiteOk
            ? "Введите адрес вида example.com"
            : undefined
        }
      >
        <Input
          id="survey-website"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          aria-invalid={showErrors && !websiteOk ? true : undefined}
        />
      </Field>
      <div className="mt-8 flex items-center justify-between gap-3">
        <span aria-hidden />
        <Button type="submit" variant="default" size="lg">
          Продолжить
        </Button>
      </div>
    </motion.form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
