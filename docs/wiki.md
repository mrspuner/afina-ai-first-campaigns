# Afina — Project Wiki

Живой документ. Сюда записываем важные решения, стек, соглашения и воркфлоу по проекту.

---

## Стек

### Код

| Слой | Технология | Детали |
|---|---|---|
| Фреймворк | Next.js 16.2.2 | App Router, `src/` dir, алиас `@/*` |
| Язык | TypeScript | Строгий режим |
| Стили | Tailwind CSS v4 | CSS-переменные через `@theme inline` |
| UI-кит | shadcn/ui | На базе `@base-ui/react` (НЕ radix-ui напрямую) |
| Анимации | motion v12 | Импорт только через `"motion/react"` |
| AI-компоненты | Vercel AI Elements | `@/components/ai-elements/` |
| AI SDK | Vercel AI SDK | `ai`, `@ai-sdk/...` — хуки useChat, useCompletion |
| Шрифт | Onest | С кириллицей, тёмная тема по умолчанию |

### Дизайн

| Слой | Технология | Детали |
|---|---|---|
| Инструмент | Figma | Рабочий файл: [AFN-CLP](https://www.figma.com/design/0F9sLO13e6dWABVl5n6CbU/AFN-CLP) |
| Дизайн-система | shadcn/ui (Figma-библиотека) | Подключена к файлу, называется одноимённо с UI-китом в коде |
| Воркфлоу | Figma MCP | Захват браузера → Figma через `generate_figma_design` |

### Соглашения по дизайну в Figma

- Все фреймы собираются на **Auto Layout** — ручное позиционирование не используется
- Компоненты берутся из подключённой библиотеки shadcn/ui, не рисуются вручную
- Цвета и отступы привязываются к переменным дизайн-системы, не хардкодятся

---

## Воркфлоу

### Код → Figma

1. Dev-сервер запущен на `localhost:3000`
2. Claude запускает `generate_figma_design` — делает захват браузера и добавляет фрейм в Figma-файл
3. Дизайнер вносит правки в Figma
4. Claude читает правки через `get_design_context` и реализует в коде

### Планирование и реализация

- Спеки сохраняются в `docs/superpowers/specs/YYYY-MM-DD-<тема>.md`
- Планы реализации — в `docs/superpowers/plans/YYYY-MM-DD-<тема>.md`
- Реализация ведётся через задачи по плану (executing-plans или subagent-driven)
- История реализованных флоу — в `git log` и в файлах спек/планов (не дублируется здесь)

---

## Известные особенности стека

- `Button` использует `@base-ui/react/button` — `disabled` prop работает стандартно
- `DropdownMenuTrigger` не поддерживает `asChild` — стилизовать напрямую через className
- `Progress` экспортирует: `Progress`, `ProgressTrack`, `ProgressIndicator`, `ProgressLabel`, `ProgressValue`
- Pre-existing TypeScript ошибки в `src/components/ai-elements/` — не наши, игнорировать
- `motion` импортируется только из `"motion/react"`, не из `"framer-motion"`