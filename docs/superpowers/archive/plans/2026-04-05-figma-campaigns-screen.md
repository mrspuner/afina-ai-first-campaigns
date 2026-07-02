# Afina — Кампании Step 1 Figma Screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Afina "Кампании Step 1" screen in Figma — sidebar + main content area — visually matching the browser, with Auto Layout throughout.

**Architecture:** Build directly with `use_figma` Plugin API. Create a 1440×900 wrapper frame, then build sections one at a time: sidebar (220px), then main area (step 1 scenario grid + chat input bar). Use Lucide icons from the connected library. No design tokens or components required — pure Auto Layout frames with hardcoded visual values.

**Tech Stack:** Figma Plugin API (`use_figma`), Lucide Icons library, `importComponentByKeyAsync`

**Reference:** Browser capture at node `45:6146` in Figma file `0F9sLO13e6dWABVl5n6CbU`. Take a screenshot of this node at the start of Task 2 for visual alignment.

---

## Icon Keys (Lucide Icons — Full Collection library)

| Icon | Code name | Figma component key |
|------|-----------|---------------------|
| Rocket | `Rocket` | `999a8855595d9a05ebbd8787fa008fa728cb0cd4` |
| Bell | `Bell` | `f0e2e7488455a9230ae0c4e07868d54821c93bdf` |
| Megaphone | `Megaphone` | `019497625a8231cb8b36cba3f8116694d45a8e20` |
| BarChart2 | `chart-bar-big` | `4259ed221b13cab7396f4311175af2f6bc1fca22` |

## Colors (dark theme, match visually from node 45:6146)

| Token | Hex | Usage |
|-------|-----|-------|
| background | `#09090b` | Sidebar + main bg |
| foreground | `#fafafa` | Primary text |
| muted-foreground | `#a1a1aa` | Nav labels, secondary text |
| accent | `#27272a` | Active/hover nav item bg |
| border | `#27272a` | Card borders, divider |
| card | `#18181b` | Scenario card bg |
| primary (badge) | `#8b5cf6` | Badge background (purple) |
| primary-fg | `#ffffff` | Badge text |

---

## Task 1: Screenshot the browser reference

**Files:**
- No files created/modified — read only

- [ ] **Step 1: Screenshot node 45:6146**

```js
// use_figma call
return { message: "see screenshot" };
```

Use `get_screenshot` with nodeId `45:6146` and fileKey `0F9sLO13e6dWABVl5n6CbU`. Study the result carefully:
- Sidebar width, logo position, nav item layout (icon top + text below), badges
- Spacing between Запустить and other nav items
- Balance section and user footer
- Main content: title, subtitle, 3×2 card grid, chat input bar at bottom

---

## Task 2: Clean up old test frames + create page wrapper

**Files:**
- Modify: Page 1 of Figma file `0F9sLO13e6dWABVl5n6CbU`

- [ ] **Step 1: Find existing nodes and clear space**

```js
// Inspect current page state
await figma.setCurrentPageAsync(figma.root.children[0]);
const nodes = figma.currentPage.children.map(n => ({
  id: n.id, name: n.name, x: n.x, y: n.y,
  w: n.width, h: n.height
}));
return nodes;
```

Note the IDs of any old test nodes (test-barchart, test-bell, old sidebar attempts). Note the rightmost x + width to find clear space.

- [ ] **Step 2: Delete old test nodes**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
// Replace IDs below with actual test node IDs from Step 1
const toDelete = ["PASTE_OLD_NODE_IDS_HERE"];
for (const id of toDelete) {
  const node = await figma.getNodeByIdAsync(id);
  if (node && node.parent) node.remove();
}
return { deleted: toDelete.length };
```

- [ ] **Step 3: Create the 1440×900 wrapper frame**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);

// Find clear space to the right of existing content
let maxX = 0;
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width);
}

const wrapper = figma.createFrame();
wrapper.name = "Afina — Кампании Step 1";
wrapper.resize(1440, 900);
wrapper.x = maxX > 0 ? maxX + 200 : 0;
wrapper.y = 0;
wrapper.layoutMode = "HORIZONTAL";
wrapper.primaryAxisSizingMode = "FIXED";
wrapper.counterAxisSizingMode = "FIXED";
wrapper.itemSpacing = 0;
wrapper.fills = [{ type: "SOLID", color: { r: 0.035, g: 0.035, b: 0.043 } }]; // #09090b
wrapper.clipsContent = true;

return { wrapperId: wrapper.id, x: wrapper.x };
```

---

## Task 3: Build the sidebar

**Files:**
- Modify: wrapper frame created in Task 2

The sidebar is 220px wide × full height. It contains (top to bottom):
1. Logo section (px-4 py-5 → ~16px horizontal, 20px vertical padding)
2. Nav section (px-2 → 8px horizontal padding): Запустить button + 3 nav items
3. Spacer (flex-1)
4. Footer: balance block + user dropdown row

- [ ] **Step 1: Create the sidebar frame and logo**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");

// Sidebar outer frame
const sidebar = figma.createFrame();
sidebar.name = "Sidebar";
sidebar.layoutMode = "VERTICAL";
sidebar.primaryAxisSizingMode = "FIXED";
sidebar.counterAxisSizingMode = "FIXED";
sidebar.resize(220, 900);
sidebar.fills = [{ type: "SOLID", color: { r: 0.035, g: 0.035, b: 0.043 } }]; // #09090b
sidebar.itemSpacing = 0;
sidebar.paddingTop = 0;
sidebar.paddingBottom = 0;
sidebar.paddingLeft = 0;
sidebar.paddingRight = 0;
wrapper.appendChild(sidebar);
sidebar.layoutSizingHorizontal = "FIXED";
sidebar.layoutSizingVertical = "FILL";

// Logo section
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
const logoSection = figma.createFrame();
logoSection.name = "Logo";
logoSection.layoutMode = "HORIZONTAL";
logoSection.paddingTop = 20;
logoSection.paddingBottom = 20;
logoSection.paddingLeft = 16;
logoSection.paddingRight = 16;
logoSection.fills = [];
logoSection.primaryAxisSizingMode = "AUTO";
logoSection.counterAxisSizingMode = "AUTO";

// Logo text (since no SVG available inline)
const logoText = figma.createText();
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
logoText.characters = "afina";
logoText.fontSize = 20;
logoText.fontName = { family: "Inter", style: "Bold" };
logoText.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }]; // #fafafa
logoSection.appendChild(logoText);
sidebar.appendChild(logoSection);
logoSection.layoutSizingHorizontal = "FILL";

return { sidebarId: sidebar.id, logoSectionId: logoSection.id };
```

- [ ] **Step 2: Create the nav section with Запустить button**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
await figma.loadFontAsync({ family: "Inter", style: "Medium" });

const sidebar = await figma.getNodeByIdAsync("SIDEBAR_ID");

// Nav container
const nav = figma.createFrame();
nav.name = "Nav";
nav.layoutMode = "VERTICAL";
nav.paddingLeft = 8;
nav.paddingRight = 8;
nav.itemSpacing = 0;
nav.fills = [];
nav.primaryAxisSizingMode = "AUTO";
nav.counterAxisSizingMode = "AUTO";

// Helper: create a nav item frame (icon on top, label below)
async function createNavItem(label, iconKey, hasActiveState, badge) {
  const item = figma.createFrame();
  item.name = `Nav / ${label}`;
  item.layoutMode = "VERTICAL";
  item.primaryAxisAlignItems = "CENTER";
  item.counterAxisAlignItems = "CENTER";
  item.paddingTop = 12;
  item.paddingBottom = 12;
  item.paddingLeft = 12;
  item.paddingRight = 12;
  item.itemSpacing = 4;
  item.cornerRadius = 6;
  item.fills = hasActiveState
    ? [{ type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.161 } }] // #27272a active
    : [];

  // Icon wrapper (relative position for badge)
  const iconWrap = figma.createFrame();
  iconWrap.name = "icon-wrap";
  iconWrap.layoutMode = "NONE"; // Absolute positioning for badge
  iconWrap.resize(24, 24);
  iconWrap.fills = [];
  iconWrap.clipsContent = false;

  // Import Lucide icon
  const iconComp = await figma.importComponentByKeyAsync(iconKey);
  const iconInst = iconComp.createInstance();
  iconInst.resize(24, 24);
  iconInst.x = 0;
  iconInst.y = 0;
  // Recolor icon to foreground
  for (const child of iconInst.children) {
    if ("fills" in child) {
      child.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
    }
  }
  iconWrap.appendChild(iconInst);

  // Badge (if needed)
  if (badge !== undefined) {
    const badgeFrame = figma.createFrame();
    badgeFrame.name = "badge";
    badgeFrame.layoutMode = "HORIZONTAL";
    badgeFrame.primaryAxisAlignItems = "CENTER";
    badgeFrame.counterAxisAlignItems = "CENTER";
    badgeFrame.resize(16, 16);
    badgeFrame.cornerRadius = 8;
    badgeFrame.fills = [{ type: "SOLID", color: { r: 0.545, g: 0.361, b: 0.965 } }]; // #8b5cf6
    badgeFrame.x = 14; // -right-2.5 relative
    badgeFrame.y = -8;  // -top-2 relative
    badgeFrame.layoutPositioning = "ABSOLUTE";

    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const badgeText = figma.createText();
    badgeText.characters = String(badge);
    badgeText.fontSize = 10;
    badgeText.fontName = { family: "Inter", style: "Regular" };
    badgeText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    badgeFrame.appendChild(badgeText);
    iconWrap.appendChild(badgeFrame);
  }

  item.appendChild(iconWrap);

  // Label
  const labelText = figma.createText();
  labelText.characters = label;
  labelText.fontSize = 12;
  labelText.fontName = { family: "Inter", style: "Medium" };
  labelText.fills = [{ type: "SOLID", color: hasActiveState
    ? { r: 0.98, g: 0.98, b: 0.98 }   // foreground when active
    : { r: 0.631, g: 0.631, b: 0.659 } // #a1a1aa muted when inactive
  }];
  item.appendChild(labelText);

  return item;
}

// Запустить (no badge, no active)
const rocketComp = await figma.importComponentByKeyAsync("999a8855595d9a05ebbd8787fa008fa728cb0cd4");
const rocketInst = rocketComp.createInstance();
rocketInst.resize(24, 24);

const launchItem = figma.createFrame();
launchItem.name = "Nav / Запустить";
launchItem.layoutMode = "VERTICAL";
launchItem.primaryAxisAlignItems = "CENTER";
launchItem.counterAxisAlignItems = "CENTER";
launchItem.paddingTop = 12;
launchItem.paddingBottom = 12;
launchItem.paddingLeft = 12;
launchItem.paddingRight = 12;
launchItem.itemSpacing = 4;
launchItem.cornerRadius = 6;
launchItem.fills = [];
launchItem.appendChild(rocketInst);

const launchLabel = figma.createText();
launchLabel.characters = "Запустить";
launchLabel.fontSize = 12;
launchLabel.fontName = { family: "Inter", style: "Medium" };
launchLabel.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
launchItem.appendChild(launchLabel);
nav.appendChild(launchItem);

// mb-6 spacer between Запустить and others
const spacerMb6 = figma.createFrame();
spacerMb6.name = "spacer-mb6";
spacerMb6.resize(204, 24);
spacerMb6.fills = [];
nav.appendChild(spacerMb6);

// Сигналы (bell, badge=3, inactive)
const signalsItem = await createNavItem("Сигналы", "f0e2e7488455a9230ae0c4e07868d54821c93bdf", false, 3);
nav.appendChild(signalsItem);

// Кампании (megaphone, badge=2, ACTIVE)
const campaignsItem = await createNavItem("Кампании", "019497625a8231cb8b36cba3f8116694d45a8e20", true, 2);
nav.appendChild(campaignsItem);

// Статистика (chart-bar-big, no badge, inactive)
const statsItem = await createNavItem("Статистика", "4259ed221b13cab7396f4311175af2f6bc1fca22", false, undefined);
nav.appendChild(statsItem);

sidebar.appendChild(nav);
nav.layoutSizingHorizontal = "FILL";
launchItem.layoutSizingHorizontal = "FILL";
spacerMb6.layoutSizingHorizontal = "FILL";
signalsItem.layoutSizingHorizontal = "FILL";
campaignsItem.layoutSizingHorizontal = "FILL";
statsItem.layoutSizingHorizontal = "FILL";

return { navId: nav.id };
```

- [ ] **Step 3: Create spacer + footer (balance + user row)**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
await figma.loadFontAsync({ family: "Inter", style: "SemiBold" });

const sidebar = await figma.getNodeByIdAsync("SIDEBAR_ID");

// Flex-1 spacer
const flex1 = figma.createFrame();
flex1.name = "flex-1";
flex1.fills = [];
flex1.resize(220, 10);
sidebar.appendChild(flex1);
flex1.layoutSizingHorizontal = "FILL";
flex1.layoutSizingVertical = "FILL";
flex1.layoutGrow = 1;

// Footer container
const footer = figma.createFrame();
footer.name = "Footer";
footer.layoutMode = "VERTICAL";
footer.paddingTop = 12;
footer.paddingBottom = 12;
footer.paddingLeft = 8;
footer.paddingRight = 8;
footer.itemSpacing = 12;
footer.fills = [];
sidebar.appendChild(footer);
footer.layoutSizingHorizontal = "FILL";

// Balance block (px-3)
const balanceBlock = figma.createFrame();
balanceBlock.name = "Balance";
balanceBlock.layoutMode = "VERTICAL";
balanceBlock.paddingLeft = 12;
balanceBlock.paddingRight = 12;
balanceBlock.itemSpacing = 2;
balanceBlock.fills = [];
footer.appendChild(balanceBlock);
balanceBlock.layoutSizingHorizontal = "FILL";

const balanceLabel = figma.createText();
balanceLabel.characters = "БАЛАНС";
balanceLabel.fontSize = 11;
balanceLabel.fontName = { family: "Inter", style: "Medium" };
balanceLabel.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
balanceLabel.letterSpacing = { unit: "PIXELS", value: 1.5 };
balanceBlock.appendChild(balanceLabel);

const balanceAmount = figma.createText();
balanceAmount.characters = "₽ 24 800";
balanceAmount.fontSize = 14;
balanceAmount.fontName = { family: "Inter", style: "SemiBold" };
balanceAmount.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
balanceBlock.appendChild(balanceAmount);

// User row (avatar + name/email + chevron)
const userRow = figma.createFrame();
userRow.name = "User Row";
userRow.layoutMode = "HORIZONTAL";
userRow.primaryAxisAlignItems = "CENTER";
userRow.paddingTop = 8;
userRow.paddingBottom = 8;
userRow.paddingLeft = 12;
userRow.paddingRight = 12;
userRow.itemSpacing = 10;
userRow.cornerRadius = 6;
userRow.fills = [];
footer.appendChild(userRow);
userRow.layoutSizingHorizontal = "FILL";

// Avatar circle
const avatar = figma.createFrame();
avatar.name = "Avatar";
avatar.resize(28, 28);
avatar.cornerRadius = 14;
avatar.fills = [{ type: "SOLID", color: { r: 0.545, g: 0.361, b: 0.965 } }]; // primary purple
userRow.appendChild(avatar);

const avatarText = figma.createText();
avatarText.characters = "АК";
avatarText.fontSize = 11;
avatarText.fontName = { family: "Inter", style: "Regular" };
avatarText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
// Center in avatar — use auto layout
avatar.layoutMode = "HORIZONTAL";
avatar.primaryAxisAlignItems = "CENTER";
avatar.counterAxisAlignItems = "CENTER";
avatar.appendChild(avatarText);

// Name + email column
const nameCol = figma.createFrame();
nameCol.name = "Name Col";
nameCol.layoutMode = "VERTICAL";
nameCol.itemSpacing = 0;
nameCol.fills = [];
userRow.appendChild(nameCol);
nameCol.layoutSizingHorizontal = "FILL";
nameCol.layoutGrow = 1;

const nameText = figma.createText();
nameText.characters = "Арслан К.";
nameText.fontSize = 12;
nameText.fontName = { family: "Inter", style: "Medium" };
nameText.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
nameCol.appendChild(nameText);

const emailText = figma.createText();
emailText.characters = "arslan@afina.ai";
emailText.fontSize = 11;
emailText.fontName = { family: "Inter", style: "Regular" };
emailText.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
nameCol.appendChild(emailText);

// Chevron (small up arrow as text or simple triangle)
const chevronText = figma.createText();
chevronText.characters = "∧";
chevronText.fontSize = 11;
chevronText.fontName = { family: "Inter", style: "Regular" };
chevronText.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
userRow.appendChild(chevronText);

return { footerId: footer.id };
```

- [ ] **Step 4: Screenshot the sidebar**

Use `get_screenshot` on `sidebarId`. Check:
- Logo at top with correct spacing
- Запустить + gap + Сигналы/Кампании/Статистика stacked vertically
- Кампании has active (slightly lighter) background
- Badges on Сигналы (3) and Кампании (2)
- Balance block and user row at bottom

Fix any visual issues before proceeding.

---

## Task 4: Build the main content area

**Files:**
- Modify: wrapper frame

The main area is `flex-1` (fills remaining 1220px). It has:
- Centered content area with step 1 scenario grid
- Pinned chat input bar at bottom with border-top

- [ ] **Step 1: Create main area wrapper**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");

const main = figma.createFrame();
main.name = "Main Content";
main.layoutMode = "VERTICAL";
main.fills = [{ type: "SOLID", color: { r: 0.035, g: 0.035, b: 0.043 } }]; // #09090b
main.primaryAxisSizingMode = "FIXED";
main.counterAxisSizingMode = "FIXED";
main.resize(1220, 900);
wrapper.appendChild(main);
main.layoutSizingHorizontal = "FILL";
main.layoutSizingVertical = "FILL";
main.layoutGrow = 1;
main.itemSpacing = 0;

return { mainId: main.id };
```

- [ ] **Step 2: Create the step content area (centered, with title + scenario grid)**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
await figma.loadFontAsync({ family: "Inter", style: "SemiBold" });

const main = await figma.getNodeByIdAsync("MAIN_ID");

// Step content area — fills flex-1 (main minus chat bar), centers content
const stepArea = figma.createFrame();
stepArea.name = "Step Area";
stepArea.layoutMode = "VERTICAL";
stepArea.primaryAxisAlignItems = "CENTER";
stepArea.counterAxisAlignItems = "CENTER";
stepArea.paddingTop = 40;
stepArea.paddingBottom = 40;
stepArea.paddingLeft = 32;
stepArea.paddingRight = 32;
stepArea.fills = [];
stepArea.itemSpacing = 0;
main.appendChild(stepArea);
stepArea.layoutSizingHorizontal = "FILL";
stepArea.layoutSizingVertical = "FILL";
stepArea.layoutGrow = 1;

// Step content inner (max-w-2xl ≈ 672px wide)
const stepInner = figma.createFrame();
stepInner.name = "Step Inner";
stepInner.layoutMode = "VERTICAL";
stepInner.primaryAxisAlignItems = "MIN";
stepInner.counterAxisAlignItems = "MIN";
stepInner.itemSpacing = 24;
stepInner.fills = [];
stepInner.resize(672, 10);
stepInner.primaryAxisSizingMode = "AUTO";
stepInner.counterAxisSizingMode = "FIXED";
stepArea.appendChild(stepInner);

// Title block
const titleBlock = figma.createFrame();
titleBlock.name = "Title Block";
titleBlock.layoutMode = "VERTICAL";
titleBlock.itemSpacing = 6;
titleBlock.fills = [];
stepInner.appendChild(titleBlock);
titleBlock.layoutSizingHorizontal = "FILL";

const title = figma.createText();
title.characters = "Создайте новую кампанию";
title.fontSize = 24;
title.fontName = { family: "Inter", style: "SemiBold" };
title.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
titleBlock.appendChild(title);

const subtitle = figma.createText();
subtitle.characters = "Выберите сценарий — мы зададим нужные вопросы";
subtitle.fontSize = 14;
subtitle.fontName = { family: "Inter", style: "Regular" };
subtitle.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
titleBlock.appendChild(subtitle);

return { stepAreaId: stepArea.id, stepInnerId: stepInner.id, titleBlockId: titleBlock.id };
```

- [ ] **Step 3: Create scenario cards grid (3×2)**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });

const stepInner = await figma.getNodeByIdAsync("STEP_INNER_ID");

const SCENARIOS = [
  { name: "Регистрация", description: "Возврат пользователей после незавершённой регистрации или брошенной корзины" },
  { name: "Первая сделка", description: "Обогащение данных о клиенте, оценка потенциала и рисков" },
  { name: "Апсейл", description: "Мониторинг интереса к конкурентам, предотвращение оттока" },
  { name: "Удержание", description: "Мониторинг интереса к конкурентам и предотвращение оттока" },
  { name: "Возврат", description: "Определение оптимального момента для повторного контакта" },
  { name: "Реактивация", description: "Определение оптимального момента для повторного контакта" },
];

// Grid: 2 rows × 3 cols using nested HORIZONTAL frames
// Row 1: cols 0-2, Row 2: cols 3-5
const grid = figma.createFrame();
grid.name = "Scenario Grid";
grid.layoutMode = "VERTICAL";
grid.itemSpacing = 12;
grid.fills = [];
stepInner.appendChild(grid);
grid.layoutSizingHorizontal = "FILL";

for (let row = 0; row < 2; row++) {
  const rowFrame = figma.createFrame();
  rowFrame.name = `Row ${row + 1}`;
  rowFrame.layoutMode = "HORIZONTAL";
  rowFrame.itemSpacing = 12;
  rowFrame.fills = [];
  grid.appendChild(rowFrame);
  rowFrame.layoutSizingHorizontal = "FILL";

  for (let col = 0; col < 3; col++) {
    const scenario = SCENARIOS[row * 3 + col];
    const card = figma.createFrame();
    card.name = `Card / ${scenario.name}`;
    card.layoutMode = "VERTICAL";
    card.primaryAxisAlignItems = "MIN";
    card.counterAxisAlignItems = "MIN";
    card.paddingTop = 16;
    card.paddingBottom = 16;
    card.paddingLeft = 16;
    card.paddingRight = 16;
    card.itemSpacing = 4;
    card.cornerRadius = 8;
    card.fills = [{ type: "SOLID", color: { r: 0.094, g: 0.094, b: 0.106 } }]; // #18181b card
    card.strokes = [{ type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.161 } }]; // #27272a border
    card.strokeWeight = 1;
    card.strokeAlign = "INSIDE";

    const cardTitle = figma.createText();
    cardTitle.characters = scenario.name;
    cardTitle.fontSize = 14;
    cardTitle.fontName = { family: "Inter", style: "Medium" };
    cardTitle.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
    card.appendChild(cardTitle);

    const cardDesc = figma.createText();
    cardDesc.characters = scenario.description;
    cardDesc.fontSize = 12;
    cardDesc.fontName = { family: "Inter", style: "Regular" };
    cardDesc.fills = [{ type: "SOLID", color: { r: 0.631, g: 0.631, b: 0.659 } }];
    cardDesc.lineHeight = { unit: "PERCENT", value: 150 };
    card.appendChild(cardDesc);

    rowFrame.appendChild(card);
    card.layoutSizingHorizontal = "FILL";
    card.layoutSizingVertical = "HUG";
  }
}

return { gridId: grid.id };
```

---

## Task 5: Build the chat input bar

**Files:**
- Modify: main content frame

The chat input bar is pinned to the bottom: border-top, py-4 px-8, max-w-2xl centered. It has a rounded input field with placeholder text + mic icon + send button.

- [ ] **Step 1: Create the chat input bar**

```js
await figma.setCurrentPageAsync(figma.root.children[0]);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });

const main = await figma.getNodeByIdAsync("MAIN_ID");

// Chat bar outer (full width, border top)
const chatBar = figma.createFrame();
chatBar.name = "Chat Bar";
chatBar.layoutMode = "HORIZONTAL";
chatBar.primaryAxisAlignItems = "CENTER";
chatBar.counterAxisAlignItems = "CENTER";
chatBar.paddingTop = 16;
chatBar.paddingBottom = 16;
chatBar.paddingLeft = 32;
chatBar.paddingRight = 32;
chatBar.fills = [{ type: "SOLID", color: { r: 0.035, g: 0.035, b: 0.043 } }]; // #09090b
chatBar.strokes = [{ type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.161 } }]; // border-border
chatBar.strokeWeight = 1;
chatBar.strokeTopWeight = 1;
chatBar.strokeBottomWeight = 0;
chatBar.strokeLeftWeight = 0;
chatBar.strokeRightWeight = 0;
chatBar.strokeAlign = "INSIDE";
chatBar.itemSpacing = 0;
main.appendChild(chatBar);
chatBar.layoutSizingHorizontal = "FILL";

// Inner container max-w-2xl (672px) centered
const chatInner = figma.createFrame();
chatInner.name = "Chat Inner";
chatInner.layoutMode = "VERTICAL";
chatInner.itemSpacing = 0;
chatInner.fills = [];
chatInner.resize(672, 10);
chatInner.primaryAxisSizingMode = "AUTO";
chatInner.counterAxisSizingMode = "FIXED";
chatBar.appendChild(chatInner);

// Input box
const inputBox = figma.createFrame();
inputBox.name = "Input Box";
inputBox.layoutMode = "VERTICAL";
inputBox.paddingTop = 12;
inputBox.paddingBottom = 0;
inputBox.paddingLeft = 16;
inputBox.paddingRight = 16;
inputBox.itemSpacing = 8;
inputBox.cornerRadius = 12;
inputBox.fills = [{ type: "SOLID", color: { r: 0.094, g: 0.094, b: 0.106 } }]; // #18181b
inputBox.strokes = [{ type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.161 } }];
inputBox.strokeWeight = 1;
inputBox.strokeAlign = "INSIDE";
chatInner.appendChild(inputBox);
inputBox.layoutSizingHorizontal = "FILL";

// Placeholder text
const placeholderText = figma.createText();
placeholderText.characters = "Опишите вашу кампанию...";
placeholderText.fontSize = 14;
placeholderText.fontName = { family: "Inter", style: "Regular" };
placeholderText.fills = [{ type: "SOLID", color: { r: 0.43, g: 0.43, b: 0.46 } }]; // #6b7280 placeholder
inputBox.appendChild(placeholderText);
placeholderText.layoutSizingHorizontal = "FILL";

// Toolbar row (mic button + send button)
const toolbar = figma.createFrame();
toolbar.name = "Toolbar";
toolbar.layoutMode = "HORIZONTAL";
toolbar.primaryAxisAlignItems = "CENTER";
toolbar.counterAxisAlignItems = "CENTER";
toolbar.paddingTop = 8;
toolbar.paddingBottom = 8;
toolbar.fills = [];
toolbar.itemSpacing = 8;
inputBox.appendChild(toolbar);
toolbar.layoutSizingHorizontal = "FILL";

// Mic placeholder (small circle button)
const micBtn = figma.createFrame();
micBtn.name = "Mic Btn";
micBtn.resize(32, 32);
micBtn.cornerRadius = 6;
micBtn.fills = [];
toolbar.appendChild(micBtn);

// Spacer
const toolbarSpacer = figma.createFrame();
toolbarSpacer.name = "spacer";
toolbarSpacer.fills = [];
toolbarSpacer.resize(10, 1);
toolbar.appendChild(toolbarSpacer);
toolbarSpacer.layoutSizingHorizontal = "FILL";
toolbarSpacer.layoutGrow = 1;

// Send button (rounded, purple-ish)
const sendBtn = figma.createFrame();
sendBtn.name = "Send Btn";
sendBtn.resize(32, 32);
sendBtn.cornerRadius = 6;
sendBtn.fills = [{ type: "SOLID", color: { r: 0.545, g: 0.361, b: 0.965 } }]; // primary purple
toolbar.appendChild(sendBtn);

const sendText = figma.createText();
sendText.characters = "↑";
sendText.fontSize = 16;
sendText.fontName = { family: "Inter", style: "Regular" };
sendText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
sendBtn.layoutMode = "HORIZONTAL";
sendBtn.primaryAxisAlignItems = "CENTER";
sendBtn.counterAxisAlignItems = "CENTER";
sendBtn.appendChild(sendText);

return { chatBarId: chatBar.id };
```

---

## Task 6: Screenshot validation

- [ ] **Step 1: Screenshot the full wrapper**

Use `get_screenshot` on the wrapper node ID. Compare side-by-side with node `45:6146` (browser capture).

Check:
- [ ] Sidebar is 220px, dark bg, logo top
- [ ] Nav items: icon above text, correct icons, badges on Сигналы (3) + Кампании (2)
- [ ] Кампании item has active (accent) background
- [ ] 24px gap between Запустить and the rest of nav
- [ ] Balance block and user row at footer
- [ ] Main area fills remaining width
- [ ] "Создайте новую кампанию" title + subtitle visible
- [ ] 3×2 card grid with correct scenario names and descriptions
- [ ] Chat input bar at bottom with border-top

- [ ] **Step 2: Fix any visual discrepancies**

Targeted `use_figma` calls to fix specific issues found in Step 1. Do NOT rebuild entire screen — fix only what's broken.

Common issues to watch for:
- Icon color not updating (may need to traverse deeper into component instance children)
- Text truncation (increase frame height or use HUG sizing)
- Badge position off (adjust x/y absolute coordinates)
- Card text wrapping issues (check lineHeight and frame width)
- Chat input bar too tall or compressed

---

## Self-Review

**Spec coverage:**
- ✅ Sidebar structure (logo, nav with icons+badges, spacer, footer)
- ✅ Proper Lucide icons from connected library
- ✅ Active state on Кампании nav item
- ✅ Auto Layout throughout (all sections)
- ✅ Step 1 scenario grid (3×2, 6 cards)
- ✅ Chat input bar pinned to bottom
- ✅ Visual match validation step

**Potential gaps:**
- Icon recoloring inside component instances may require detaching — if `child.fills` assignment fails on instance children, use `iconInst.fills` override or detach with `iconInst.detachInstance()` first then recolor
- `strokeTopWeight` may not be supported in all Figma versions — fallback: use a separate 1px tall separator frame above chat bar
