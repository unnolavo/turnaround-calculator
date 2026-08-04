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

Shipping configuration now lives in `src/domain-config.js`.

International shipping values were transcribed from `reference/estimated-shipping-times.png`, the supplied "Estimated Shipping Times" image. U.S. shipping values and Saturday-delivery behavior were confirmed directly by the project owner on 2026-08-04. These values are currently considered accurate but may be updated later.

In the source image, `bd` means business days. In this application, every configured shipping duration is interpreted as transit business days.

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

To update a transit range, change only the relevant `transitDays: { min, max }` value. To add or remove a method, edit that domain's `shippingMethods` list and run the tests so configuration validation catches duplicate IDs, invalid ranges, or unauthorized Saturday delivery.

Only `Standard Shipping (with Saturday Delivery)` on the U.S. domain currently has `countsSaturdayTransit: true`. Do not infer Saturday delivery for any international method.

`Rest of Europe` intentionally uses the same shipping times as `UK`. The source image also says that if an order was placed on the wrong domain, it can take up to 30 calendar days. That warning is informational only; it does not add a calculation rule.

## Update Holiday Behavior

Holiday logic lives in `src/us-holidays.js`. Production always skips observed U.S. federal holidays. Transit skips observed U.S. federal holidays only when the selected domain has `transitHolidayCalendar: "us-federal"`.

If holiday policy changes, update `src/us-holidays.js` and add or adjust tests in `tests/estimator.test.js`.

Destination-country holidays are intentionally not modeled for international domains.

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
