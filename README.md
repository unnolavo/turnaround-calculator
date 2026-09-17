# Turnaround Estimator 2.0 - GitHub Demo

This is an internal prototype/demo for estimating production, shipment handoff, transit, and expected delivery dates.

## Inputs

- Domain
- Order date
- Production days
- Shipping method
- Shipment timing

## What the calendar shows

The calendar marks production days, queue-for-shipment timing, transit days, exceptional non-working days, and possible delivery dates.

## Copying delivery estimates

The Expected Delivery panel shows a written date estimate and a domain-aware numeric date estimate. Each line has its own copy button.

## How to open locally

Open `index.html` in a modern browser. No installation is required for this demo.

## GitHub Pages

To publish this demo with GitHub Pages, upload `index.html`, `styles.css`, this `README.md`, and the full `src` folder to the root of a GitHub repository. Then enable Pages from the repository Settings page using the `main` branch and `/root` folder.

## Prototype note

Calculations depend on the currently configured business and shipping rules. These rules should be reviewed before production deployment.