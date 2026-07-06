# aim — режим «Область» со скриншотом · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в скилл aim режим выделения прямоугольной области с приложением скриншота всего вьюпорта, на котором выделенная область помечена рамкой — чтобы агент понимал, на какую зону экрана указывает пользователь.

**Architecture:** Клиент-сайд: оверлей армируется тумблером/шорткатом, ловит drag-рамку, растеризует вьюпорт через вендоренный `snapdom`, дорисовывает рамку + затемнение на canvas, шлёт PNG в хелпер-сервер. Сервер сохраняет PNG в `.claude/aim/shots/<id>.png` и кладёт в событие только путь. `to-md` встраивает картинку в punch-list. Никакого MCP.

**Tech Stack:** Node ESM (`.mjs`), встроенный `http`, `@zumer/snapdom` 2.15.0 (вендоренный, отдаётся сервером), браузерный Canvas 2D, `node:test` для серверных/рендер-тестов.

> **ВАЖНО — целевая директория:** весь код скилла живёт в **`~/.claude/skills/aim/`** (вне репозитория проекта; `~/.claude` — НЕ git-репозиторий). Поэтому «коммитов» на таски нет — вместо них чекпоинт: тесты зелёные / ручной smoke. Task 0 делает бэкап скилла как точку отката. Спека и этот план версионируются в репозитории проекта.

> **Пути:** ниже `AIM=~/.claude/skills/aim`. Все `node`/`node --test` запускать из `$AIM` (`cd ~/.claude/skills/aim`).

---

## File Structure

| Файл | Ответственность | Действие |
|---|---|---|
| `$AIM/scripts/vendor/snapdom.min.js` | Вендоренный snapdom (ESM, экспорт `snapdom`) | Create |
| `$AIM/scripts/server.mjs` | Отдача `/snapdom.js`; приём region-payload, запись PNG, сборка `event.screenshot`; лимит тела | Modify |
| `$AIM/scripts/overlay.js` | Режим «Область»: тумблер+шорткат, capture-слой, marquee, region-fiber, snapdom-захват+разметка+даунскейл, отправка | Modify |
| `$AIM/scripts/to-md.mjs` | Встраивание скрина + region/components в markdown | Modify |
| `$AIM/SKILL.md` | Секция «Handling a region event», триггеры, workflow | Modify |
| `$AIM/tests/helpers.mjs` | Тест-хелперы (free port, spawn сервера, health) | Create |
| `$AIM/tests/server.test.mjs` | Тесты `/snapdom.js` и region-`/click` | Create |
| `$AIM/tests/to-md.test.mjs` | Тест рендера скрина в markdown | Create |

---

## Task 0: Бэкап скилла (точка отката)

**Files:** только чтение/копирование, ничего в репозитории.

- [ ] **Step 1: Снять бэкап рабочего скилла**

Скилл не под git — делаем архив перед правками.

Run:
```bash
mkdir -p /private/tmp/claude-501/-Users-macintosh-Documents-work-afina-ai-first-campaing-centric/2b033bd9-2ce0-4671-bbbe-4dbacae6deba/scratchpad
tar czf "/private/tmp/claude-501/-Users-macintosh-Documents-work-afina-ai-first-campaing-centric/2b033bd9-2ce0-4671-bbbe-4dbacae6deba/scratchpad/aim-backup-20260706.tgz" -C ~/.claude/skills aim
ls -la "/private/tmp/claude-501/-Users-macintosh-Documents-work-afina-ai-first-campaing-centric/2b033bd9-2ce0-4671-bbbe-4dbacae6deba/scratchpad/aim-backup-20260706.tgz"
```
Expected: архив создан, размер > 0. Откат при поломке: `tar xzf <архив> -C ~/.claude/skills`.

---

## Task 1: Вендор snapdom + отдача `/snapdom.js`

**Files:**
- Create: `$AIM/scripts/vendor/snapdom.min.js`
- Create: `$AIM/tests/helpers.mjs`
- Create: `$AIM/tests/server.test.mjs`
- Modify: `$AIM/scripts/server.mjs` (новый GET-роут + eager read)

- [ ] **Step 1: Вендорнуть snapdom (asset, не логика)**

Run:
```bash
cd ~/.claude/skills/aim/scripts
mkdir -p vendor
cd vendor
npm pack @zumer/snapdom@2.15.0
tar xzf zumer-snapdom-2.15.0.tgz package/dist/snapdom.mjs
mv package/dist/snapdom.mjs snapdom.min.js
rm -rf package zumer-snapdom-2.15.0.tgz
node -e 'const s=require("fs").readFileSync("snapdom.min.js","utf8");if(!/export\{[^}]*\bas snapdom\b/.test(s))throw new Error("snapdom export not found");console.log("ok, bytes:",s.length)'
```
Expected: `ok, bytes: ~132000`. Файл `$AIM/scripts/vendor/snapdom.min.js` существует, экспортирует `snapdom`.

- [ ] **Step 2: Написать тест-хелперы**

Create `$AIM/tests/helpers.mjs`:
```js
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SCRIPTS = path.join(import.meta.dirname, "..", "scripts");

export function getFreePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

export function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aim-test-"));
}

export async function startServer(projectRoot, port) {
  const proc = spawn(
    "node",
    [path.join(SCRIPTS, "server.mjs"), "--project", projectRoot, "--port", String(port)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitHealth(port, 4000);
  return proc;
}

async function waitHealth(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server did not become healthy");
}
```

- [ ] **Step 3: Написать падающий тест на `/snapdom.js`**

Create `$AIM/tests/server.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getFreePort, tmpProject, startServer } from "./helpers.mjs";

test("GET /snapdom.js serves the vendored module", async () => {
  const proj = tmpProject();
  const port = await getFreePort();
  const proc = await startServer(proj, port);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/snapdom.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") || "", /javascript/);
    const body = await r.text();
    assert.match(body, /snapdom/);
  } finally {
    proc.kill();
  }
});
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `cd ~/.claude/skills/aim && node --test tests/server.test.mjs`
Expected: FAIL — `/snapdom.js` отдаёт 404 (роут ещё не добавлен).

- [ ] **Step 5: Добавить роут в server.mjs**

В `$AIM/scripts/server.mjs` после чтения `overlaySource` (сейчас строки 20–23) добавить eager-read вендор-файла:
```js
const snapdomSource = fs.readFileSync(
  path.join(__dirname, "vendor", "snapdom.min.js"),
  "utf8",
);
```

Затем сразу после блока `GET /overlay.js` (после его `return;`, сейчас ~строка 38) вставить:
```js
  if (req.method === "GET" && url.pathname === "/snapdom.js") {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(snapdomSource);
    return;
  }
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `cd ~/.claude/skills/aim && node --test tests/server.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 7: Чекпоинт**

Тест зелёный, вендор-файл на месте. (Скилл не под git — коммита нет.)

---

## Task 2: Сервер принимает region-payload, пишет PNG, собирает `event.screenshot`

**Files:**
- Modify: `$AIM/scripts/server.mjs` (`normalizeEvent` + `/click` handler + лимит тела)
- Modify: `$AIM/tests/server.test.mjs` (добавить кейс)

- [ ] **Step 1: Написать падающий тест на region-`/click`**

Добавить в конец `$AIM/tests/server.test.mjs`:
```js
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("POST /click region stores PNG and keeps inbox lean", async () => {
  const proj = tmpProject();
  const port = await getFreePort();
  const proc = await startServer(proj, port);
  try {
    const payload = {
      mode: "queue",
      url: "http://localhost:3000/x",
      comment: "fix this area",
      kind: "region",
      region: { x: 10, y: 20, w: 100, h: 50 },
      fiber: { region: true, ancestor: "Wizard", components: ["Card"] },
      shotData: "data:image/png;base64," + PNG_1x1,
      shotMeta: { w: 100, h: 50, viewport: { w: 1440, h: 900 } },
    };
    const r = await fetch(`http://127.0.0.1:${port}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    assert.ok(j.ok);
    assert.ok(j.id);

    const shot = path.join(proj, ".claude", "aim", "shots", `${j.id}.png`);
    assert.ok(fs.existsSync(shot), "png written");
    assert.ok(fs.statSync(shot).size > 0, "png non-empty");

    const raw = fs
      .readFileSync(path.join(proj, ".claude", "aim", "inbox.jsonl"), "utf8")
      .trim()
      .split("\n");
    const lastLine = raw[raw.length - 1];
    const ev = JSON.parse(lastLine);
    assert.equal(ev.kind, "region");
    assert.equal(ev.screenshot.path, `shots/${j.id}.png`);
    assert.deepEqual(ev.region, { x: 10, y: 20, w: 100, h: 50 });
    assert.equal(ev.screenshot.viewport.w, 1440);
    assert.ok(!lastLine.includes(PNG_1x1), "no base64 in inbox line");
  } finally {
    proc.kill();
  }
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd ~/.claude/skills/aim && node --test tests/server.test.mjs`
Expected: FAIL — сейчас `normalizeEvent` не протаскивает `kind`/`region`, PNG не пишется, `screenshot` = null.

- [ ] **Step 3: Обновить `normalizeEvent`**

В `$AIM/scripts/server.mjs` заменить функцию `normalizeEvent` (сейчас строки 118–134) на:
```js
function normalizeEvent(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload must be an object");
  }
  const mode = payload.mode === "live" ? "live" : "queue";
  const comment = typeof payload.comment === "string" ? payload.comment : "";
  const kind = payload.kind === "region" ? "region" : "element";
  return {
    id: payload.id || ulid(),
    ts: new Date().toISOString(),
    mode,
    url: typeof payload.url === "string" ? payload.url : null,
    comment,
    kind,
    region: payload.region ?? null,
    fiber: payload.fiber ?? null,
    element: payload.element ?? null,
    screenshot: null,
  };
}
```

- [ ] **Step 4: Писать PNG в `/click` handler**

В `$AIM/scripts/server.mjs`, в обработчике `POST /click`, заменить тело `req.on("end", ...)` (сейчас строки 81–99) на версию, которая пишет скрин ПОСЛЕ `normalizeEvent` и до `appendFileSync`:
```js
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const event = normalizeEvent(payload);
        if (payload.shotData && typeof payload.shotData === "string") {
          try {
            const b64 = payload.shotData.replace(/^data:image\/png;base64,/, "");
            const buf = Buffer.from(b64, "base64");
            const shotsDir = path.join(aimDir, "shots");
            fs.mkdirSync(shotsDir, { recursive: true });
            const rel = `shots/${event.id}.png`;
            fs.writeFileSync(path.join(aimDir, rel), buf);
            const meta = payload.shotMeta || {};
            event.screenshot = {
              path: rel,
              w: meta.w ?? null,
              h: meta.h ?? null,
              region: event.region,
              viewport: meta.viewport ?? null,
            };
          } catch {
            event.screenshot = null; // мягкий фейл — правку не теряем
          }
        }
        fs.appendFileSync(inboxPath, JSON.stringify(event) + "\n");
        if (event.mode === "live") broadcast(event);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: true, id: event.id }));
      } catch (err) {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
      }
    });
```

- [ ] **Step 5: Поднять лимит тела**

В `$AIM/scripts/server.mjs` в `POST /click` заменить `if (body.length > 5_000_000) {` (сейчас строка 77) на:
```js
      if (body.length > 12_000_000) {
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `cd ~/.claude/skills/aim && node --test tests/server.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 7: Чекпоинт** — оба серверных теста зелёные.

---

## Task 3: `to-md` встраивает скрин + region/components

**Files:**
- Modify: `$AIM/scripts/to-md.mjs`
- Create: `$AIM/tests/to-md.test.mjs`

- [ ] **Step 1: Написать падающий тест**

Create `$AIM/tests/to-md.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOMD = path.join(import.meta.dirname, "..", "scripts", "to-md.mjs");

test("to-md embeds region screenshot and components", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "aim-tomd-"));
  const shotsDir = path.join(proj, ".claude", "aim", "shots");
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, "ABC.png"), Buffer.from("89504e470d0a1a0a", "hex"));

  const ev = {
    id: "ABC",
    ts: new Date().toISOString(),
    mode: "queue",
    url: "http://localhost:3000/comparison/new",
    comment: "tighten this block",
    kind: "region",
    region: { x: 0, y: 0, w: 200, h: 120 },
    fiber: { region: true, ancestor: "ComparisonWizard", components: ["Card", "Button"] },
    element: null,
    screenshot: {
      path: "shots/ABC.png",
      w: 200,
      h: 120,
      region: { x: 0, y: 0, w: 200, h: 120 },
      viewport: { w: 1440, h: 900 },
    },
  };
  fs.writeFileSync(path.join(proj, ".claude", "aim", "inbox.jsonl"), JSON.stringify(ev) + "\n");

  const out = path.join(proj, "out.md");
  const res = spawnSync("node", [TOMD, "--project", proj, "--out", out], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);

  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /!\[/, "has image embed");
  assert.match(md, /ABC\.png/, "points at the shot");
  assert.match(md, /ComparisonWizard/, "names the ancestor");
  assert.match(md, /Область/, "labels the region");
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd ~/.claude/skills/aim && node --test tests/to-md.test.mjs`
Expected: FAIL — `renderMarkdown` игнорирует `screenshot`, region-fiber рендерится как «no react context».

- [ ] **Step 3: Пробросить `outPath` в `renderMarkdown` (реордер)**

В `$AIM/scripts/to-md.mjs` заменить блок (сейчас строки 35–46):
```js
const md = renderMarkdown(all);
const date = new Date().toISOString().slice(0, 10);
const defaultDir = path.join(projectRoot, "docs", "edits");
const outPath = path.resolve(
  args.out
    ? path.isAbsolute(args.out)
      ? args.out
      : path.join(projectRoot, args.out)
    : path.join(defaultDir, `${date}-aim.md`),
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
```
на (outPath считается ДО рендера и передаётся внутрь):
```js
const date = new Date().toISOString().slice(0, 10);
const defaultDir = path.join(projectRoot, "docs", "edits");
const outPath = path.resolve(
  args.out
    ? path.isAbsolute(args.out)
      ? args.out
      : path.join(projectRoot, args.out)
    : path.join(defaultDir, `${date}-aim.md`),
);
const md = renderMarkdown(all, outPath);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
```

- [ ] **Step 4: Обновить сигнатуру и тело `renderMarkdown`**

В `$AIM/scripts/to-md.mjs` заменить строку `function renderMarkdown(events) {` на:
```js
function renderMarkdown(events, outPath) {
```

Внутри цикла `for (const e of list) {` заменить блок вывода fiber (сейчас строки 87–96) на версию, различающую region и element:
```js
      if (e.kind === "region" && e.fiber?.region) {
        const parts = [];
        if (e.fiber.ancestor) parts.push(`внутри \`${e.fiber.ancestor}\``);
        if (e.fiber.components?.length) {
          parts.push(e.fiber.components.map((c) => `\`${c}\``).join(", "));
        }
        lines.push(`**Область** — ${parts.join(" · ") || "—"}`);
      } else if (e.fiber?.chain?.length) {
        const top = e.fiber.userComponent || e.fiber.chain[0].name;
        const trail = e.fiber.chain
          .slice(0, 4)
          .map((c) => (c.primitive ? `(${c.name})` : `\`${c.name}\``))
          .join(" › ");
        lines.push(`**\`${top}\`** — ${trail}`);
      } else {
        lines.push(`**no react context · fallback by tag/classes/text**`);
      }
```

Сразу после `lines.push("");` идущего за блоком с комментарием (`> ...`) — то есть перед блоком `if (e.element?.outerHTML) {` (сейчас строка 100) — вставить встраивание скрина:
```js
      if (e.screenshot?.path) {
        const abs = path.join(projectRoot, ".claude", "aim", e.screenshot.path);
        const relToOut = path
          .relative(path.dirname(outPath), abs)
          .split(path.sep)
          .join("/");
        const reg = e.screenshot.region || e.region;
        const dims = reg ? `${Math.round(reg.w)}×${Math.round(reg.h)}` : "";
        lines.push(`![область ${dims}](${relToOut})`);
        lines.push("");
      }
```

- [ ] **Step 5: Обновить `title` для region**

В `$AIM/scripts/to-md.mjs` заменить функцию `title` (сейчас строки 117–122) на:
```js
function title(e) {
  if (e.kind === "region") {
    const r = e.region || e.screenshot?.region;
    return r ? `Область ${Math.round(r.w)}×${Math.round(r.h)}` : "Область";
  }
  const tag = e.element?.tag || "?";
  const txt = (e.element?.text || "").slice(0, 40);
  const head = txt ? `\`<${tag}>\` — "${txt}"` : `\`<${tag}>\``;
  return head;
}
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `cd ~/.claude/skills/aim && node --test tests/to-md.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 7: Прогнать все тесты**

Run: `cd ~/.claude/skills/aim && node --test tests/`
Expected: PASS (3 tests total).

- [ ] **Step 8: Чекпоинт** — все node-тесты зелёные.

---

## Task 4: Оверлей — режим «Область» (браузерный код, ручной smoke)

**Files:**
- Modify: `$AIM/scripts/overlay.js`

> Браузерный IIFE — node-тестами не покрывается; проверка ручным smoke в Task 5. Ниже — полные вставки с якорями.

- [ ] **Step 1: Стили для capture-слоя и marquee**

В `$AIM/scripts/overlay.js` внутри `<style>...</style>`, перед закрывающим `</style>` (сейчас ~строка 197, после `.toast.show {...}`), добавить:
```css
  .armlayer {
    position: fixed; inset: 0;
    background: rgba(10,10,12,0.28);
    cursor: crosshair;
    pointer-events: auto;
    display: none;
    z-index: 5;
  }
  .marquee {
    position: fixed;
    border: 2px dashed #ff5e7a;
    background: rgba(255,94,122,0.10);
    pointer-events: none;
    display: none;
    z-index: 6;
  }
  .marquee.live { border-color: #6ee7f0; background: rgba(110,231,240,0.10); }
  .chip .rbadge {
    display: none;
    background: rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 11px;
  }
  .chip.armed .rbadge { display: inline; }
```

- [ ] **Step 2: Разметка — слой, marquee, бейдж чипа, строка меню**

В `$AIM/scripts/overlay.js` в `root.innerHTML`:

(a) Заменить `<div class="outline"></div>` (сейчас строка 199) на:
```html
<div class="outline"></div>
<div class="armlayer"></div>
<div class="marquee"></div>
```

(b) В блоке `.chip` (сейчас строки 200–204) добавить бейдж — заменить на:
```html
<div class="chip zero">
  <span class="dot"></span>
  <span class="mode">queue</span>
  <span class="rbadge">область</span>
  <span class="count"></span>
</div>
```

(c) В `.menu` после строки `data-action="mode"` (её закрывающего `</div>`, сейчас строка 209) вставить строку режима области перед `<div class="divider"></div>`:
```html
  <div class="row" data-action="region">
    <span>Режим «Область»</span>
    <span class="region-label">выкл</span>
  </div>
```

(d) Обновить hint в меню (сейчас строки 211–214) на:
```html
  <div class="hint">
    <kbd>Alt</kbd> + hover/click — точечный пик.<br>
    <kbd>⌥</kbd>+<kbd>Space</kbd> или тумблер — режим «Область» (drag рамкой).<br>
    <kbd>⌘</kbd>+<kbd>↵</kbd> отправить, <kbd>Esc</kbd> отмена.
  </div>
```

- [ ] **Step 3: Ссылки на новые узлы + state**

В `$AIM/scripts/overlay.js` после `const textarea = $("textarea");` (сейчас строка 244) добавить:
```js
  const armlayer = $(".armlayer");
  const marquee = $(".marquee");
```

В объекте `state` (сейчас строки 8–13) добавить поля — заменить на:
```js
  const state = {
    mode: localStorage.getItem("aim-mode") === "live" ? "live" : "queue",
    sessionCount: 0,
    altDown: false,
    captured: null,
    region: false,
    regionOneShot: false,
    dragging: false,
    dragStart: null,
  };
```

- [ ] **Step 4: `setMode` также красит marquee**

В `$AIM/scripts/overlay.js` внутри `setMode`, после `panel.classList.toggle("live", next === "live");` (сейчас строка 253) добавить:
```js
    marquee.classList.toggle("live", next === "live");
```

- [ ] **Step 5: Функция `setRegion` + обработчики тумблера/шортката**

В `$AIM/scripts/overlay.js` после определения `setMode(...)`-вызова `setMode(state.mode, { persist: false });` (сейчас строка 259) добавить:
```js
  function setRegion(armed, opts = {}) {
    state.region = armed;
    state.regionOneShot = armed ? !!opts.oneShot : false;
    armlayer.style.display = armed ? "block" : "none";
    chip.classList.toggle("armed", armed);
    $(".region-label").textContent = armed ? "вкл" : "выкл";
    document.body.style.cursor = armed ? "crosshair" : "";
    if (!armed) {
      marquee.style.display = "none";
      state.dragging = false;
      state.dragStart = null;
    }
  }
```

- [ ] **Step 6: Клик по строке меню «Область»**

В `$AIM/scripts/overlay.js` после обработчика `$('[data-action="mode"]')...` (сейчас заканчивается на строке 283) добавить:
```js
  $('[data-action="region"]').addEventListener("click", (e) => {
    e.stopPropagation();
    setRegion(!state.region);
  });
```

- [ ] **Step 7: Шорткат Option+Space + гард элемент-пикера**

В `$AIM/scripts/overlay.js` в существующем `document.addEventListener("keydown", ...)` (сейчас строки 395–405) добавить обработку Option+Space — заменить блок на:
```js
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt" || e.altKey) {
      if (!state.altDown) {
        state.altDown = true;
        if (!state.region) document.body.style.cursor = "crosshair";
      }
    }
    if (e.key === "Escape" && panel.classList.contains("open")) {
      closePanel();
    }
    if (e.code === "Space" && e.altKey && !panel.classList.contains("open")) {
      const a = document.activeElement;
      const typing =
        a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
      if (typing) return;
      e.preventDefault();
      setRegion(!state.region, { oneShot: !state.region });
    }
  });
```

В том же файле в обработчике `mousemove` (сейчас строка 420, первая строка тела) заменить:
```js
      if (!state.altDown || panel.classList.contains("open")) return;
```
на:
```js
      if (state.region) return;
      if (!state.altDown || panel.classList.contains("open")) return;
```

И в обработчике `click` (capture) (сейчас строка 432, первая строка тела) заменить:
```js
      if (!e.altKey) return;
```
на:
```js
      if (state.region) return;
      if (!e.altKey) return;
```

- [ ] **Step 8: Отметить kind у точечного захвата**

В `$AIM/scripts/overlay.js` в `captureElement`, строку (сейчас строка 447):
```js
    state.captured = { fiberInfo, element, url: location.href, el };
```
заменить на:
```js
    state.captured = { kind: "element", fiberInfo, element, url: location.href, el };
```

- [ ] **Step 9: Marquee drag на capture-слое**

В `$AIM/scripts/overlay.js` после блока обработчика `click` (capture) (заканчивается ~строка 442) добавить:
```js
  function rectFrom(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function updateMarquee(cx, cy) {
    const r = rectFrom(state.dragStart, { x: cx, y: cy });
    marquee.style.left = r.x + "px";
    marquee.style.top = r.y + "px";
    marquee.style.width = r.w + "px";
    marquee.style.height = r.h + "px";
  }
  armlayer.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || panel.classList.contains("open")) return;
    e.preventDefault();
    e.stopPropagation();
    state.dragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
    marquee.style.display = "block";
    updateMarquee(e.clientX, e.clientY);
  });
  armlayer.addEventListener("mousemove", (e) => {
    if (!state.dragging) return;
    updateMarquee(e.clientX, e.clientY);
  });
  armlayer.addEventListener("mouseup", (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    const rect = rectFrom(state.dragStart, { x: e.clientX, y: e.clientY });
    marquee.style.display = "none";
    if (rect.w < 8 || rect.h < 8) return;
    onRegionSelected(rect);
  });
```

- [ ] **Step 10: Сбор fiber по области**

В `$AIM/scripts/overlay.js` сразу после кода из Step 9 добавить:
```js
  function elAtFiltered(x, y) {
    const list = document.elementsFromPoint(x, y);
    for (const el of list) {
      if (el && el !== host && !host.contains(el)) return el;
    }
    return null;
  }
  function collectRegionInfo(rect) {
    const cols = 5, rows = 5;
    const els = new Set();
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const el = elAtFiltered(rect.x + (rect.w * i) / cols, rect.y + (rect.h * j) / rows);
        if (el) els.add(el);
      }
    }
    const comps = [];
    for (const el of els) {
      const fi = findFiberInfo(el);
      if (fi?.userComponent && !comps.includes(fi.userComponent)) comps.push(fi.userComponent);
    }
    return { region: true, ancestor: findContainingComponent(rect), components: comps };
  }
  function findContainingComponent(rect) {
    let el = elAtFiltered(rect.x + rect.w / 2, rect.y + rect.h / 2);
    while (el) {
      const r = el.getBoundingClientRect();
      if (
        r.left <= rect.x + 1 &&
        r.top <= rect.y + 1 &&
        r.right >= rect.x + rect.w - 1 &&
        r.bottom >= rect.y + rect.h - 1
      )
        break;
      el = el.parentElement;
    }
    if (!el) return null;
    const fi = findFiberInfo(el);
    return fi?.userComponent || null;
  }
```

- [ ] **Step 11: Захват вьюпорта через snapdom + разметка**

В `$AIM/scripts/overlay.js` сразу после кода из Step 10 добавить:
```js
  let snapdomMod = null;
  async function loadSnapdom() {
    if (!snapdomMod) snapdomMod = await import(`${API}/snapdom.js`);
    return snapdomMod.snapdom;
  }
  async function captureRegion(rect) {
    const snapdom = await loadSnapdom();
    const root = document.documentElement;
    const result = await snapdom(root, {
      exclude: ["#aim-host"],
      excludeMode: "remove",
      fast: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#0a0a0a",
    });
    const full = await result.toCanvas();
    const S = full.width / root.scrollWidth; // эффективный dpr
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = window.scrollX * S, sy = window.scrollY * S;
    const sw = vw * S, sh = vh * S;
    const vp = document.createElement("canvas");
    vp.width = Math.round(sw);
    vp.height = Math.round(sh);
    const ctx = vp.getContext("2d");
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
    const rx = rect.x * S, ry = rect.y * S, rw = rect.w * S, rh = rect.h * S;
    ctx.fillStyle = "rgba(10,10,12,0.55)";
    ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.drawImage(full, sx + rx, sy + ry, rw, rh, rx, ry, rw, rh);
    ctx.strokeStyle = state.mode === "live" ? "#6ee7f0" : "#ff5e7a";
    ctx.lineWidth = Math.max(2, 2 * S);
    ctx.strokeRect(rx, ry, rw, rh);
    let out = vp;
    if (vp.width > 1600) {
      const k = 1600 / vp.width;
      const d = document.createElement("canvas");
      d.width = Math.round(vp.width * k);
      d.height = Math.round(vp.height * k);
      d.getContext("2d").drawImage(vp, 0, 0, d.width, d.height);
      out = d;
    }
    return { dataURL: out.toDataURL("image/png"), w: out.width, h: out.height };
  }
```

- [ ] **Step 12: `onRegionSelected` + панель области**

В `$AIM/scripts/overlay.js` сразу после кода из Step 11 добавить:
```js
  async function onRegionSelected(rect) {
    const info = collectRegionInfo(rect);
    let shot = null;
    try {
      shot = await captureRegion(rect);
    } catch (err) {
      showToast("скрин не удался");
    }
    state.captured = { kind: "region", region: rect, fiberInfo: info, url: location.href, shot };
    openRegionPanel(rect, info);
  }
  function openRegionPanel(rect, info) {
    const head = $(".panel .comp");
    const srcLine = $(".panel .src");
    head.textContent = `Область ${Math.round(rect.w)}×${Math.round(rect.h)}`;
    const parts = [];
    if (info.ancestor) parts.push(`внутри ${info.ancestor}`);
    if (info.components?.length) parts.push(info.components.slice(0, 5).join(" · "));
    srcLine.textContent = parts.join(" — ") || "—";
    srcLine.classList.toggle("none", !info.ancestor && !info.components?.length);
    const px = Math.min(rect.x, window.innerWidth - 380);
    const py = Math.min(rect.y + rect.h + 8, window.innerHeight - 280);
    panel.style.left = Math.max(8, px) + "px";
    panel.style.top = Math.max(8, py) + "px";
    panel.classList.add("open");
    textarea.value = "";
    setTimeout(() => textarea.focus(), 0);
  }
```

- [ ] **Step 13: `submit` и `closePanel` учитывают region**

В `$AIM/scripts/overlay.js` заменить функцию `submit` (сейчас строки 506–534) на:
```js
  async function submit() {
    if (!state.captured) return;
    const comment = textarea.value.trim();
    if (!comment) {
      textarea.focus();
      return;
    }
    const c = state.captured;
    const payload =
      c.kind === "region"
        ? {
            mode: state.mode,
            url: c.url,
            comment,
            kind: "region",
            region: c.region,
            fiber: c.fiberInfo,
            element: null,
            shotData: c.shot?.dataURL || null,
            shotMeta: c.shot
              ? { w: c.shot.w, h: c.shot.h, viewport: { w: window.innerWidth, h: window.innerHeight } }
              : null,
          }
        : {
            mode: state.mode,
            url: c.url,
            comment,
            kind: "element",
            fiber: c.fiberInfo,
            element: c.element,
          };
    try {
      const r = await fetch(`${API}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "submit failed");
      bumpCount();
      showToast(state.mode === "live" ? "Sent live →" : "Queued ✓");
      const wasRegionOneShot = c.kind === "region" && state.regionOneShot;
      closePanel();
      if (wasRegionOneShot) setRegion(false);
    } catch (err) {
      showToast("error: " + err.message);
    }
  }
```

И заменить `closePanel` (сейчас строки 480–484) на:
```js
  function closePanel() {
    const wasRegion = state.captured?.kind === "region";
    panel.classList.remove("open");
    state.captured = null;
    if (!state.altDown) hideOutline();
    if (wasRegion && state.regionOneShot) setRegion(false);
  }
```

- [ ] **Step 14: Синтаксическая проверка файла**

Run: `node --check ~/.claude/skills/aim/scripts/overlay.js`
Expected: без вывода (валидный JS).

- [ ] **Step 15: Чекпоинт** — overlay.js парсится; ручной smoke в Task 5.

---

## Task 5: SKILL.md — секция region-события, триггеры, workflow

**Files:**
- Modify: `$AIM/SKILL.md`

- [ ] **Step 1: Добавить секцию «Handling a region event»**

В `$AIM/SKILL.md` после секции «### Handling a live event» (перед «### Handling the queue») вставить:
```markdown
### Handling a region event

Region-события приходят с `kind: "region"` и (обычно) `screenshot.path`:

```json
{
  "kind": "region",
  "mode": "live",
  "url": "http://localhost:3000/comparison/new",
  "comment": "этот блок сделать компактнее",
  "region": { "x": 120, "y": 80, "w": 480, "h": 220 },
  "fiber": { "region": true, "ancestor": "ComparisonWizard", "components": ["Card", "Button"] },
  "screenshot": { "path": "shots/<id>.png", "w": 1440, "h": 810,
                  "region": { "x": 120, "y": 80, "w": 480, "h": 220 }, "viewport": { "w": 1440, "h": 900 } }
}
```

Шаги:
1. Прочитать скрин: `Read` файл `.claude/aim/<screenshot.path>` — это весь вьюпорт с
   помеченной рамкой. Визуально пойми, на какую зону указывает пользователь.
2. Резолв исходника: `fiber.ancestor` — наименьший компонент, целиком содержащий
   область (главная grep-цель: `rg "(function|const) <ancestor>" src/`). `fiber.components`
   — прочие компоненты в области (уточняют место). Плюс pathname URL.
3. Применить правку в границах области. Не трогать соседнее вне зоны.
4. Однострочное подтверждение: "✓ <ancestor> · <file> — <что изменил>".

Если `screenshot` == null (клиентский захват сорвался, напр. cross-origin `<img>`) —
резолвь по `ancestor`/`components`/URL/`comment` без картинки.
```

- [ ] **Step 2: Обновить триггер-слова**

В `$AIM/SKILL.md` в списке «## Trigger words» добавить строку:
```markdown
- "выдели область", "сними участок", "режим область", "region snapshot"
```

- [ ] **Step 3: Упомянуть режим области в Workflow**

В `$AIM/SKILL.md` в «### Starting a session», в строке-инструкции пользователю после boot
(«Готово. Открой <appUrl>...») добавить второе предложение:
```markdown
Для области: включи тумблер «Режим Область» в меню чипа (или ⌥+Space) и протяни рамку — приложится скрин экрана с пометкой.
```

- [ ] **Step 4: Обновить таблицу scripts (snapdom)**

В `$AIM/SKILL.md` в таблице «## Scripts» добавить строку:
```markdown
| `vendor/snapdom.min.js` | Вендоренный snapdom, отдаётся сервером как `/snapdom.js` для клиент-сайд захвата области. Не запускать напрямую. |
```

- [ ] **Step 5: Чекпоинт** — SKILL.md описывает новый поток.

---

## Task 6: Сквозной ручной smoke (queue + live + to-md)

**Files:** только запуск, без правок кода.

- [ ] **Step 1: Поднять dev-сервер приложения**

В отдельном фоне (порт 3000): `cd <проект> && npm run dev` (или через skill start-dev-server).
Дождаться `http://localhost:3000`.

- [ ] **Step 2: Boot aim**

Run: `node ~/.claude/skills/aim/scripts/boot.mjs --project <проект>`
Expected: `{ ok: true, port, appUrl, ... }`. Открыть `appUrl` в браузере.

- [ ] **Step 3: Smoke — queue через тумблер**

В браузере: открыть меню чипа → включить «Режим Область» (лейбл станет «вкл», чип получит бейдж «область», курсор crosshair, лёгкое затемнение). Протянуть рамку по блоку → появляется панель «Область WxH · внутри <Component>». Оставить mode=queue, написать комментарий, Submit → тост «Queued ✓».

Проверка: `ls -la <проект>/.claude/aim/shots/` — есть свежий `<id>.png`. Открыть его (`Read`) — весь экран, выбранная область в яркой рамке, остальное затемнено. Последняя строка `<проект>/.claude/aim/inbox.jsonl` — `kind:"region"`, `screenshot.path`, `fiber.ancestor`/`components`, без base64.

- [ ] **Step 4: Smoke — one-shot через ⌥+Space + live**

Выключить тумблер. В меню переключить Default mode → live (или тумблером live на панели). Нажать `⌥`+`Space` (фокус не в инпуте) — режим области армируется разово. Протянуть рамку → панель (cyan). Убедиться mode=live, Submit. После отправки режим области сам выключился (бейдж пропал).

Параллельно (если запущен poll как фоновая задача — `node ~/.claude/skills/aim/scripts/poll.mjs --project <проект>`): в выводе появилась JSON-строка события с `screenshot.path`. Прочитать этот PNG через `Read` — агент видит помеченный экран.

- [ ] **Step 5: Smoke — рендер очереди**

Run: `node ~/.claude/skills/aim/scripts/to-md.mjs --project <проект>`
Expected: `{ ok: true, outPath, count }`. Открыть `docs/edits/<date>-aim.md` — для region-правок встроена картинка `![область WxH](...)`, заголовок «Область WxH», строка «**Область** — внутри `Component` · ...».

- [ ] **Step 6: Проверка гарда шортката**

В панели комментария (textarea в фокусе) нажать `⌥`+`Space` — должен вставиться пробел/ничего, режим области НЕ переключается (гард по фокусу работает).

- [ ] **Step 7: Стоп**

Run: `node ~/.claude/skills/aim/scripts/stop.mjs --project <проект>`
Expected: сервер остановлен, инжект снят.

- [ ] **Step 8: Финальный чекпоинт** — все сценарии прошли. Обновить чекбоксы плана.

---

## Self-Review (выполнено при написании)

**Spec coverage:**
- Клиент-сайд snapdom + разметка → Task 1 (вендор/отдача), Task 4 Step 11 (захват+разметка). ✓
- Тумблер + Option+Space (sticky/one-shot) → Task 4 Steps 5–7, 13. ✓
- Capture-слой без Alt, Esc-выход → Task 4 Steps 1–2, 7, 9. ✓
- Скрин всего экрана с пометкой (не кроп) → Task 4 Step 11 (viewport + dim + stroke). ✓
- Хранение PNG на диск, путь в событие, без base64 в inbox → Task 2. ✓
- `screenshot`/`kind`/`region` в схеме события → Task 2. ✓
- Region-fiber (ancestor + components) → Task 4 Step 10. ✓
- to-md встраивает картинку + region/components → Task 3. ✓
- SKILL.md region-секция + триггеры → Task 5. ✓
- Лимит тела 12MB → Task 2 Step 5. ✓
- exclude `#aim-host` → Task 4 Step 11. ✓
- Мягкий фейл при cross-origin → Task 2 Step 4 (сервер) + Task 4 Step 12 (клиент toast). ✓
- Гард Option+Space в инпутах → Task 4 Step 7, проверка Task 6 Step 6. ✓

**Placeholder scan:** нет TBD/«обработать ошибки»/«аналогично Task N» — код полный в каждом шаге. ✓

**Type consistency:** поле `kind` ("region"/"element"), `fiber.{region,ancestor,components}`, `screenshot.{path,w,h,region,viewport}`, payload `shotData`/`shotMeta` — согласованы между overlay (Task 4), server (Task 2), to-md (Task 3), тестами и SKILL.md (Task 5). Функции `setRegion`/`collectRegionInfo`/`findContainingComponent`/`captureRegion`/`onRegionSelected`/`openRegionPanel`/`rectFrom`/`updateMarquee`/`elAtFiltered`/`loadSnapdom` определены до использования. ✓
