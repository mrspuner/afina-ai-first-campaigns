"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { isSurveyMinimallyFilled } from "@/state/survey-validation";
import type { Survey } from "@/types/survey";

interface SurveyFormProps {
  onSubmit: (survey: Survey) => void;
  title?: string;
  subtitle?: string;
}

export function SurveyForm({
  onSubmit,
  title = "С чего начнём — опишите вашу задачу",
  subtitle = "Укажите сайт компании или опишите задачу — достаточно одного. Афина подберёт подходящие сценарии.",
}: SurveyFormProps) {
  const { survey } = useAppState();
  const dispatch = useAppDispatch();

  const [description, setDescription] = useState(survey.taskDescription ?? "");
  const [site, setSite] = useState(survey.companyWebsite ?? "");
  const [showErrors, setShowErrors] = useState(false);

  const minimallyFilled = isSurveyMinimallyFilled({
    companyWebsite: site,
    taskDescription: description,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!minimallyFilled) {
      setShowErrors(true);
      return;
    }
    const filled: Survey = {
      companyName: survey.companyName,
      companyWebsite: site.trim(),
      taskDescription: description.trim(),
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
      <Field id="survey-site" label="Сайт компании">
        <Input
          id="survey-site"
          type="text"
          placeholder="example.com"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        />
      </Field>
      <div className="mt-5">
        <Field id="survey-task" label="Ваша задача">
          <Textarea
            id="survey-task"
            rows={4}
            placeholder="Например: привлечь людей, которые ищут ипотеку"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
      {showErrors && !minimallyFilled ? (
        <p className="mt-3 text-xs text-destructive">
          Заполните хотя бы одно поле — сайт или задачу
        </p>
      ) : null}
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
