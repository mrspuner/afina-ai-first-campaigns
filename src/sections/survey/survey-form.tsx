"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { isTaskDescriptionValid } from "@/state/survey-validation";
import type { Survey } from "@/types/survey";

interface SurveyFormProps {
  onSubmit: (survey: Survey) => void;
  title?: string;
  subtitle?: string;
}

export function SurveyForm({
  onSubmit,
  title = "С чего начнём — опишите вашу задачу",
  subtitle = "Опишите, кого хотите привлечь или какую задачу решаете. Афина подберёт подходящие сценарии.",
}: SurveyFormProps) {
  const { survey } = useAppState();
  const dispatch = useAppDispatch();

  const [description, setDescription] = useState(
    survey.taskDescription || survey.companyWebsite,
  );
  const [showErrors, setShowErrors] = useState(false);

  const descriptionOk = isTaskDescriptionValid(description);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descriptionOk) {
      setShowErrors(true);
      return;
    }
    const trimmed = description.trim();
    const filled: Survey = {
      companyName: survey.companyName,
      // Alias: the frozen app-state reducer reads companyWebsite.
      companyWebsite: trimmed,
      taskDescription: trimmed,
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
        id="survey-task"
        label="Ваша задача"
        error={
          showErrors && !descriptionOk
            ? "Опишите задачу хотя бы парой слов"
            : undefined
        }
      >
        <Textarea
          id="survey-task"
          rows={4}
          placeholder="Например: привлечь людей, которые ищут ипотеку"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={showErrors && !descriptionOk ? true : undefined}
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
