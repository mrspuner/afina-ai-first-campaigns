"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";

/**
 * Прототип-симуляция: ускоренная задержка модерации (та же идея, что
 * `EDIT_DELAY_MS`/`DIGEST_INTERVAL_MS` — не реальный SLA ревью, а достаточная
 * пауза, чтобы UX почувствовался, а не мигнул).
 */
export const MODERATION_DELAY_MS = 6000;

/**
 * Делит список ещё не рассмотренных доменов на approved/rejected —
 * детерминированно-псевдослучайно, тем же Fisher–Yates-приёмом, что и
 * `checkDomainAvailability` (`interests-triggers-editor.tsx`). При ≥2
 * доменах исход гарантированно СМЕШАННЫЙ: случайная точка разреза в
 * `[1, n-1]` всегда оставляет непустую группу по обе стороны. Одиночный
 * pending-домен уходит в любую сторону с равной вероятностью. Чистая функция
 * — тестируема независимо от эффекта/таймера.
 */
export function splitPendingDomains(
  pending: readonly string[],
  rng: () => number = Math.random,
): { approved: string[]; rejected: string[] } {
  if (pending.length === 0) return { approved: [], rejected: [] };

  const shuffled = [...pending];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (shuffled.length === 1) {
    return rng() < 0.5
      ? { approved: shuffled, rejected: [] }
      : { approved: [], rejected: shuffled };
  }

  const cut = 1 + Math.floor(rng() * (shuffled.length - 1));
  return { approved: shuffled.slice(0, cut), rejected: shuffled.slice(cut) };
}

/**
 * Прототип-симуляция таймера модерации (Task 7). Пока в реестре
 * (`accountSettings.ownDomains`, Task 6) есть хотя бы один `pending`-домен,
 * планирует резолюцию через `MODERATION_DELAY_MS`; по срабатыванию резолвит
 * ВЕСЬ текущий пул pending одним диспатчем `domain_moderation_resolved` со
 * смешанным исходом (см. `splitPendingDomains`).
 *
 * Один таймер на весь пул, а не таймер на домен: так срабатывание не может
 * задиспатчить один и тот же домен дважды параллельными таймерами. После
 * резолюции пул пустеет → эффект перезапускается (cleanup снимает более не
 * актуальный таймер) → пока новых pending нет, ничего не планируется. Если
 * новый домен регистрируется, пока предыдущий пул ждёт своей очереди, ключ
 * эффекта меняется и отсчёт задержки для ВСЕГО пула начинается заново — для
 * прототипа это приемлемо (модерация не привязана к конкретному моменту
 * добавления домена, только к «наличию pending»).
 *
 * Аккаунтный уровень: работает с `accountSettings.ownDomains` независимо от
 * текущего экрана/кампании — поэтому монтируется один раз глобально (см.
 * `src/app/page.tsx`), а не только внутри экрана «Настройки», чтобы карточки
 * триггеров (pending-чипы, Task 9) тоже получали резолюцию, даже когда
 * пользователь не смотрит на «Настройки».
 */
export function useDomainModeration(): void {
  const { accountSettings } = useAppState();
  const dispatch = useAppDispatch();

  const pendingDomains = accountSettings.ownDomains
    .filter((d) => d.status === "pending")
    .map((d) => d.domain);

  // Ref держит АКТУАЛЬНЫЙ пул pending на момент срабатывания таймера — без
  // него сработавший таймер захватил бы устаревший список из замыкания
  // эффекта, в котором он был создан (могли добавиться/резолвиться домены).
  // Обновляется отдельным эффектом (без deps — на каждый рендер), а не прямо
  // в теле хука: мутировать ref во время рендера запрещено правилами хуков.
  const pendingRef = useRef(pendingDomains);
  useEffect(() => {
    pendingRef.current = pendingDomains;
  });

  // Ключ, а не сам массив, как зависимость эффекта — иначе эффект
  // перезапускался бы на каждый рендер (новый []-инстанс от .filter/.map).
  const pendingKey = pendingDomains.join("|");

  useEffect(() => {
    if (!pendingKey) return;
    const t = setTimeout(() => {
      const names = pendingRef.current;
      if (names.length === 0) return;
      const { approved, rejected } = splitPendingDomains(names);
      dispatch({ type: "domain_moderation_resolved", approved, rejected });
    }, MODERATION_DELAY_MS);
    return () => clearTimeout(t);
  }, [pendingKey, dispatch]);
}
