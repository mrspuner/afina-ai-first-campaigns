"use client";

import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { SignalsTab } from "./signals-tab";
import { TemplatesTab } from "./templates-tab";

/**
 * Артефакты — display surface for campaign outputs. Two quiet line tabs:
 * Сигналы (campaign artifacts) and Шаблоны (reusable message templates).
 * Manual signal create/upload and segments are removed by design (spec block 13).
 */
export function ArtifactsSection() {
  const { notifications } = useAppState();
  const dispatch = useAppDispatch();

  // Opening the section clears the sidebar badge.
  useEffect(() => {
    if (notifications.signalsBadge) {
      dispatch({ type: "signals_badge_set", value: false });
    }
    // Run only on mount of this section to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[140px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <h1 className="mb-6 text-[38px] font-semibold leading-[46px] tracking-tight">
          Артефакты
        </h1>
        <Tabs defaultValue="signals">
          <TabsList variant="line">
            <TabsTrigger value="signals">Сигналы</TabsTrigger>
            <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          </TabsList>
          <TabsContent value="signals" className="mt-6">
            <SignalsTab />
          </TabsContent>
          <TabsContent value="templates" className="mt-6">
            <TemplatesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
