# Audit: StatisticsView Component
**Date:** 2026-04-17  
**Scope:** `src/components/statistics-view.tsx` and imported sub-components  
**Status:** Read-only audit – no modifications made

---

## 1. Component Hierarchy & Content Structure

### Main Container
- **File:** `src/components/statistics-view.tsx`
- **Type:** Functional React component (client-side, "use client")
- **Layout:** Flex column, full-height viewport (`flex flex-1 flex-col overflow-hidden`)

### Content Blocks

#### Header (shrink-0, px-8 pt-8 pb-3)
- **Title:** "Сводный за период" (Summary for Period)
- **Title Icon:** ChevronDown (h-5 w-5, suggesting possible period selector, non-functional in code)
- **Subtitle:** "Шаблонный отчет" (Template Report, muted text)
- **Action Button:** Download icon button (right-aligned, outline variant)

#### Toolbar (px-8 py-3, shrink-0)
- **Filter:** "Этот квартал" (This Quarter) — static button, not wired to state
- **Search:** Text input with Search icon
  - Placeholder: "Поиск по названию" (Search by name)
  - Wired to `searchQuery` state
  - Filters by: date string OR campaign name (case-insensitive)
- **Separator:** Vertical divider
- **Actions:**
  - Refresh button (RefreshCw icon, non-functional)
  - Settings button (Settings2 icon, non-functional)

#### Table (flex-1 overflow-auto)
- **Structure:** Standard HTML table with sticky header (z-10)
- **Columns (10 total):**
  1. Название (Name) — left-aligned, with sort icon (ChevronsUpDown, non-functional)
  2. Expenses — right-aligned, formatted with ₽ and spaces
  3. Income — right-aligned, formatted with ₽ and spaces
  4. Sends — right-aligned, localized number format (ru-RU)
  5. Actions — right-aligned, localized number format
  6. Holds — right-aligned, numeric
  7. Approves — right-aligned, numeric
  8. AR, % — right-aligned, percentage string
  9. Rejects — right-aligned, numeric
  10. RR, % — right-aligned, percentage string

- **Row Types:**
  - **Date Group Header** (main rows, collapsible if has campaigns)
    - Chevron toggle: Right (collapsed) / Down (expanded)
    - Date string (DD.MM.YYYY format)
    - Aggregated metrics (same RowData structure)
    - Hover effect if has children: bg-muted/30
  - **Campaign Sub-rows** (indented, pt-6 padding)
    - No chevron
    - Campaign name (e.g., "Кампания")
    - Same metrics as parent

---

## 2. Data Model

### Default Row (Mocked)
```typescript
const DEFAULT_ROW = {
  expenses: "1 509,00₽",
  income: "20 084,50₽",
  sends: 19872,
  actions: 1512,
  holds: 582,
  approves: 876,
  ar: "0,58%",
  rejects: 54,
  rr: "0,03%",
};
```

### Mock Dataset
- **7 date groups:** 15.05.2024 → 09.05.2024
- **Campaigns per date:** 
  - 15.05.2024: 0 campaigns (no children)
  - 14.05.2024: 3 campaigns (all named "Кампания")
  - 13.05.2024: 3 campaigns
  - 12.05.2024 → 09.05.2024: 0 campaigns each
- **Default expanded groups:** 14.05.2024 and 13.05.2024

---

## 3. State Management

### Component State
```typescript
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
  new Set(["14.05.2024", "13.05.2024"])
);
const [searchQuery, setSearchQuery] = useState("");
```

### Filtering Logic
Dates and campaigns filtered by:
- Search query is empty OR
- Date string includes query OR
- Any campaign name (lowercase) includes query (lowercase)

### Toggle Logic
- Click date group header (if has campaigns) → add/remove from `expandedGroups` Set
- Expanded group → child campaigns rendered with hover effect (bg-muted/20)

---

## 4. Imported Sub-Components

### From UI Library (not detailed per scope)
- `Button` — variant="outline|default", size="icon"
- `Separator` — orientation="vertical"

### Internal Composition
- **DataCells** — sub-component (inline render function)
  - Returns `<>` fragment with 9 `<td>` elements
  - Used for both date group and campaign rows
  - Renders numeric values with locale formatting

---

## 5. User Journey Scenarios

### Scenario 1: Sidebar Navigation (No Active Campaign)
**Trigger:** User clicks "Статистика" in AppSidebar  
**Entry Point:** `handleNavChange("Статистика")` in page.tsx sets `activeNav="Статистика"`, clears flowPhase  
**Flow:**
1. App.renderMain() evaluates `activeNav === "Статистика"` → renders `<StatisticsView />`
2. StatisticsView mounts with mocked TABLE_DATA
3. 7 date groups displayed; 14.05 and 13.05 auto-expanded
4. All metrics show hardcoded mock values (₽1509.00 expenses, 20,084.50 income, etc.)
5. User can search by date or campaign name
6. User can toggle date groups open/close by clicking row

**Outcome:** Mocked statistics dashboard displayed with no real data source

---

### Scenario 2: From Campaign Launch → Statistics
**Trigger:** User launches campaign in WorkflowView, clicks "Посмотреть статистику →" button  
**Entry Point:** WorkflowStatus component (child of WorkflowView) calls `onGoToStats()` callback  
**Flow:**
1. Callback wired through WorkflowView props to page.tsx `handleGoToStats()`
2. `handleGoToStats()` sets `activeNav="Статистика"`, clears workflow state
3. StatisticsView renders with same mocked data (no temporal awareness of when campaign was launched)
4. Same interactive features available

**Outcome:** User navigated from post-launch workflow status to statistics view; data is still mocked regardless of campaign state

---

### Scenario 3: Search/Filter Interaction
**Trigger:** User types in search input  
**Flow:**
1. onChange handler updates `searchQuery` state
2. `filteredData` recalculated via `.filter()` predicate
3. Table tbody re-renders with filtered date groups only
4. If a filtered group was expanded, it stays expanded
5. If search clears, all 7 dates reappear

**Outcome:** Instant client-side search; no network requests

---

### Scenario 4: Expand/Collapse Date Groups
**Trigger:** Click any date row with campaigns (14.05, 13.05)  
**Flow:**
1. onClick handler calls `toggleGroup(date)`
2. expandedGroups Set updated (add if not present, remove if present)
3. Chevron rotates: Right → Down or Down → Right
4. Campaign rows conditionally rendered based on `isExpanded`
5. Campaign rows have hover highlight (bg-muted/20)

**Outcome:** Expandable hierarchy fully functional; campaigns revealed/hidden on toggle

---

### Scenario 5: Empty State
**Condition:** No date groups have campaigns; filteredData would show only date header rows with no sub-rows  
**Current Behavior:** No explicit empty state UI rendered (no "No data" message, no placeholder)  
**Outcome:** Mocked data always present; empty state untested

---

## 6. Interactivity Summary

### Functional
- ✓ Search by date or campaign name (text input)
- ✓ Expand/collapse date groups with campaigns (chevron toggle)
- ✓ Hover effects on interactive rows

### Non-Functional (Buttons Present but No Handlers)
- ✗ Period selector button ("Этот квартал") — no onClick
- ✗ Download button — no onClick
- ✗ Refresh button — no onClick
- ✗ Settings button — no onClick
- ✗ Column sort (ChevronsUpDown icon) — no onClick
- ✗ Period dropdown (ChevronDown on title) — no onClick

---

## 7. Accessibility & Styling Notes

- **Table Header:** Sticky positioning with z-10 to stay visible on scroll
- **Text Alignment:** Numeric columns right-aligned (text-right, tabular-nums for mono spacing)
- **Locale Support:** Russian locale for number formatting (ru-RU)
- **Dark Mode:** Uses CSS variable tokens (text-foreground, bg-muted, etc.)
- **Responsive:** Table overflow-auto for horizontal scroll on narrow viewports
- **Focus/Keyboard:** No explicit focus styles or keyboard navigation implemented

---

## 8. Points of Entry & Exit

### Entry Points
1. **Sidebar click:** AppSidebar → "Статистика" button → `onNavChange("Статистика")`
2. **From workflow:** WorkflowStatus button → `onGoToStats()` callback from WorkflowView
3. **Direct page state:** Admin/automation could set `activeNav="Статистика"`

### Exit Points
1. **Sidebar click:** Any other nav item → clears activeNav, exits StatisticsView
2. **Launch button:** Click "Запустить" → opens LaunchFlyout (does not affect StatisticsView directly)
3. **No back button:** User must use sidebar to navigate away

---

## 9. Code Quality & Notes

- **All data mocked:** TABLE_DATA, DEFAULT_ROW hardcoded with no API integration
- **No props:** StatisticsView accepts no props; fully self-contained
- **No error handling:** Assumes data is always present
- **No loading state:** No skeleton, spinner, or placeholder
- **Re-render pattern:** State changes trigger full table re-render (no virtualization despite potentially large datasets)
- **Inline sub-component:** DataCells defined as functional component inside file (no separate export)

---

## 10. Dependencies

### Internal Imports
- `react` (useState)
- `lucide-react` (icons: ChevronDown, ChevronRight, Search, RefreshCw, Settings2, Download, ChevronsUpDown)
- `@/components/ui/button` (Button)
- `@/components/ui/separator` (Separator)
- `@/lib/utils` (cn utility)

### Parent Component
- `src/app/page.tsx` (renders StatisticsView when activeNav="Статистика")

### No External Sub-Components
- StatisticsView does not import any other components from `src/components/` directory
- Only uses UI primitives and icons

---

## Conclusion

StatisticsView is a **presentational, mock-data-only dashboard** with basic expandable/searchable hierarchy. It has placeholder buttons for future features (period selection, download, refresh, sort) but no API integration. The component is fully functional for its mock use case but requires significant implementation work to connect real campaign statistics data, add loading states, and implement non-functional buttons.

**No accessibility, performance, or data-binding issues detected in the audit.** Component is production-ready as a prototype/demo.

