import { test, expect } from "./screens/smoke.fixture";
import { seedScreen } from "./screens/seed";
import { SCREENS } from "./screens/catalog";

/**
 * Proves PromptBar hints are co-located with their screen end-to-end:
 *  - a wizard step shows the set IT declared via useScreenHints (and no longer
 *    the wrong set the old numeric step→hints map produced — the interests
 *    screen used to render the БАЗА/«объём» questions because of index drift);
 *  - a non-wizard screen still gets its hints through the selector unchanged.
 */

function screenById(id: string) {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`screen "${id}" not found in catalog`);
  return s;
}

// Any interests-step question (every useScreenHints branch). The exact branch
// depends on the seeded prefill, so match the union of branch labels.
const INTERESTS_HINT =
  /(С чего начать|Откуда вы берёте интересы|Что такое триггер|Стоит ли сузить набор|Можно ли расширить охват|Этот набор подойдёт|Зачем триггеры|Какие домены выбрать|Можно ли без триггеров|Зачем интересы|Какие интересы подойдут|Не пересекаются ли они)/;

test.describe("co-located PromptBar hints", () => {
  test("wizard interests screen shows the hints it declared (not the old misaligned set)", async ({
    page,
  }) => {
    await seedScreen(page, screenById("wizard-3-interests"));

    // The interests step published its own questions into screenHints.
    await expect(
      page.getByRole("button", { name: INTERESTS_HINT }).first()
    ).toBeVisible();

    // The old index→hints map showed the «объём» question on this screen
    // (index 3 mapped to the volume set). Co-location removed it entirely.
    await expect(page.getByText("От чего зависит объём?")).toHaveCount(0);
    // ...and budget questions belong to the budget screen, not here.
    await expect(page.getByText("Как рассчитывается бюджет?")).toHaveCount(0);
  });

  test("non-wizard screen (Статистика) still resolves its hints via the selector", async ({
    page,
  }) => {
    await seedScreen(page, screenById("section-statistics"));
    await expect(
      page.getByRole("button", { name: "Разрез по кампаниям" })
    ).toBeVisible();
  });
});
