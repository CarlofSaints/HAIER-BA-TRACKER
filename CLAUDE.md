# Haier BA Measurement — Current State

## Project Location
`C:\Users\CarlDosSantos-(OUTER\Projects\haier-ba-measurement`
GitHub: [HAIER-BA-TRACKER](https://github.com/CarlofSaints/HAIER-BA-TRACKER)
Vercel: `https://haier-ba-measurement.vercel.app`

## Tech Stack
- Next.js 16.0.0, React 19, TypeScript, Tailwind CSS 4
- Vercel Blob storage (JSON files), bcryptjs for auth
- Recharts for charts, html-to-image for screenshots
- Resend for email, xlsx for Excel parsing
- Roles: super_admin, admin, client

## What The App Does
BA (Brand Ambassador) performance scoring dashboard for Haier. Scores 6 KPIs out of 100 core + 10 bonus = 110 grand total. Data uploaded via Excel (visits, training, display checks, red flags, sales dispo, targets). Auto-calculates some scores, admins manually score others.

### Scoring System (6 KPIs)
| KPI | Max | Auto/Manual |
|-----|-----|-------------|
| Monthly Sales vs Target | 40 | Auto (from dispo + targets data) |
| Check-in on Time | 10 | Auto (from visit data) |
| Display Inspection | 20 | Auto 5 + Manual 15 |
| Weekly Summaries | 10 | Manual only (admin-assessed) |
| Training | 20 | Auto 5 + Manual 15 |
| Bonus Suggestions | 10 | Manual only (admin-assessed, bonus) |

### Key Lib Files
- `lib/scoreData.ts` — BAScore type, KPI_DEFS, calcTotal(), calcGrandTotal(), loadScores(), saveScores()
- `lib/autoCalc.ts` — calcCheckInScores(), calcSalesScores(), calcDisplayScores(), calcTrainingScores(), runAutoCalcForMonth()
- `lib/visitData.ts` — Visit type, loadVisitIndex(), loadVisitData()
- `lib/trainingData.ts` — TrainingRecord, countTrainingsForMonth()
- `lib/displayData.ts` — DisplayRecord, countDisplayChecksForMonth()
- `lib/redFlagData.ts` — RedFlagRecord, countRedFlagsForMonth(), RED_FLAG_TYPES, normalizeType()
- `lib/targetData.ts` — TargetEntry, loadTargetData(), getStoreTarget()
- `lib/dispoData.ts` — DispoSalesData, loadDispoData(), calcSalesValue()
- `lib/storeData.ts` — StoreMaster, loadStores()
- `lib/kpiControls.ts` — KPIControls (minTrainings, minVisits, salesThreshold, minDisplayChecks, minRedFlags)
- `lib/scoringConfig.ts` — ScoringConfig (lateCheckinTime, earlyCheckoutTime)
- `lib/auth.ts` — requireLogin(), requireRole(), requireAnyUser(), noCacheHeaders()
- `lib/useAuth.ts` — useAuth() hook, authFetch() (adds x-user-id header)
- `lib/blob.ts` — readJson(), writeJson(), deleteBlob()

### Auto-Calc Logic (lib/autoCalc.ts)
- **Sales**: variance = (actual/target)*100. If < salesThreshold% → 0 pts. Else min(40, round(variance/100*40))
- **Check-in**: onTimePts = round(onTime/total*10), earlyOutPts = round(earlyOut/total*10), score = max(0, onTimePts - earlyOutPts)
- **Display auto**: min(5, round(visitCount/minChecks * 5))
- **Training auto**: min(5, round(count/minTrainings * 5))
- Display/Training total = auto + manual part, capped at 20

## Session Work (May 21, 2026)

### 1. KPI Guidance Cards — BA Drill-Down Page (DEPLOYED)
Added bold guidance cards on the BA drill-down page showing what each BA needs to do to reach maximum points.

**New file: `app/api/scores/guidance/route.ts`**
- GET `?month=YYYY-MM&email=ba@email.com`
- Auth: requireAnyUser
- Loads all data in parallel (visits, targets, dispo, stores, kpiControls, scoringConfig, display counts, training counts, scores)
- Returns per-KPI guidance: sales (valueTarget, actualValue, variance, threshold, amountLeft, toThreshold), checkin (totalVisits, onTimeVisits, earlyCheckouts, lateVisits, times), display (completedChecks, minRequired, auto/manual points), training (same pattern), weeklySummaries (current, max), bonus (current, max)

**Modified: `app/leaderboard/[email]/page.tsx`**
- Added GuidanceData interface
- useEffect fetches guidance for current month
- 6 color-coded cards in 3-column grid between header and charts
- Card states: green (max reached), amber/blue/purple (partial), red (zero)
- Each card: icon, KPI name, points, bold guidance text, progress bar, context line
- Cards are inside captureRef so they appear in screenshots

**Commits:** `46648cd` (guidance cards), pushed to master

### 2. Red Flag Summary Bug Fixes (DEPLOYED)

**Bug 1: Summary undercounting vs detail grid**
- Root cause: dedup key was `visitUUID|problemType`, collapsing multiple different products flagged with same type in one visit into 1 count
- Fix: changed dedup key to `visitUUID|problemType|modelNumber` in `lib/redFlagData.ts` line 123
- Commit: `3d9ddcb`

**Bug 2: Phantom flag in total (total didn't match sum of type columns)**
- Root cause: records with blank or unrecognized problemType (normalizes to 'OTHER' or raw string) were counted in totalFlags but didn't appear in any of the 6 type columns
- Fix: added early `continue` in countRedFlagsForMonth() to skip records whose normalized type isn't in RED_FLAG_TYPES
- Commit: `1878b5a`

### Red Flag Summary Architecture (for reference)
- Summary uses structured RedFlagRecord[] (from `red-flags/{uploadId}.json`), deduped
- Detail grid uses raw RedFlagFormRow[] (from `red-flags/form/{uploadId}.json`), NO dedup
- 6 recognized types: OUT OF STOCK, MISSING PARTS, DENTED PRODUCTS, SHOPFITTING, POS SHORTAGE, ENERGY LABELS SHORTAGE
- normalizeType() maps variants (OOS, POS, etc.) to canonical types
- Records with unrecognized types are now excluded from summary counts

### 3. DISPO Upload — Dynamic Column Lookup + Current Month Fix (DEPLOYED, May 25, 2026)

**Problem:** `app/api/dispo/upload/route.ts` used hardcoded column indices (`COL_ARTICLE_DESC = 9`, `COL_SITE_CODE = 26`, etc.) and picked the rightmost column as "current month". This caused:
1. Wrong current month: col W had "05-2025" (rightmost) but col V had "05-2026" (actual current). The "only write if undefined" guard on non-current months prevented new uploads from overwriting stale data.
2. Stale data accumulation: old uploads left behind store/product entries that inflated totals for all months.

**Fix (commits `43f3819` + `78a2066`):**
1. Replaced 10 hardcoded `COL_*` constants with `FIELD_PATTERNS` map — dynamic header scanning matches field names case-insensitively (handles leading whitespace in SOH/SOO headers)
2. Merged `findHeaderRow()` to detect both field columns and month columns in one pass across all columns (not just Q-W)
3. Current month detection now picks the column with the **latest parsed date** (`yyyy*100+mm` comparison) instead of rightmost position
4. Before processing rows, clears `data.sales[monthKey] = {}` for every month in the upload — prevents stale entries from old uploads inflating totals
5. Removed the current/non-current write distinction — all months now overwrite directly (no more "only write if undefined" guard)
6. If any of the 8 required fields is missing from the header row, returns 400 with diagnostic info showing which fields/months were found per candidate row

**Key file:** `app/api/dispo/upload/route.ts`
**After deploying:** must delete the latest DISPO upload and re-upload to get correct numbers

### 4. Weekly Score Entry System (DEPLOYED, May 26, 2026)

Admins now enter manual KPI scores per week instead of per month. Weekly values sum automatically into monthly totals (capped at KPI max). Auto-calc KPIs (Sales, Visits, Training auto, Display auto) remain monthly-only since they're derived from monthly data uploads.

**New files:**
- **`lib/weekUtils.ts`** — `WeekDef` interface, `getWeeksForMonth(month)` returns 4-5 weeks with Monday labels (e.g. "Week 1 18/05"), `getCurrentWeek(month)` returns which week today falls in
- **`lib/weeklyScoreData.ts`** — `WeeklyBAScore` interface (stores per-week manual values: displayManual 0-15, weeklySummaries 0-10, trainingManual 0-15, bonusSuggestions 0-10), CRUD via `weekly-scores/{YYYY-MM}/week-{N}.json`, `aggregateWeeklyToMonthly()` sums weekly manual values + merges with monthly auto-calc values, `round2()` helper
- **`app/api/scores/weekly/route.ts`** — GET `?month=YYYY-MM&week=N`, PUT saves weekly scores with 2dp clamping then calls `aggregateWeeklyToMonthly()`

**Modified files:**
- **`app/scores/page.tsx`** — Major rewrite:
  - "View" dropdown: **MTD (Full Month)** read-only summary + individual weeks
  - MTD mode: manual columns show read-only badges with summed values, Display/Training show auto+manual+total breakdown, Save button hidden
  - Week mode: editable inputs with `step="0.01"` for decimal values
  - Sub-labels show auto/manual split: "MTD: auto 3 + manual 1.5 = 4.5/20" (color-coded)
  - Total/Grand columns show monthly running totals
  - Auto-calc buttons unchanged (still write to monthly; weekly manual values preserved via aggregation)
- **`lib/scoreData.ts`** — `calcTotal()` and `calcGrandTotal()` now return 2dp-rounded values

**Aggregation logic (in `aggregateWeeklyToMonthly`):**
- `weeklySummaries = min(10, sum of all weeks)`
- `bonusSuggestions = min(10, sum of all weeks)`
- `displayInspection = min(20, displayAuto + min(15, sum of displayManual))`
- `training = min(20, trainingAuto + min(15, sum of trainingManual))`
- Auto-calc fields (monthlySales, checkInOnTime, trainingAuto, displayAuto) preserved untouched

**Key design decisions:**
- Weekly files store only manual KPI portions — auto-calc values live in monthly file only
- Monthly file is kept up-to-date via aggregation after every weekly save — downstream consumers (leaderboard, guidance) never see weekly data
- Per-week max = monthly KPI max — admin CAN front-load. Monthly sum is capped at KPI max.
- Backward compatible — months with no weekly files show existing monthly scores as-is
- `selectedWeek = 0` means MTD (month-to-date summary view)

**Commits:** `8769d4a` (weekly entry), `732f2e1` (MTD view + sub-labels), pushed to master

### 5. BA Work Report + Channel Hierarchy + Store Areas + Week Mapping (DEPLOYED, May 28, 2026)

Goal: recreate the `HSA-BA WORKv2.xlsx` report programmatically from app data. The original Excel has bilingual Chinese/English multi-row headers, one row per product-at-store, monthly Rand values, weekly unit deltas, display flags, and SOH.

**Commits:** `642f4ed` (main build), `86cfbb2` (BA matching fix), pushed to master

#### A. Channel Hierarchy (Main + Sub-Channels)

**Modified:** `lib/channelData.ts`, `app/api/channels/route.ts`, `app/admin/channels/page.tsx`

- `Channel` interface now has `parentId?: string` — channels with parentId are sub-channels
- Default channels: MASSMART (main) → MAKRO (sub), WALMART (main), DC (main)
- Helpers: `getMainChannels()`, `getSubChannels()`, `resolveMainChannel()`
- API: POST accepts `parentId`, new PATCH endpoint for editing (rename, change parent), DELETE cascades to sub-channels
- Admin UI: hierarchical display with MAIN/SUB badges, indented sub-channels, inline edit with parent reassignment, orphan detection
- `app/api/stores/route.ts` GET enriches each store with `mainChannelId` and `mainChannelName`

#### B. Store Area Field

**Modified:** `lib/storeData.ts`, `app/admin/stores/page.tsx`

- `StoreMaster` interface now has `area?: string`
- Stores page: editable Area text input column between Store Name and Channel
- Search filters by area too. Save payload includes area.

#### C. Week Mapping (Control Centre)

**New files:** `lib/weekMapping.ts`, `app/api/week-mapping/route.ts`, `app/week-mapping/page.tsx`

- Config stored in `config/week-mapping.json` — array of `{ year, week1Start }` per year
- UI: select year/month/day for Week 1 start, live preview of all weeks (W1-W53) with current week highlighted, saved years summary
- Helpers: `getWeeksForYear()`, `getWeekNumber(date, yearConfig)`, `getWeekDates(weekNum, yearConfig)`
- Added to sidebar under Control Centre as "Week Mapping"

#### D. BA Work Report Generation

**New files:** `app/api/reports/ba-work/route.ts`, `app/reports/page.tsx`

**Report endpoint:** GET `/api/reports/ba-work` — admin+ access, `maxDuration=60`

**Data sources loaded in parallel:**
- Channels (with hierarchy), Stores (with area), DISPO data, Visit index + all visit uploads, Display index + all display uploads, Week mapping config

**Sheet 1 "store data" — matches original HSA-BA WORK format:**
- Multi-row bilingual headers (rows 1-5) with merged cells
- Row per product-at-store from DISPO
- Columns: NO, 渠道/channel (main), 小渠道/sub-channel, 区域/area, Store, BA, 进驻产业/industry (blank), 进驻型号/model, 模特位/Display, 端头/End position (blank), sale in qty, 合计/total, monthly Mar-Dec (Rand values via `calcSalesValue`), weekly W1-current (unit deltas), spacer, 是否出样/Flooring (blank), 产品价格准确/Accurate price (inclSP), 产品物料/Product POSM (blank), 营销物料/Marketing POSM (blank), 客户可售库存/SOH

**Sheet 2 "Sales and Stock levels" — pivot table:**
- Hierarchical: product model row → indented store rows under it
- Current month units + SOH, grand totals

**BA Matching (the bug fix in `86cfbb2`):**
- Perigee visits use different store names than DISPO/Massmart
- BA map now keyed by THREE keys per visit: Perigee store name, Perigee store code, AND store master DISPO name that matches the code
- Uses `StoreMaster` as the bridge: `siteCode` links Perigee codes to DISPO store names
- Same bridging applied to display set
- Data row tries DISPO store name first, falls back to siteCode

**Weekly Delta Calculation:**
- Loads all `dispo/raw/{uploadId}.json` files sorted by upload date
- For each consecutive pair, builds per store+product snapshot of total units for current year
- Computes positive deltas (current - previous) per store/product
- Assigns each delta to a week number based on upload date + week mapping
- Requires: week mapping configured + at least 2 DISPO uploads
- If no week mapping or <2 uploads, weekly columns show headers only (empty data)

**Reports page:** `/reports` in sidebar (between Score Entry and Scoring Guide). Download button with data source tags (blue = populated, amber = pending).

#### E. Known Issues / Still Blank Columns
- **Industry (进驻产业):** NOW POPULATED from Products master page (see section 6 below)
- **End position (端头):** Not in any form, left blank
- **Flooring (是否出样):** Unknown source, left blank
- **Product POSM (产品物料):** Not in display form data, left blank
- **Marketing POSM (营销物料):** Not in display form data, left blank
- **Weekly data:** Report now falls back to Jan 1 if week mapping is missing or has a future-dated start (see section 7 below)
- **BA matching:** Fixed the bridging but need to verify BAs actually appear for all stores — depends on visit storeCode matching store master siteCode

#### F. Future Additions Discussed
- **POSM fields** could be added to the Perigee display form if Haier wants to track them

### 6. Products Maintenance Page (DEPLOYED, May 29, 2026)

Admin page to manage product metadata. Products are auto-populated from DISPO uploads using `articleDesc` as the unique key. The Industry field populates the previously blank column in the BA Work Excel report.

**New files:**
- **`lib/productData.ts`** — `ProductMaster` interface (`articleDesc`, `productCode`, `category`, `industry`, `status`), blob key `admin/products.json`, `loadProducts()`, `saveProducts()`
- **`app/api/products/route.ts`** — GET (list all), PUT (bulk save), POST (sync from DISPO: extracts unique `articleDesc` from sales/stock/prices, merges with existing products preserving metadata, sorts alphabetically)
- **`app/admin/products/page.tsx`** — Admin UI: searchable table with columns Article Description (read-only), Product Code (editable), Category (editable), Industry (editable), Status (dropdown: Active/Discontinued/blank). "Sync from DISPO" button, "Save All" button, dirty flag, toast messages.

**Modified files:**
- **`components/Sidebar.tsx`** — Added "Products" nav item after Stores in Control Centre
- **`app/api/reports/ba-work/route.ts`** — Imports `loadProducts`, loads in `Promise.all`, builds `Map<string, ProductMaster>` keyed by `articleDesc.toLowerCase().trim()`, populates industry column
- **`app/reports/page.tsx`** — Moved "Industry" from amber/pending to blue/populated tags

**Commits:** `9225a4e`, `2a5aa51`, `f6c2845`, pushed to master

### 7. Week Mapping Bug Fixes (DEPLOYED, May 29, 2026)

**Bug 1: Weeks stopped at Dec 31 of the selected year**
- `getWeeksForYear()` used `yearEnd = new Date(year, 11, 31)` — if Week 1 started Dec 29, only 1 week was generated
- Fix: generate weeks for a full year from the start date (`oneYearLater = w1 + 1 year`) — produces 52-53 weeks regardless of year boundary
- Same fix applied to client-side `getWeeksPreview()` in `app/week-mapping/page.tsx`

**Bug 2: UI couldn't pick previous year's December**
- `toIsoDate(selectedYear, month, day)` forced the date into the selected year
- Fix: added "December {year-1}" as month option (value `0`). When selected, date uses `selectedYear - 1` for the year. Loading existing configs with Dec prev-year correctly sets month to 0.

**Bug 3: BA Work report had zero week columns**
- Root cause: old buggy UI saved `week1Start: "2026-12-29"` (Dec 2026, future) instead of `"2025-12-29"` (Dec 2025). `getWeekNumber(today)` returned `undefined` since today is before the start date.
- Fix: report now falls back to `{ year, week1Start: "${year}-01-01" }` if no valid yearConfig exists or if `week1Start` is in the future
- Also capped `getWeekNumber()` at `totalWeeks` from `getWeeksForYear()` to prevent unbounded week numbers

**Key files modified:** `lib/weekMapping.ts`, `app/week-mapping/page.tsx`, `app/api/reports/ba-work/route.ts`

**Commits:** `2a5aa51`, `f6c2845`, `c80e3b4`, pushed to master

**ACTION NEEDED:** User should go to Week Mapping, select 2026, change month to "December 2025", set day to 29, and click Save — this will fix the saved config from `2026-12-29` to `2025-12-29` for accurate week numbering.

### 8. Sales Value Nett of VAT (DEPLOYED, Jun 9, 2026)

All Rand value sales calculations now strip 15% SA VAT. Prices stored in blob remain VAT-inclusive; VAT is stripped at calculation time by dividing by 1.15.

**Modified files:**
- **`lib/dispoData.ts`** — `calcSalesValue()` divides effective price (promSP or inclSP) by 1.15 before multiplying by units. Affects: BA work report, auto-calc sales scoring, guidance endpoint.
- **`app/api/scores/leaderboard/route.ts`** — Fixed inline price calculation (bypassed `calcSalesValue`) to also divide by 1.15.

**Commit:** `c9bc4d3`, pushed to master.

### 9. Store → BA Assignment Override (DEPLOYED & LIVE, Jun 21, 2026)

**Why:** Client reported sales at a store (Makro Cape Gate) loading under Luke, an ex-employee. Root cause: there is NO stored "store belongs to BA X" link — BA attribution is derived entirely from Perigee visit `repName`/`email`. Sales scoring (`calcSalesScores`) credits a BA with the DISPO sales of every store they checked into that month; the BA Work report (`buildBaMap`) shows the rep of the **most recent visit** to a store (all-time, not month-filtered). So a departed BA still on Perigee records keeps getting the store.

**Fix — explicit per-store BA override** (chosen over a full roster/inactive-status approach). When a store is assigned a BA, that assignment is the source of truth everywhere; unset = auto-derive from visits as before.

**Modified files:**
- **`lib/storeData.ts`** — `StoreMaster` gains `assignedBaEmail?` + `assignedBaName?`
- **`app/admin/stores/page.tsx`** — new "Assigned BA" dropdown column, sourced from `/api/bas` (BAs seen in visit/training data), default "— Auto (from visits) —". Included in Save All payload.
- **`app/api/reports/ba-work/route.ts`** — `buildBaMap` overwrites visit-derived BA with the store's `assignedBaName` (keyed by store name + site code) after the visit pass, so assignment wins.
- **`lib/autoCalc.ts` `calcSalesScores`** — builds `assignedByCode` map; assigned stores are SKIPPED when attributing to the visiting BA and instead credited to the assigned BA (creates a score entry if she has none).
- **`app/api/scores/leaderboard/route.ts`** — assignment overrides the visit-derived `baDispoStore` for sales figures.

**Usage to fix a reassigned store:** Stores → set Assigned BA → Save All → Score Entry → re-run auto-calc Sales for the month(s). BA Work report + leaderboard reflect the change live on next pull; stored Sales KPI points update on auto-calc re-run.

**Known limits:** dropdown only lists BAs already present in visit/training data; leaderboard widget assumes one store per BA (report + scoring handle multiple assigned stores fine).

**Commit:** `b145f2c`, pushed to master, auto-deployed via Vercel Git integration (no manual `vercel --prod` needed — confirmed this session).

### 10. Diamond Corner — PDF (OCR) Sales Upload (BUILT, NOT yet committed/pushed, Jun 29, 2026)

New retailer/channel **Diamond Corner**. Sales arrive as a flat single-store PDF
("Sales Analysis By Item in Dept": header store name + Dept + date range, then
columns **Code · Description · Qty · SOH · Value**, plus a totals row). A new
"Diamond Corner — Sales (PDF)" section on `/upload` OCRs the PDF, lets the admin
pick the target store + month, previews the rows, then **merges them into the
shared DISPO model** (`dispo/data.json`) so they score/report exactly like Makro.

**OCR:** `app/api/diamond/extract/route.ts` — sends the PDF to Claude
(`claude-sonnet-4-6`) as a `document` block with a **forced tool call**
(`emit_sales_report`, `tool_choice` = that tool) for reliable structured output.
Returns store name, date range, derived month (`MM-YYYY`), and rows. Each row is
resolved to a DISPO `articleDesc` via the product master's new **`diamondCode`**
field (falls back to the PDF description when unmapped → flagged `new`).

**Commit:** `app/api/diamond/commit/route.ts` — replaces that store's slice for
the month (`sales[month][store]` + `stock[store]`), writes price as
`inclSP = value / qty` (VAT-incl, so `calcSalesValue` reproduces value nett of
VAT), logs the upload to `diamond/uploads.json` (+ raw to `diamond/raw/{id}.json`),
then re-runs `runAutoCalcForMonth(month, ['sales'])`. Delete route reverses it.

**Files:** new `lib/diamondData.ts`, `app/api/diamond/{extract,commit,route,delete/[id]}`;
modified `lib/productData.ts` (+`diamondCode`), `app/api/products/route.ts`,
`app/admin/products/page.tsx` (Diamond Corner Code column + search),
`app/upload/page.tsx` (whole new section), `lib/activityLog.ts`
(`upload_diamond`/`delete_diamond` actions). Build + typecheck pass.

**TO GO LIVE (Carl):**
1. Add **`ANTHROPIC_API_KEY`** to the Vercel project env (OCR 500s without it).
2. On **Stores**, add each Diamond Corner store (e.g. "DIAMOND CORNER WOODMEAD"),
   set channel = **DIAMOND CORNER** + an **Assigned BA** (so sales credit the
   right rep). Commit refuses a store not in the master.
3. For the Monthly-Sales KPI to score, that store needs a **target** for the
   month (Targets upload) + BA attribution — otherwise data still shows in
   Sales/Stock pages but contributes 0 points.
4. (Optional) On **Products**, fill **Diamond Corner Code** per product so PDF
   codes consolidate under the existing articleDesc instead of loading as new.
5. Not pushed yet — `git push` to master auto-deploys.

---

