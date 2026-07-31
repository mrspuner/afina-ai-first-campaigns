import { test, expect } from "./screens/smoke.fixture";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

/**
 * Ревью Task 4 (fix round): юнит-тест `stage-rail` в jsdom проверяет только
 * присутствие узла в DOM — jsdom не считает layout/paint, поэтому НЕВИДИМЫЙ
 * рельс (тот самый баг, который был найден и исправлен добавлением `isolate`
 * на `<li>` — см. отчёт задачи) для него неотличим от видимого. Этот спек
 * проверяет РЕАЛЬНЫЙ рендер в браузере: в точке, где должен проходить рельс
 * (центр между бейджами двух соседних шагов), верхним элементом обязан быть
 * ИМЕННО он — `document.elementFromPoint` возвращает узел `[data-testid=
 * 'stage-rail']`, а не `<li>` (что и произошло бы, сними кто-нибудь `isolate`
 * с `<li>` или измени стековый контекст `CardSection`: `-z-10` рельса тогда
 * снова всплывёт до чужого стекового контекста и утонет за фоном карточки).
 *
 * Не `@visual` — пиксельный дифф не даёт осмысленной причины падения (просто
 * «дифф» без объяснения) и требует апдейта базлайнов, которые эта задача
 * специально не трогает. Здесь падение конкретно и читаемо: «в точке рельса
 * оказался не рельс».
 */
test.describe("таймлайн-рельс — реальный стекинг в браузере", () => {
  test("в точке между бейджами двух соседних шагов верхний элемент — сам рельс", async ({
    page,
  }) => {
    const screen = SCREENS.find((s) => s.id === "campaign-card")!;
    await seedScreen(page, screen);

    const badges = page.locator("[data-testid='stage-number']");
    await expect(badges.first()).toBeVisible();
    expect(await badges.count()).toBeGreaterThanOrEqual(2);

    const first = await badges.nth(0).boundingBox();
    const second = await badges.nth(1).boundingBox();
    if (!first || !second) throw new Error("bounding box бейджа не получен");

    // Середина по вертикали между низом первого бейджа и верхом второго —
    // ровно там, где сегмент рельса соединяет их (см. геометрию в
    // workflow-description.tsx: top-3.5 центра своего бейджа, -bottom-[34px]
    // до центра следующего).
    const x = first.x + first.width / 2;
    const y = (first.y + first.height + second.y) / 2;

    const topElementTestId = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.getAttribute("data-testid") ?? null,
      [x, y] as [number, number],
    );

    expect(topElementTestId).toBe("stage-rail");
  });
});
