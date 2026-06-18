"use client";

import Image from "next/image";
import {
  Search,
  Bell,
  Megaphone,
  Files,
  BarChart2,
  Wallet,
  Settings,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppState } from "@/state/app-state-context";
import { cn } from "@/lib/utils";
import type { SectionName } from "@/state/app-state";

interface AppSidebarProps {
  activeNav?: SectionName;
  onNavChange?: (nav: SectionName) => void;
  onLaunchOpen?: () => void;
  onLogoClick?: () => void;
  flyoutOpen?: boolean;
}

export function AppSidebar({
  activeNav,
  onNavChange,
  onLaunchOpen,
  onLogoClick,
  flyoutOpen = false,
}: AppSidebarProps) {
  const { balance, notifications } = useAppState();

  const navItems = [
    { icon: Megaphone, label: "Кампании" },
    { icon: Files, label: "Артефакты" },
    { icon: BarChart2, label: "Статистика" },
  ] as const satisfies ReadonlyArray<{ icon: typeof Bell; label: SectionName }>;

  return (
    <aside className={cn("flex h-screen w-[120px] shrink-0 flex-col justify-between transition-colors", flyoutOpen ? "bg-card" : "bg-background")}>
      {/* Верхняя группа: лого + навигация */}
      <div className="flex flex-col gap-5">
        {/* Logo */}
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="На главный экран"
          className="p-5 text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image src="/logo.svg" alt="Afina" width={80} height={20} priority />
        </button>

        <nav className="flex flex-col gap-6 px-2">
          {/* Последнее */}
          <button
            onClick={onLaunchOpen}
            className="flex h-[68px] flex-col items-center gap-1 rounded-md py-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="h-6 w-6" />
            <span className="text-xs font-medium">Последнее</span>
          </button>

          {/* Основная навигация */}
          <div className="flex flex-col">
            {navItems.map(({ icon: Icon, label }) => {
              const showBadge = label === "Артефакты" && notifications.signalsBadge;
              return (
                <button
                  key={label}
                  onClick={() => onNavChange?.(label)}
                  className={cn(
                    "relative flex h-[68px] flex-col items-center gap-1 rounded-md py-3 transition-colors",
                    activeNav === label
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon className="h-6 w-6" />
                    {showBadge && (
                      <span
                        aria-label="Есть новые сигналы"
                        className="absolute -right-1.5 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background"
                      />
                    )}
                  </span>
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Подвал */}
      <div className="flex flex-col gap-3 pt-3">
        <div className="flex flex-col gap-0.5 px-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Баланс
          </p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              balance === 0 ? "text-muted-foreground" : "text-foreground"
            )}
          >
            ₽ {balance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md px-5 py-2 transition-colors hover:bg-accent">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                АК
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden px-2.5 text-left">
              <p className="truncate text-xs font-medium text-foreground">
                Арслан К.
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                arslan@afina.ai
              </p>
            </div>
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuItem onClick={() => onNavChange?.("Настройки")}>
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
