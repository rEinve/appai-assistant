# Planner: date-led budget entry

Status: implemented locally, 30 October 2026. Focused component checks and browser observations are recorded below; owner visual acceptance remains open.

## Requested change

Make the selected day the organizing context for the Planner. Remove the always-visible budget form and global budget list. Create a budget through a plus button beside the selected date.

## Layout

- Keep Day and Month tabs at the top of the planner.
- Place the selected day heading below the tabs, with a plus button immediately beside it. Show the date once; remove the duplicate DAY PLAN/date heading.
- Keep previous/next and Today controls together without separating the date and plus button across the page.
- Remove the Planner header's New instruction button and the empty agenda's Create an instruction button. Other instruction-entry routes remain available.
- Remove the separate Planning budgets/Budget allocations panel, explanatory block, permanent form and all-budget list.
- Render the selected day's entries below its date, aligned to the left. Existing instruction start, deadline and scheduled entries retain their behavior.
- Include only budgets belonging to that day under the date rule below, newest created first. Never list every budget under every date.
- Leave the agenda content area blank when the selected day has no entries. Remove the Nothing planned panel and its action.

## Plus button and form

- The plus button means Add budget, with an accessible name including the selected date.
- Open a dismissible budget dialog. Move focus into it, support Escape and Cancel, and return focus to the invoking button when closed.
- Retain budget name, maximum amount, start date/time and optional deadline. Currency comes from account settings.
- Prefill the start's date from the selected Planner day; keep it editable, including future dates. Do not silently choose a time: retain an explicit time input or settle date-only semantics before implementation.
- Leave the deadline empty for the member to choose. Budget name and amount are member-entered; selecting a day does not supply them.
- Preserve server validation, account prerequisites and idempotent submission. Show save errors inside the dialog and retain entered values on failure. Close only after success or explicit dismissal.
- Successful creation updates the actual creation day's list and month marker, placing the newest budget first without showing unrelated budgets. If viewing a different day, show confirmation identifying the creation day and offer a link to it; do not insert the budget under the viewed day.

## Confirmed date rule

Owner confirmed on 30 October 2026: a budget belongs to the day it was created, independently of when it may be used.

- Group by server-owned `createdAt`, interpreted in the account timezone. A budget created today for a future start appears today.
- Apply the same rule to existing budgets, including those without validity dates.
- The selected day prefills the editable start date only. It never supplies or changes the creation timestamp.
- Start date and deadline determine the budget's usage window. They do not relocate its Planner entry.
- Later spending remains associated with the same budget. Spending dates do not relocate its creation entry. Use authoritative spending records; do not infer spending from the allocation maximum or linked instruction limits.

Do not overwrite `createdAt` with the selected date. Budget validity and creation time are separate facts.

## Month view

- Retain the month grid and existing instruction markers.
- Include budget indicators on their actual creation dates, with accurate accessible counts.
- Selecting a date opens its day view; the plus button then uses that date.

## Implementation locations

- `src/app/app.component.html`: Planner branch, toolbar, agenda and budget form/list.
- `src/app/app.component.ts`: Planner date state, `calendarDays`, `calendarSelectedEntries`, budget dialog state and `createBudgetAllocation`.
- `src/styles.scss`: Planner layout and dialog presentation, using established unprefixed tokens.
- `docs/A-P-P-A-I-agent-user-flow-chat.md`: update Planner presentation and the confirmed date rule alongside implementation.

The budget response already exposes `createdAt`, nullable `validFrom`/`validUntil` and `timezoneSnapshot`. Inspect existing API date/time validation before changing request semantics. This brief does not require a persistence change by itself.

## Acceptance

- Initial Day view shows tabs, one date heading and adjacent plus; no permanent form or global budget list.
- Plus on a selected future day opens the form with that date prefilled and editable; deadline remains empty.
- Cancel creates nothing. Failed submission preserves values and shows the error. Successful submission creates once and closes the dialog.
- Budgets appear only on their actual creation date, including around account-timezone midnight. A budget created today with a future start appears today and not on that future start date.
- Changing validity dates or recording later spending does not move the creation entry. Later spending stays associated with the original budget.
- Empty days have a blank content area; populated days show their entries on the left.
- Month markers and day entries agree; instruction scheduling entries still appear.
- Verify keyboard focus and rendered layout at phone, intermediate and desktop widths. Record build evidence separately from rendered acceptance.

## Scope

This is a Planner interaction/layout change. Budget limits, inheritance, authentication and external execution rules retain their owning contracts. Provider execution remains disabled under existing capability gates.

## Local verification, 30 October 2026

- Angular production build passes with the existing component-style budget warning (`app.component.scss`, 39.43 kB against a 36.86 kB warning limit). That component stylesheet was not changed for this work.
- Focused component checks use a stub HTTP client with no real API writes. Passed: creation-day filtering around account-timezone midnight, future validity remaining separate, month budget counts, instruction schedule preservation, future-day form prefill, missing-time validation, dismissal protection during save, failure retention, idempotent retry, result deduplication and navigation to the actual creation day.
- Native Chrome at `http://localhost:4200`: existing authenticated data showed four budgets on 30 October and none on 31 October; Month view reported four budgets on 30 October. Plus opened the dialog with the selected date and empty deadline; Escape returned focus to Plus. Desktop, 900-pixel intermediate and 390-pixel phone layouts were visually inspected, including the phone dialog.
- No budget was created in the member's database for verification. Successful/error save paths were exercised through the stub; a real authenticated save through this dialog remains unverified.
- Existing shared mobile navigation can overflow at phone width; this is outside the Planner change. Full accessibility acceptance and owner visual acceptance remain open.
- New Planner styles use existing colour roles; no animation, analytics, public indexing or deployment change was introduced. Existing fixed-spacing conventions remain; this is not a design-system migration.
