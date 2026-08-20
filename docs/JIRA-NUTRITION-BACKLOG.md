# Nutrition UX Backlog — JIRA Tickets

Product notes captured **2026-08-19**. **Do not implement until prioritized.** Each section below is one JIRA story/epic slice with suggested BIQ number for BuildIQ tracking.

---

## NUTR-1 / BIQ-0121 — Meal header shows total calories; tap to expand items

**Type:** Story  
**Priority:** High

### Summary
Show the **total calories for each meal** (Breakfast, Lunch, Dinner, Snacks) in the day view. Tapping the meal header expands/collapses the list of logged items for that meal.

### User story
As a user logging food, I want to see how many calories each meal contains at a glance, and tap a meal to see everything I logged in it, so I don't have to scan every row to understand my day.

### Acceptance criteria
- [ ] Each meal section displays **aggregate calories** (and optionally P/C/F) for that meal on the selected date
- [ ] Meal header is tappable — expands to show all entries; tap again to collapse
- [ ] Collapsed state still shows meal calorie total
- [ ] Works on mobile (touch target ≥ 44px)
- [ ] Empty meals show 0 cal or hidden per existing empty-meal UX

### Notes
- Replaces or enhances current flat meal entry list grouping in `NutritionTracker.tsx`

---

## NUTR-2 / BIQ-0122 — Per-meal calorie breakdown vs daily goal

**Type:** Story  
**Priority:** High

### Summary
For each meal in the day, show how that meal's calories relate to the **daily goal** (e.g. Breakfast 420 / 600 cal goal share, or % of daily target).

### User story
As a user with macro goals, I want to see how each meal contributes to my daily calorie budget so I can balance the rest of my day.

### Acceptance criteria
- [ ] Daily goal visible (or derivable from `st_nutrition_goals`)
- [ ] Each meal shows calories logged + contextual breakdown vs goal (e.g. "480 cal · 32% of daily goal" or allocated meal targets if we add them later)
- [ ] Clarify UX: equal split of daily goal across 4 meals vs custom meal targets — **product decision needed** (default: % of daily total)
- [ ] Updates live when entries added/removed/edited

### Open questions
- Do we allocate goal **evenly** (25% per meal) or allow user-defined per-meal targets later?

---

## NUTR-3 / BIQ-0123 — Move Edit nutrition goals to Settings

**Type:** Story  
**Priority:** Medium

### Summary
Remove **Edit goals** from the Nutrition tab; manage daily calorie/macro goals under **Settings** instead.

### User story
As a user, I want nutrition goals in Settings with my other profile preferences, so the Nutrition screen focuses on logging and daily progress.

### Acceptance criteria
- [x] "Edit goals" removed from Nutrition tab (or reduced to read-only summary + link to Settings)
- [x] Settings has full goal edit flow (existing Mifflin-St Jeor suggestions preserved)
- [x] Nutrition tab still shows progress bars vs goals (read-only)
- [x] Mobile-friendly Settings layout

### Files likely touched
- `NutritionTracker.tsx`, Settings section in `app/page.tsx`

---

## NUTR-4 / BIQ-0124 — Add Food hub screen (method picker first)

**Type:** Epic / Story  
**Priority:** High

### Summary
When user taps **Add food**, open a **dedicated hub screen** with primary action buttons instead of one long scrollable form.

### Hub buttons (top level)
1. **Scan barcode**
2. **Scan nutrition label**
3. **AI photo** (meal plate photo)
4. **AI estimate my food** → opens sub-hub with:
   - Search field
   - **Recent** foods
   - **Saved** (my foods library)
   - **Meal templates** (saved meals search)
   - **Food catalog**

### User story
As a user adding food, I want to pick *how* I'm logging first (scan vs photo vs search), so I don't wade through every option on one page.

### Acceptance criteria
- [ ] Add food opens hub/modal/sheet — not immediate manual entry form
- [ ] Each button routes to existing or refined flow (barcode, label OCR, meal photo, text AI, catalog, etc.)
- [ ] **AI estimate my food** sub-view includes: search, recent, saved, meal templates, catalog — per notes
- [ ] Meal type (Breakfast/Lunch/…) selected before or at start of flow
- [ ] Back navigation returns to hub or day view
- [ ] Mobile-first; works in PWA on iPhone

### Dependencies
- Meal templates (BIQ-0035) — wire into hub
- Recent/saved foods (BIQ-0107) — wire into AI estimate sub-hub

---

## NUTR-5 / BIQ-0125 — Inline AI estimate results (no scroll to manual entry)

**Type:** Story  
**Priority:** High

### Summary
When AI estimates calories (photo, label, or text), show results **inline in the active flow** — user should not have to scroll down to the manual **Edit food** area to see or confirm values.

### User story
As a user who scanned or photographed food, I want to see estimated macros immediately where I am, so I can confirm and log without hunting for the form.

### Acceptance criteria
- [ ] AI result chips/cards appear in the same view/panel as the scan/estimate action
- [ ] **Use** / **Log all** actions visible without scrolling on typical phone viewport
- [ ] Optional quick edit inline (calories/macros) before log — product decision
- [ ] Applies to: meal photo, label OCR, text AI estimate

### Notes
- Partially addressed by NUTR-4 hub layout; this ticket is specifically anti-scroll UX

---

## NUTR-6 / BIQ-0126 — Tap date header to open calendar picker

**Type:** Story  
**Priority:** Medium

### Summary
On the Nutrition screen, **tap the date at the top** to open a calendar and jump to any date (not only prev/next day arrows).

### User story
As a user reviewing past logs, I want to tap the date and pick a day from a calendar, so I can jump weeks back quickly.

### Acceptance criteria
- [ ] Date display at top of Nutrition is clickable
- [ ] Opens native or in-app calendar (reuse `DateInput` / calendar pattern from Training if suitable)
- [ ] Selecting a date loads that day's entries and totals
- [ ] Works on iPhone Safari PWA

### Notes
- Training already has calendar log date pattern — align UX where possible

---

## NUTR-7 / BIQ-0127 — Copy meal or logged item to another date/meal

**Type:** Story  
**Priority:** Medium

### Summary
**Copy** action on a logged food item (or whole meal). Prompts for **target date** and **target meal** (Breakfast/Lunch/Dinner/Snacks), then creates duplicate entries.

### User story
As a user who eats the same breakfast often, I want to copy yesterday's meal to today (or another day), so I don't re-log every item.

### Acceptance criteria
- [ ] Copy button on each meal entry row (and optionally "Copy whole meal" on meal header — ties to NUTR-1)
- [ ] Modal/sheet: pick **date** + **meal type**
- [ ] Creates new `st_meal_entries` rows with same macros/serving snapshot (new ids, new log_date)
- [ ] Does not modify source entry
- [ ] Success feedback; refreshes target day if currently viewed

### Related
- "Copy yesterday" may already exist — align naming and UX

---

## NUTR-8 / BIQ-0128 — Remove "This week" summary box at bottom

**Type:** Story  
**Priority:** Low

### Summary
Remove the **This week** box at the bottom of the Nutrition screen (`NutritionWeeklySummary` section).

### User story
As a user, I want a cleaner Nutrition screen; weekly detail can live in the new graph (NUTR-9) or Progress tab.

### Acceptance criteria
- [ ] `NutritionWeeklySummary` card removed from Nutrition tab bottom
- [ ] No loss of critical data without replacement — NUTR-9 graph covers weekly view
- [ ] Confirm Progress tab doesn't duplicate unnecessarily

### Files likely touched
- `NutritionTracker.tsx`, possibly `NutritionWeeklySummary.tsx` (keep component if reused elsewhere)

---

## NUTR-9 / BIQ-0129 — Weekly macro trend graph (calories / protein / carbs / fat)

**Type:** Story  
**Priority:** Medium

### Summary
Add a **graph at the bottom** of Nutrition showing **7-day trend**, switchable metric: **Calories | Protein | Carbs | Fat**.

### User story
As a user tracking nutrition, I want a weekly chart of my intake so I can spot patterns without reading a table.

### Acceptance criteria
- [ ] Segmented control or tabs: Calories / Protein / Carbs / Fat
- [ ] Chart shows ~7 days ending on selected date (or current calendar week — product decision)
- [ ] Goal line optional for calories (stretch)
- [ ] Mobile-friendly chart (existing weekly chart patterns in app if any)
- [ ] Replaces or supersedes removed "This week" box (NUTR-8)

### Technical notes
- Data: `st_meal_entries` aggregated by `log_date` (existing `weeklySummary` helpers)
- Consider reusing chart component from BIQ-0035 weekly nutrition chart if present

---

## Suggested implementation order

| Phase | Tickets | Rationale | Status |
|-------|---------|-----------|--------|
| 1 | NUTR-4, NUTR-5 | Add-food UX is the main friction point | **Done** (BIQ-0124, BIQ-0125 — 2026-08-19) |
| 2 | NUTR-1, NUTR-2 | Day view clarity | **Done** (BIQ-0121, BIQ-0122 — 2026-08-20) |
| 3 | NUTR-6, NUTR-7 | Navigation + copy efficiency | **Done** (BIQ-0127, BIQ-0128 — 2026-08-20) |
| 4 | NUTR-8, NUTR-9 | Bottom of screen refresh | **Done** (BIQ-0131, BIQ-0132 — 2026-08-20) |
| 5 | NUTR-3 | Settings move (low risk, can parallel) | **Done** (BIQ-0123 — 2026-08-20) |

---

## Out of scope (this backlog)

- Database schema changes (unless copy/meal templates need extensions)
- Paid nutrition APIs
- Medical/dietitian features

---

*Copy each `NUTR-n` block into JIRA as a separate ticket. Link BIQ numbers in CHANGELOG when work starts.*
