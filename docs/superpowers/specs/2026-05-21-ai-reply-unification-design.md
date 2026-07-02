# AI reply — unify into PromptBar slot

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, раздел 8
**Блок:** F из декомпозиции спеки (ответ нейронки)

## 1. Цель

- Удалить плавающий alert-bubble с ответом нейронки, который сейчас рендерится в `workflow-section.tsx` (он уходит за PromptBar при пересечении z-index).
- Ответ показывается **в стеклянной оболочке над PromptBar** через существующий механизм `<PromptBar slot=...>` — тот же визуальный паттерн, что budget-help-answer.
- Сохранить auto-dismiss через 5 секунд и анимацию входа (slide+fade), убрать кнопку «×» (по аналогии с budget-help).

Не входит: изменения механики `ai_reply_shown` / `ai_reply_dismissed` в reducer, перенос dispatch-ов из workflow-view.

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| State `aiReply` | `src/state/app-state.ts:118` | `string \| null` |
| Dispatch `ai_reply_shown` | `src/sections/campaigns/workflow-view.tsx:247,263,370` | при ноде-команде / structural-op |
| Рендер alert-bubble | `src/sections/campaigns/workflow-section.tsx:311-347` | `<AnimatePresence>{aiReply && <motion.div className="pointer-events-auto fixed left-[120px] right-0 z-30 px-8" style={{ bottom: "calc(var(--promptbar-height, 140px) + 8px)" }}>...</motion.div></AnimatePresence>` |
| Auto-dismiss | `src/sections/campaigns/workflow-section.tsx:105-114` | useEffect с timeout 5000ms |
| Z-index клэш | PromptBar `z-30` (prompt-bar.tsx:48) vs alert-bubble `z-30` | bubble и PromptBar на одном уровне — ничья по z-index, порядок в DOM решает |
| Существующий slot-паттерн | `src/sections/shell/shell-bottom-bar.tsx:252-282` | Renders `<DraftQueueList>` + `budget-help-answer` (мascot+текст в `border-white/10 bg-white/5`) |

## 3. Дизайн

### 3.1. Удалить alert-bubble из workflow-section

В `src/sections/campaigns/workflow-section.tsx`:

- Удалить блок `<AnimatePresence>{aiReply && <motion.div ...>}</AnimatePresence>` (строки 311-347).
- Удалить useEffect для auto-dismiss (строки 105-114) и `aiReplyTimerRef` (строка 50).
- Удалить из `useAppState()` `aiReply` (строка 39) — оно больше не используется здесь.
- Удалить импорт `X` из `lucide-react`, если он больше нигде не используется в этом файле, и импорт `Image` from `next/image`.
- `AnimatePresence` import оставить — он используется для других целей в файле (нет — после удаления только этот блок его использовал; проверить в imports после правки).

### 3.2. Перенести рендер в `slot` ShellBottomBar

В `src/sections/shell/shell-bottom-bar.tsx`, в районе формирования `slot` для `<PromptBar>` (строки 252-282), добавить рендер ответа aiReply рядом с draft-queue и budget-help:

```tsx
slot={
  <>
    <DraftQueueList variant="compact" onTakeDraft={() => {}} />
    <AnimatePresence>
      {state.aiReply && (
        <motion.div
          key="ai-reply"
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 6, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
        >
          <Image
            src="/mascot-icon.svg"
            alt=""
            width={16}
            height={16}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span className="leading-snug">{state.aiReply}</span>
        </motion.div>
      )}
    </AnimatePresence>
    {view.kind === "guided-signal" &&
      wizardCurrentStep === 5 &&
      budgetHelpShown ? (
      /* existing budget-help-answer ... */
    ) : undefined}
  </>
}
```

Импорты добавить: `AnimatePresence` (уже импортирован для motion). State `aiReply` уже доступно через `state` локально.

### 3.3. Auto-dismiss — переехать в shell-bottom-bar (или в общий hook)

В `src/sections/shell/shell-bottom-bar.tsx` после получения `state` добавить:

```ts
const aiReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  if (!state.aiReply) return;
  if (aiReplyTimerRef.current) clearTimeout(aiReplyTimerRef.current);
  aiReplyTimerRef.current = setTimeout(() => {
    dispatch({ type: "ai_reply_dismissed" });
  }, 5000);
  return () => {
    if (aiReplyTimerRef.current) clearTimeout(aiReplyTimerRef.current);
  };
}, [state.aiReply, dispatch]);
```

Это полная функциональная замена useEffect, который сейчас в workflow-section. Размещение в shell-bottom-bar — потому что ответ теперь рендерится через slot, и таймер логически принадлежит тому компоненту, который рендерит.

Альтернатива — вынести в хук `useAiReplyAutoDismiss()` и подцепить в page.tsx — это чище, но overhead. Принимаем точечное решение.

### 3.4. Кнопка «×» — удалена

В новом рендере кнопки закрытия нет (по решению развилки). Юзер дожидается auto-dismiss или нового ответа (старый затирается новым в reducer).

### 3.5. Что не меняем

- `ai_reply_shown` / `ai_reply_dismissed` actions — без изменений.
- Места dispatch-а ответа из `workflow-view.tsx` — без изменений.
- `BottomBarSlot` логика в `page.tsx` (`mode === "sidebar"` → null) — без изменений. В drawer-mode ответ не показывается, но это вне scope блока F.
- `ChatPanel` (используется в drawer) — без изменений; AI-ответы в drawer'е работают через собственный механизм chat (`useChat`).

## 4. Тестирование

### Unit

- `app-state.test.ts` уже покрывает `ai_reply_shown` и `ai_reply_dismissed` (строки 394-401). Дополнительных тестов reducer не требуется.
- Если возможно — extract auto-dismiss в hook и unit-тестировать с `vi.useFakeTimers()`. Опционально.

### Manual smoke

1. Открыть workflow editor draft-кампании.
2. В PromptBar ввести команду к ноде (например, кликнуть SMS → ввести «Привет {name}» → Enter).
3. Ожидать: «Думаю...» сначала появляется в slot над PromptBar (стеклянный, с mascot), не за PromptBar.
4. Через ~3-5 секунд там же появляется финальный ответ «Готово, обновил ноду».
5. Через 5 секунд ответ исчезает с анимацией fade-out.
6. Проверить на campaign-screen и section-Кампании, что aiReply (если возникнет) тоже виден над PromptBar.
7. Старого floating bubble с кнопкой `×` нигде нет.

### Edge cases

- Несколько dispatch'ей `ai_reply_shown` подряд: каждый перезатирает state.aiReply. Auto-dismiss таймер ресетится на каждый новый ответ — это уже работает через `clearTimeout` + новый setTimeout.
- view меняется на welcome → BottomBarSlot всё ещё рендерит ShellBottomBar (или ChatPanel — зависит от guided-signal). aiReply на welcome не должен возникать (нет dispatch'а), но если возникнет — он покажется в slot, что приемлемо.
- mode === "sidebar" (drawer открыт): BottomBarSlot возвращает null → slot не рендерится → ответ aiReply не виден. Это поведение сохраняется как было (workflow-section bubble тоже не показывался при открытом drawer). ОК.

## 5. Acceptance criteria (из ТЗ §9 + §8)

- [ ] Alert-bubble за PromptBar удалён (старый блок в workflow-section.tsx больше не рендерится).
- [ ] Ответ нейронки в кампаниях выводится в стеклянной оболочке над PromptBar — паттерн «Афина ИИ» (mascot + текст, фон `bg-white/5`, бордер `border-white/10`).
- [ ] Auto-dismiss через 5 секунд работает.
- [ ] Анимация входа (slide+fade) присутствует.
- [ ] Кнопки «×» нет.

## 6. Файлы, которые будут изменены

- `src/sections/campaigns/workflow-section.tsx` — удалить блок `<AnimatePresence>{aiReply && ...}</AnimatePresence>` (строки 311-347), useEffect auto-dismiss (105-114), aiReplyTimerRef (50), `aiReply` из destructure (39), импорты `X`, `Image`, `AnimatePresence` если не используются.
- `src/sections/shell/shell-bottom-bar.tsx` — добавить рендер aiReply в `slot` (motion.div с mascot + текст); добавить useEffect для auto-dismiss; добавить импорт `AnimatePresence` если не импортирован.

Реализация ведётся в git worktree (`.worktrees/ai-reply-unification` на ветке `feature/ai-reply-unification`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не меняем reducer / actions для aiReply.
- Не выносим auto-dismiss в общий хук (точечная переноска).
- Не трогаем ChatPanel и drawer-логику.
- Не пробрасываем aiReply в welcome-chat (это отдельный flow).
- Не убираем budget-help (он остаётся как параллельный slot-контент).
- Не унифицируем ChatComposer и ShellBottomBar (рефакторинг — отдельная задача).

## 8. Риски

- **Stacking порядок slot-контента**: в slot теперь могут быть одновременно `DraftQueueList`, `aiReply`, `budget-help-answer`. Они идут друг за другом по вертикали (flex-col на PromptBar родительском div). Если в смешанном кейсе высота PromptBar резко вырастает — `--promptbar-height` пересчитается через ResizeObserver, и `pb-promptbar` отступ контента подстроится. Уже работает.
- **Несколько consumer'ов state.aiReply.** Если в будущем понадобится показывать ответ ещё где-то — нужно учесть, что auto-dismiss теперь живёт в ShellBottomBar. Если этот компонент не смонтирован (например, на каком-то новом view) — ответ не самоотменится. Сейчас ShellBottomBar смонтирован на campaign/workflow/section/campaign-select/campaign-payment — этого достаточно для текущего сценария.
- **Drawer mode**: при `mode === "sidebar"` BottomBarSlot возвращает null, slot не рендерится, auto-dismiss timer всё равно ставится (useEffect в ShellBottomBar). Это безопасно — таймер ставит dispatch ai_reply_dismissed, state очистится. Но если ShellBottomBar разимонтируется в drawer-mode (вариант — оборачивающий BottomBarSlot возвращает null до `<ShellBottomBar />`) — useEffect не успеет, и timer не запустится. Проверить в smoke: открыть workflow → команда → drawer → ответ исчезает через 5s или нет.
  - Если не исчезает — переместить таймер в `BottomBarSlot` (которая монтируется всегда, просто рендерит null в sidebar mode).
- **Re-render при новой команде**: dispatch ai_reply_shown с другим текстом → AnimatePresence не делает exit (key="ai-reply" один) → motion.div просто обновляет text. Auto-dismiss timer ресетится (useEffect dep на state.aiReply). Это правильное поведение для «Думаю...» → «Готово, обновил ноду» (одна непрерывная карточка).
