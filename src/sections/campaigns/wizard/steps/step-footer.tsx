import { Button } from "@/components/ui/button";

/**
 * Единый футер шага визарда: «Назад» (лёгкий бордер) прижат к левому краю
 * контейнера, основная кнопка («Продолжить» / «Далее» / «Запустить») — к
 * правому. `justify-between` держит их по краям; когда `onBack` нет (первый
 * шаг с футером), пустой спейсер сохраняет основную кнопку справа.
 */
export function StepFooter({
  onBack,
  onContinue,
  continueLabel = "Продолжить",
  continueDisabled,
  continueClassName,
  hint,
  backLabel = "Назад",
}: {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueClassName?: string;
  hint?: string;
  /** Изолированная сессия правки шага (Task 12) читает здесь «Отмена» вместо
   *  обычного «Назад» — у неё нет предыдущего шага, есть только выход без
   *  коммита. */
  backLabel?: string;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            {backLabel}
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <Button
          disabled={continueDisabled}
          onClick={onContinue}
          className={continueClassName}
        >
          {continueLabel}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
