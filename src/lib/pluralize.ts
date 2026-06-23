/**
 * Russian count of «раз» (template-usage count).
 * one  → раз   (1, 21, 31… but not 11)
 * few  → раза  (2-4, 22-24… but not 12-14)
 * many → раз   (0, 5-20, …)
 */
export function pluralizeRaz(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word: string;
  if (mod10 === 1 && mod100 !== 11) word = "раз";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    word = "раза";
  else word = "раз";
  return `${n} ${word}`;
}
