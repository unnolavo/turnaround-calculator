# Turnaround Estimator

A small, self-contained static web application for internal customer-service agents to estimate production and delivery dates from basic order information.

## Project Structure

- `index.html` - the browser entry point.
- `styles.css` - quiet, responsive interface styling.
- `src/domain-config.js` - domain and shipping-method configuration.
- `src/date-utils.js` - date-only parsing, formatting, and calendar-day helpers.
- `src/us-holidays.js` - observed U.S. federal holiday calculations.
- `src/estimator.js` - pure production and transit calculation engine.
- `src/calendar.js` - calendar rendering.
- `src/app.js` - DOM/form behavior.
- `tests/*.test.js` - automated tests using Node's built-in test runner.

## Current Configuration Status

No old application files or committed reference files were present in this project folder, so real domain and shipping-method data could not be recovered. The current `src/domain-config.js` data is intentionally marked as placeholder-only and must be replaced with employer-approved values before production use.

## Run Locally

Open `index.html` directly in a browser. The app uses ordinary HTML, CSS, and JavaScript files with no external runtime dependencies or CDNs.

## Run Tests

Install Node.js if it is not already available, then run:

```powershell
npm test
```

The tests cover production counting, transit ranges, weekend behavior, observed U.S. federal holidays, leap years, invalid production durations, timezone stability, and basic form recalculation wiring.

## Update Domain And Shipping Data

Edit `src/domain-config.js`.

Each domain should define:

- `id` - stable machine-readable value.
- `label` - visible dropdown label.
- `transitHolidayCalendar` - use `"us-federal"` for the U.S. domain and `"none"` for international domains.
- `shippingMethods` - methods available only for that domain.

Each shipping method should define:

- `id` - stable machine-readable value.
- `label` - visible dropdown label.
- `transitDays` - either a fixed number, such as `3`, or a range object, such as `{ min: 4, max: 7 }`.
- `countsSaturdayTransit` - `true` only for configured U.S. methods that explicitly support Saturday delivery.

## Update Holiday Behavior

Holiday logic lives in `src/us-holidays.js`. Production always skips observed U.S. federal holidays. Transit skips observed U.S. federal holidays only when the selected domain has `transitHolidayCalendar: "us-federal"`.

If holiday policy changes, update `src/us-holidays.js` and add or adjust tests in `tests/estimator.test.js`.

## Produce A ZIP Or Deployment Folder

The employer needs to host these files:

- `index.html`
- `styles.css`
- the full `src/` folder

Tests and repository files are useful for maintenance but are not required at runtime.

To create a handoff ZIP from PowerShell:

```powershell
New-Item -ItemType Directory -Force dist
Compress-Archive -Path index.html, styles.css, src -DestinationPath dist/turnaround-estimator.zip -Force
```
