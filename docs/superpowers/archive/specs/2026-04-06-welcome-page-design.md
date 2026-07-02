# Welcome Page Design

## Overview

A centered welcome screen shown in the main work area when the user has no active campaigns. The sidebar has no active nav item. The page guides new users through three sequential steps toward their first campaign.

## Layout

- Positioned: fully centered vertically and horizontally in the work area (the area to the right of the sidebar)
- Sidebar state: no active nav item (`activeNav = null`)
- Max content width: ~480px

## Content (top to bottom)

### 1. Heading
- **Title:** «Добро пожаловать» — large, bold
- **Subtitle:** «Три шага до первой кампании — начните с получения сигналов» — small, muted, centered

### 2. Chat Input (`PromptInput`)
- Uses the existing `PromptInput` / `PromptInputProvider` component from `@/components/ai-elements/prompt-input`
- Placeholder: «Выберите шаг или задайте вопрос…»
- Textarea + submit button (standard `PromptInputTextarea` + `PromptInputSubmit`)
- No additional toolbar buttons needed for v1

### 3. Step Badges (below the input)
Three vertically stacked compact badge-cards:

| # | Label | State |
|---|-------|-------|
| Шаг 1 | Получение сигнала | Active — clickable |
| Шаг 2 | Запуск кампании | Disabled — dimmed (opacity ~35%), not clickable |
| Шаг 3 | Статистика кампании | Disabled — dimmed (opacity ~35%), not clickable |

**Badge anatomy (each row):**
- Step label (e.g. «Шаг 1») — small, muted, fixed width
- Vertical divider
- Step name — regular weight
- Chevron right icon (active only)

Steps 2 and 3 unlock progressively as the user completes the previous step. For v1, steps 2 and 3 are always disabled (no unlock logic yet).

## Click Behavior (Step 1)

Clicking «Шаг 1 · Получение сигнала» sets `activeNav = "Кампании"` and navigates into the campaign wizard at step 1 (`CampaignWorkspace`). This is the same screen as the existing campaign creation flow.

Step 1 of the wizard displays:
- **Title:** «Выберите тип сигнала»
- **Subtitle:** «Выберите сценарий, мы зададим нужные вопросы»

## Component

New file: `src/components/welcome-view.tsx`

No new routes needed. The welcome view is rendered in `src/app/page.tsx` when `activeNav === null` (new initial state), replacing the current default of `"Кампании"`.

## Sidebar Change

Change `activeNav` default from `"Кампании"` to `null`. When `activeNav === null`, render `<WelcomeView>` in the work area.
