/** Generic campaign name in the «Сценарий №N» format. */
export function defaultCampaignName(scenarioName: string, n: number): string {
  return `${scenarioName} №${n}`;
}
