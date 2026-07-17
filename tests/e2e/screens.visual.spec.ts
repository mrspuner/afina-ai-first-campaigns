import { test, expect, type Page } from "@playwright/test";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

/** Скрытая высота самого «глубокого» внутреннего скроллера страницы. */
async function hiddenHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let max = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      if (el.clientHeight < 200) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      max = Math.max(max, el.scrollHeight - el.clientHeight);
    }
    return max;
  });
}

/**
 * Приложение скроллится ВНУТРЕННИМ контейнером (`overflow-y-auto`), а не
 * документом: `document.scrollHeight` всегда равен высоте вьюпорта. Поэтому
 * `fullPage: true` снимает только первый экран — на карточке кампании так
 * терялось 500 px (треть содержимого, включая весь блок «Статистика»).
 *
 * Для экранов с `expand: true` растягиваем вьюпорт ровно на скрытую высоту
 * (один проход) и проверяем, что скрытого не осталось. Если осталось — падаем:
 * лучше явная ошибка, чем снапшот, молча снимающий половину экрана.
 *
 * Шаги визарда НЕ расширяем: их контент центрируется по высоте экрана и растёт
 * вместе с вьюпортом — расширение уходит в разнос (см. Screen.expand).
 */
async function expandViewportToContent(page: Page) {
  const raw = await hiddenHeight(page);
  if (raw <= 0) return;

  // scrollHeight гуляет на ±1px между прогонами (субпиксельное округление), а от
  // него зависит высота кадра — снапшот падал бы «1947 vs 1948». Квантуем добавку
  // до кратной 8 с запасом, чтобы высота была одинаковой от прогона к прогону.
  const hidden = Math.ceil((raw + 4) / 8) * 8;

  const vp = page.viewportSize();
  if (!vp) return;
  await page.setViewportSize({ width: vp.width, height: vp.height + hidden });
  await page.waitForTimeout(250);

  const left = await hiddenHeight(page);
  expect(
    left,
    `после расширения вьюпорта осталось ${left}px скрытого контента — ` +
      `снапшот снял бы не весь экран. Проверь Screen.expand для этого экрана.`,
  ).toBeLessThanOrEqual(4);
}

test.describe("@visual screens", () => {
  // Экраны без baseline PNG (visual: false) остаются в SCREENS для smoke, но
  // выпадают из пиксельного сравнения — иначе test:visual падает на
  // отсутствующем снапшоте.
  for (const screen of SCREENS.filter((s) => s.visual !== false)) {
    test(`visual: ${screen.name} (${screen.id})`, async ({ page }) => {
      await seedScreen(page, screen);
      if (screen.expand) await expandViewportToContent(page);
      await expect(page).toHaveScreenshot(`${screen.id}.png`, {
        fullPage: true,
        mask: (screen.mask ?? []).map((s) => page.locator(s)),
      });
    });
  }
});
