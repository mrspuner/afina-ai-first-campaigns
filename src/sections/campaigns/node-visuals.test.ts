import { describe, it, expect, vi, beforeEach } from "vitest";

// Spy on react-dom/server so we can assert WHEN the SVG markup is produced.
// The bug this guards against: pre-rendering icon SVGs at module-eval time
// runs a nested React renderer. When node-visuals is imported during the
// page's server render, that nested render nulls the hooks dispatcher and
// crashes SSR ("Invalid hook call" / "Cannot read properties of null
// (reading 'useContext')"). The markup must be produced lazily, on first
// getNodeIconSvg call (which only ever happens client-side), never at import.
const renderSpy = vi.fn(() => "<svg data-mock=\"icon\" />");
vi.mock("react-dom/server", () => ({
  renderToStaticMarkup: renderSpy,
}));

describe("node-visuals SSR safety", () => {
  beforeEach(() => {
    vi.resetModules();
    renderSpy.mockClear();
  });

  it("does not render any icon SVG at import time", async () => {
    await import("./node-visuals");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("renders lazily on first getNodeIconSvg call and memoizes", async () => {
    const mod = await import("./node-visuals");
    renderSpy.mockClear();

    const first = mod.getNodeIconSvg("sms");
    expect(first).toBe("<svg data-mock=\"icon\" />");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Second call for the same type must hit the cache, not re-render.
    mod.getNodeIconSvg("sms");
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null for node types without an icon", async () => {
    const mod = await import("./node-visuals");
    expect(mod.getNodeIconSvg("nonexistent")).toBeNull();
  });
});

describe("source/scoring node visuals (A2)", () => {
  it("source and scoring have a complete style triple", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    for (const k of ["source", "scoring"] as const) {
      expect(NODE_STYLES[k]).toMatchObject({
        border: expect.any(String),
        bg: expect.any(String),
        color: expect.any(String),
      });
    }
  });
  it("source and scoring have an icon", async () => {
    const { NODE_ICON } = await import("./node-visuals");
    expect(NODE_ICON.source).toBeTruthy();
    expect(NODE_ICON.scoring).toBeTruthy();
  });
});

describe("signal node icon (spec C)", () => {
  it("uses the Radar icon for the signal node type", async () => {
    // Import both from the current module registry state so the reference
    // comparison is robust to the resetModules() other describes run.
    const [{ NODE_ICON }, { Radar }] = await Promise.all([
      import("./node-visuals"),
      import("lucide-react"),
    ]);
    expect(NODE_ICON.signal).toBe(Radar);
  });
});

// Динамический импорт (а не статический сверху файла) — намеренно: этот файл
// мокает `react-dom/server` и объявляет `renderSpy` уже ПОСЛЕ импортов из
// vitest, но ДО импорта node-visuals (который тянет react-dom/server внутрь
// себя). Статический `import { NODE_STYLES } from "./node-visuals"` хойстится
// выше объявления `renderSpy`, и мок-фабрика падает с
// "Cannot access 'renderSpy' before initialization". Остальные describe-блоки
// этого файла по той же причине импортируют node-visuals динамически внутри
// теста — здесь та же схема.
describe("NODE_STYLES — палитра каналов", () => {
  it("каналы различаются по цвету и совпадают с макетом", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    expect(NODE_STYLES.sms.color).toBe("#8ff0c4");
    expect(NODE_STYLES.push.color).toBe("#a9caff");
    expect(NODE_STYLES.email.color).toBe("#d6bcff");
    expect(NODE_STYLES.ivr.color).toBe("#ffcf9e");
  });

  it("email больше не циан — прямой анти-референс PRODUCT.md", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    expect(NODE_STYLES.email.color).not.toBe("#67e8f9");
  });

  it("ни один канал не повторяет цвет другого", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    const colors = ["sms", "push", "email", "ivr"].map((k) => NODE_STYLES[k as "sms"].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("легаси channel держит палитру sms — он её дубль", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    expect(NODE_STYLES.channel).toEqual(NODE_STYLES.sms);
  });

  // Полная тройка (border/bg/color), а не только .color — для этих узлов
  // фон и обводка так же значимы (спека фиксирует все три), проверка одного
  // color пропустила бы расхождение border/bg при совпадающем текстовом цвете.
  it("условие и деление красятся одинаково розовым (полная тройка border/bg/color)", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    expect(NODE_STYLES.condition).toEqual({ border: "#5a2f52", bg: "#241020", color: "#e08bd0" });
    expect(NODE_STYLES.split).toEqual({ border: "#5a2f52", bg: "#241020", color: "#e08bd0" });
  });

  it("пауза — янтарь макета, не брендовый жёлтый (полная тройка border/bg/color)", async () => {
    const { NODE_STYLES } = await import("./node-visuals");
    expect(NODE_STYLES.wait).toEqual({ border: "#4a3c1c", bg: "#2a2314", color: "#f2b34a" });
    expect(NODE_STYLES.wait.color).not.toBe("#FFEC00");
  });
});
