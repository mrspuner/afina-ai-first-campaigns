# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать структуру и визуальное оформление сайдбара: новый порядок пунктов, вертикальный layout иконки+текста, flyout-панель «Запустить», убрать border и выровнять фон с рабочей зоной.

**Architecture:** Состояние открытия flyout живёт в `page.tsx` и передаётся вниз пропсами. `AppSidebar` получает `onLaunchOpen` колбэк и вызывает его при клике на «Запустить». `LaunchFlyout` — отдельный компонент, рендерится на уровне страницы поверх контента через `fixed`-позиционирование.

**Tech Stack:** Next.js 16, React, Tailwind CSS v4, shadcn/ui на базе `@base-ui/react`, lucide-react иконки.

---

## File Map

| Файл | Действие | Что делает |
|---|---|---|
| `src/components/app-sidebar.tsx` | Modify | Новая структура: вертикальные nav-пункты, убран border и секция «Недавние», обновлён dropdown |
| `src/components/launch-flyout.tsx` | Create | Flyout-панель «Запустить» с двумя секциями карточек |
| `src/app/page.tsx` | Modify | Добавить `launchOpen` state, прокинуть в sidebar и flyout |

---

## Task 1: Обновить `app-sidebar.tsx` — структура и визуал

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Заменить содержимое `app-sidebar.tsx`**

Полностью заменить файл следующим кодом:

```tsx
"use client";

import Image from "next/image";
import {
  Rocket,
  Bell,
  Megaphone,
  BarChart2,
  Wallet,
  Settings,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeNav?: string;
  onNavChange?: (nav: string) => void;
  onLaunchOpen?: () => void;
}

export function AppSidebar({
  activeNav = "Кампании",
  onNavChange,
  onLaunchOpen,
}: AppSidebarProps) {
  const navItems = [
    { icon: Bell, label: "Сигналы", badge: 3 },
    { icon: Megaphone, label: "Кампании", badge: 2 },
    { icon: BarChart2, label: "Статистика" },
  ];

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col bg-background">
      {/* Logo */}
      <div className="px-4 py-5">
        <Image src="/logo.svg" alt="Afina" width={80} height={24} priority />
      </div>

      <nav className="flex flex-col px-2">
        {/* Запустить — первый, отбит отступом снизу */}
        <button
          onClick={onLaunchOpen}
          className="mb-6 flex flex-col items-center gap-1 rounded-md px-3 py-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Rocket className="h-6 w-6" />
          <span className="text-xs font-medium">Запустить</span>
        </button>

        {/* Основная навигация */}
        {navItems.map(({ icon: Icon, label, badge }) => (
          <button
            key={label}
            onClick={() => onNavChange?.(label)}
            className={cn(
              "relative flex flex-col items-center gap-1 rounded-md px-3 py-3 transition-colors",
              activeNav === label
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <span className="relative">
              <Icon className="h-6 w-6" />
              {badge !== undefined && (
                <Badge className="absolute -right-2.5 -top-2 h-4 min-w-4 px-1 text-[10px] leading-none">
                  {badge}
                </Badge>
              )}
            </span>
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Подвал */}
      <div className="px-2 py-3">
        <div className="mb-3 px-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Баланс
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            ₽ 24 800
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-accent">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  АК
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate text-xs font-medium text-foreground">
                  Арслан К.
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  arslan@afina.ai
                </p>
              </div>
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Wallet className="mr-2 h-4 w-4" />
              Финансы
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Проверить что нет TypeScript-ошибок**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | grep app-sidebar
```

Ожидаемый вывод: пусто (нет ошибок по этому файлу).

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: redesign sidebar — vertical nav layout, remove border, update dropdown"
```

---

## Task 2: Создать `launch-flyout.tsx`

**Files:**
- Create: `src/components/launch-flyout.tsx`

- [ ] **Step 1: Создать файл**

```tsx
"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LaunchFlyoutProps {
  open: boolean;
  onClose: () => void;
}

const signalCards = [
  { title: "Реактивация", description: "Вернуть пользователей, переставших быть активными" },
  { title: "Удержание", description: "Предотвратить отток перед ключевыми точками" },
  { title: "Апсейл", description: "Предложить переход на старший план" },
];

const campaignCards = [
  { title: "С нуля", description: "Настроить кампанию под конкретную задачу вручную" },
  { title: "Онбординг", description: "Шаблон для новых пользователей" },
  { title: "Реактивация", description: "Шаблон для возврата неактивных" },
];

function ScenarioCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

export function LaunchFlyout({ open, onClose }: LaunchFlyoutProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop — клик закрывает */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Панель */}
      <div
        className={cn(
          "fixed inset-y-0 left-[220px] z-50 flex w-[360px] flex-col bg-background shadow-xl"
        )}
      >
        {/* Шапка панели */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Запустить</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Секция 1 */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Запустить поиск сигналов
          </p>
          <div className="mb-6 flex flex-col gap-2">
            {signalCards.map((card) => (
              <ScenarioCard key={card.title} {...card} onClick={onClose} />
            ))}
          </div>

          {/* Секция 2 */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Запустить новую кампанию
          </p>
          <div className="flex flex-col gap-2">
            {campaignCards.map((card) => (
              <ScenarioCard key={card.title} {...card} onClick={onClose} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Проверить TypeScript**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | grep launch-flyout
```

Ожидаемый вывод: пусто.

- [ ] **Step 3: Commit**

```bash
git add src/components/launch-flyout.tsx
git commit -m "feat: add LaunchFlyout overlay panel with two sections"
```

---

## Task 3: Обновить `page.tsx` — подключить flyout

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Заменить содержимое `page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignWorkspace } from "@/components/campaign-workspace";
import { StatisticsView } from "@/components/statistics-view";
import { LaunchFlyout } from "@/components/launch-flyout";

export default function Home() {
  const [activeNav, setActiveNav] = useState("Кампании");
  const [launchOpen, setLaunchOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onLaunchOpen={() => setLaunchOpen(true)}
      />
      <LaunchFlyout open={launchOpen} onClose={() => setLaunchOpen(false)} />
      {activeNav === "Статистика" ? (
        <StatisticsView />
      ) : (
        <CampaignWorkspace />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Проверить TypeScript**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1
```

Ожидаемый вывод: только уже известная ошибка в `src/components/ai-elements/attachments.tsx:375` — её игнорируем. Новых ошибок нет.

- [ ] **Step 3: Запустить dev-сервер и проверить вручную**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npm run dev
```

Открыть `http://localhost:3000` и проверить:
- [ ] Сайдбар без border-r (нет видимой линии между ним и рабочей зоной)
- [ ] Фон сайдбара совпадает с фоном рабочей зоны
- [ ] Пункты навигации: иконка сверху, текст снизу
- [ ] «Запустить» первый, отбит от остальных
- [ ] Клик на «Запустить» → flyout выезжает поверх контента
- [ ] Крестик закрывает flyout
- [ ] Клик вне flyout закрывает flyout
- [ ] Dropdown аватара содержит: Настройки, Финансы, Выйти

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire LaunchFlyout into page with open/close state"
```
