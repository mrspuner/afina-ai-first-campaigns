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
