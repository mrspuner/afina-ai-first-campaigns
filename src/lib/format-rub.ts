/** «1 234 ₽» / «0,5 ₽» — plain rouble value with a trailing sign (ru-RU grouping). */
export function formatRubPlain(n: number): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}
