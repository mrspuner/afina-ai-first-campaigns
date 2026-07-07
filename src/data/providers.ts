export interface Provider {
  id: string;
  name: string;
  /** ms до выхода на конечный статус; null — застревает на ранней стадии */
  connectAfterMs: number | null;
  /** конечный объём сигналов в день (показывается, когда провайдер подключён) */
  finalSignalsPerDay: number;
  /** потенциал в день (показывается, пока провайдер ещё подключается) */
  potentialSignalsPerDay: number;
  /** стадия, на которой застревает stuck-провайдер */
  stuckStage?: "Подключение" | "Премодерация";
}

export const PROVIDERS: Provider[] = [
  { id: "beeline", name: "Билайн",  connectAfterMs: 6000,  finalSignalsPerDay: 5,  potentialSignalsPerDay: 2000 },
  { id: "megafon", name: "Мегафон", connectAfterMs: 14000, finalSignalsPerDay: 12, potentialSignalsPerDay: 4000 },
  { id: "mts",     name: "МТС",     connectAfterMs: 23000, finalSignalsPerDay: 8,  potentialSignalsPerDay: 3000 },
  { id: "tele2",   name: "Tele2",   connectAfterMs: null, finalSignalsPerDay: 0,  potentialSignalsPerDay: 5000, stuckStage: "Премодерация" },
];

export const PROVIDER_STAGES = ["Подключение", "Премодерация", "Подключён"] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];
