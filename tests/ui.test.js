const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const app = require("../src/app");
const calendar = require("../src/calendar");
const config = require("../src/domain-config");
const estimator = require("../src/estimator");

const repoRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");
const appSource = fs.readFileSync(path.join(repoRoot, "src", "app.js"), "utf8");
const calendarSource = fs.readFileSync(path.join(repoRoot, "src", "calendar.js"), "utf8");
const estimatorSource = fs.readFileSync(path.join(repoRoot, "src", "estimator.js"), "utf8");

function requiredEstimate(methodLabel, overrides) {
  const us = config.domains.find((domain) => domain.id === "us");
  const shippingMethod = us.shippingMethods.find((method) => method.label === methodLabel);

  return estimator.calculateEstimate(Object.assign({
    orderDate: "2026-08-10",
    productionDays: 2,
    domain: us,
    shippingMethod
  }, overrides));
}

test("all five required inputs are present and prohibited controls are absent", () => {
  assert.match(indexHtml, /<select id="domain"/);
  assert.match(indexHtml, /<input id="order-date"[^>]+type="date"/);
  assert.match(indexHtml, /<input id="production-days"[^>]+type="number"[^>]+min="1"[^>]+max="20"/);
  assert.match(indexHtml, /<select id="shipping-method"/);
  assert.match(indexHtml, /<select id="shipment-timing"/);
  assert.match(indexHtml, /data-production-days="1"/);
  assert.match(indexHtml, /data-production-days="5"/);

  assert.doesNotMatch(indexHtml, /<button[^>]*>[^<]*calculate/i);
  assert.doesNotMatch(indexHtml, /queue cutoff/i);
  assert.doesNotMatch(indexHtml, /carrier received/i);
});

test("form controls declare the intended logical rows", () => {
  assert.match(indexHtml, /<div class="field" data-form-row="1">\s*<label for="domain">Domain<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="1">\s*<label for="order-date">Order date<\/label>/);
  assert.match(indexHtml, /<div class="field production-days-field" data-form-row="2">\s*<label for="production-days">Production days<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="2">\s*<label for="shipping-method">Shipping method<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="3">\s*<label for="shipment-timing">Shipment timing<\/label>/);
});

test("production-days validation is visibly and accessibly associated with the field", () => {
  assert.match(indexHtml, /id="production-days"[^>]+aria-describedby="production-days-error"/);
  assert.match(indexHtml, /id="production-days-error"[^>]+class="field-error"[^>]+hidden/);
});
test("Order Date remains native date input with larger app-controlled target", () => {
  assert.match(indexHtml, /<input id="order-date"[^>]+type="date"/);
  assert.match(stylesSource, /\.field input\[type="date"\] \{\s*min-height: 52px;[\s\S]*?padding: 10px 12px;[\s\S]*?\}/);
  assert.match(stylesSource, /::-webkit-calendar-picker-indicator \{\s*width: 24px;\s*height: 24px;[\s\S]*?\}/);
});

test("changing each input is wired to recalculate immediately", () => {
  assert.match(appSource, /domainSelect\.addEventListener\("change"/);
  assert.match(appSource, /orderDateInput\.addEventListener\("input"/);
  assert.match(appSource, /orderDateInput\.addEventListener\("change"/);
  assert.match(appSource, /productionDaysInput\.addEventListener\("input"/);
  assert.match(appSource, /productionDaysInput\.addEventListener\("change"/);
  assert.match(appSource, /shippingMethodSelect\.addEventListener\("change"/);
  assert.match(appSource, /shipmentTimingSelect\.addEventListener\("change"/);
});

test("domain changes update shipping options and reject invalid previous selections", () => {
  const choices = app.getShippingMethodChoices(config, "jp");
  const select = {
    children: [],
    value: "express",
    disabled: false,
    firstChild: null,
    appendChild(option) {
      this.children.push(option);
      this.firstChild = this.children[0] || null;
    },
    removeChild() {
      this.children.shift();
      this.firstChild = this.children[0] || null;
    }
  };
  const documentRef = {
    createElement() {
      return { value: "", textContent: "" };
    }
  };

  app.replaceSelectOptions(documentRef, select, choices, "express");

  assert.deepEqual(select.children.map((option) => option.textContent), [
    "Standard with tracking (7-10 bd)",
    "Expedited with tracking (5-6 bd)"
  ]);
  assert.equal(select.value, "standard");
});

test("fixed shipping displays one expected-delivery date", () => {
  assert.equal(app.formatEstimateHeading(requiredEstimate("Express Shipping")), "Friday, August 14th");
});

test("ranged shipping displays both expected-delivery bounds", () => {
  assert.equal(
    app.formatEstimateHeading(requiredEstimate("Standard Shipping")),
    "Wednesday, August 19th - Monday, August 24th"
  );
});

test("long result detail summary is hidden from the healthy Expected Delivery panel", () => {
  const estimate = requiredEstimate("Express Shipping");

  assert.equal(estimate.queueForShipmentDate, estimate.productionDates.at(-1));
  assert.match(indexHtml, /<p id="result-detail" class="result-detail" hidden><\/p>/);
  assert.match(appSource, /elements\.resultDetail\.hidden = true/);
  assert.doesNotMatch(indexHtml, /Production:|Queue for shipment:|Transit begins:|Assumption:|Domain:|Method:/);
});

test("invalid production input clears projection with accessible error state", () => {
  const calls = [];
  const elements = {
    resultPanel: {
      classList: {
        values: [],
        add(value) { this.values.push(value); }
      }
    },
    resultHeading: { textContent: "" },
    resultDetail: { textContent: "" },
    productionDaysInput: {
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; }
    },
    productionDaysError: { hidden: true, textContent: "" },
    calendarRegion: {}
  };

  app.setProductionDaysError(elements, "Production days must be a positive whole number.");
  calls.push(elements.productionDaysInput.attrs["aria-invalid"]);

  assert.equal(calls[0], "true");
  assert.equal(elements.productionDaysError.hidden, false);
  assert.equal(elements.productionDaysError.textContent, "Production days must be a positive whole number.");
});

test("calendar uses calculation-result stages instead of recalculating shipping rules", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11"],
    queueForShipmentDate: "2026-08-11",
    transitDates: ["2026-08-12", "2026-08-13"],
    expectedDeliveryDate: "2026-08-14"
  });

  assert.deepEqual(markerMap["2026-08-11"].map((marker) => marker.type), ["production"]);
  assert.deepEqual(markerMap["2026-08-12"].map((marker) => marker.type), ["transit"]);
  assert.deepEqual(markerMap["2026-08-13"].map((marker) => marker.label), ["Transit 2"]);
  assert.deepEqual(markerMap["2026-08-13"].map((marker) => marker.accessibleLabel), ["Transit day 2"]);
  assert.deepEqual(markerMap["2026-08-14"].map((marker) => marker.type), ["delivery"]);
  assert.equal(/transitDays|shippingMethods|business day/i.test(calendarSource), false);
});

test("expected-delivery range omits repeated visible labels while keeping accessible range labels", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11"],
    queueForShipmentDate: "2026-08-11",
    transitDates: ["2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"],
    transitRange: { min: 2, max: 4 },
    expectedDeliveryDate: null,
    expectedDeliveryStartDate: "2026-08-13",
    expectedDeliveryEndDate: "2026-08-15"
  });

  const startDelivery = markerMap["2026-08-13"].find((marker) => marker.type === "delivery");
  const insideDelivery = markerMap["2026-08-14"].find((marker) => marker.type === "delivery");
  const endDelivery = markerMap["2026-08-15"].find((marker) => marker.type === "delivery");

  assert.equal(startDelivery.label, "Earliest delivery");
  assert.equal(startDelivery.rangePosition, "start");
  assert.equal(insideDelivery.label, "");
  assert.equal(insideDelivery.accessibleLabel, "Expected eligible delivery date");
  assert.equal(insideDelivery.rangePosition, "inside");
  assert.equal(endDelivery.label, "Latest delivery");
  assert.equal(endDelivery.rangePosition, "end");
});

test("transit days are visibly numbered sequentially", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11"],
    queueForShipmentDate: "2026-08-11",
    transitDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    expectedDeliveryDate: "2026-08-15"
  });

  assert.equal(markerMap["2026-08-12"][0].label, "Transit 1");
  assert.equal(markerMap["2026-08-13"][0].label, "Transit 2");
  assert.equal(markerMap["2026-08-14"][0].label, "Transit 3");
  assert.equal(markerMap["2026-08-14"][0].accessibleLabel, "Transit day 3");
});

test("intermediate production days omit repeated visible labels", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11", "2026-08-12", "2026-08-13"],
    queueForShipmentDate: "2026-08-13",
    transitDates: ["2026-08-14"],
    expectedDeliveryDate: "2026-08-17"
  });

  assert.equal(markerMap["2026-08-11"][0].label, "Production 1");
  assert.equal(markerMap["2026-08-12"][0].label, "Production 2");
  assert.equal(markerMap["2026-08-12"][0].accessibleLabel, "Production day 2");
  assert.equal(markerMap["2026-08-13"][0].label, "Production 3");
  assert.match(markerMap["2026-08-13"][0].accessibleLabel, /expected queue for shipment/);
});

test("final production day retains production as primary state and queue indication", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11", "2026-08-12"],
    queueForShipmentDate: "2026-08-12",
    transitDates: ["2026-08-13"],
    expectedDeliveryDate: "2026-08-14"
  });

  const summary = calendar.summarizeDateMarkers(markerMap["2026-08-12"]);
  assert.equal(summary.primaryLabel, "Production 2");
  assert.match(summary.accessibleLabel, /expected queue for shipment|queues for shipment/);
  assert.match(calendarSource, /Queued for shipment|Expected queue for shipment/);
});

test("calendar marker summary produces one concise primary label", () => {
  const summary = calendar.summarizeDateMarkers([
    { type: "production", label: "Production 2", accessibleLabel: "Production day 2" },
    { type: "delivery", label: "Expected delivery", accessibleLabel: "Expected delivery" }
  ]);

  assert.equal(summary.primaryLabel, "Expected delivery");
  assert.deepEqual(summary.activeTypes, ["production", "delivery"]);
});

test("fixed delivery still displays Expected delivery", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11"],
    queueForShipmentDate: "2026-08-11",
    transitDates: ["2026-08-12"],
    expectedDeliveryDate: "2026-08-13"
  });

  assert.equal(markerMap["2026-08-13"][0].label, "Expected delivery");
  assert.equal(markerMap["2026-08-13"][0].accessibleLabel, "Expected delivery");
});

test("calendar exposes responsive short labels without replacing accessible labels", () => {
  assert.equal(calendar.shortStatusLabel("Order placed"), "Order");
  assert.equal(calendar.shortStatusLabel("Production 2"), "Prod 2");
  assert.equal(calendar.shortStatusLabel("Earliest delivery"), "Earliest");
  assert.equal(calendar.shortStatusLabel("Expected delivery"), "Expected");
  assert.equal(calendar.shortStatusLabel("Latest delivery"), "Latest");
  assert.match(calendarSource, /data-short-label/);
});

test("five-item legend follows the order lifecycle", () => {
  const legendLabels = Array.from(indexHtml.matchAll(/<span class="legend-item [^"]+">([^<]+)<\/span>/g)).map((match) => match[1]);

  assert.deepEqual(legendLabels, [
    "Order placed",
    "Production",
    "Pick-Up Day",
    "Transit",
    "Expected delivery"
  ]);
});

test("holiday information identifies skipped stage and is keyboard accessible", () => {
  const message = calendar.holidayMessage([
    {
      stage: "production",
      reason: {
        type: "holiday",
        holidayName: "Independence Day",
        holiday: { observedDate: "2026-07-03" }
      }
    },
    {
      stage: "transit",
      reason: {
        type: "holiday",
        holidayName: "Independence Day",
        holiday: { observedDate: "2026-07-03" }
      }
    }
  ]);

  assert.equal(message, "Independence Day skipped production and transit. Observed date: 2026-07-03.");
  assert.match(calendarSource, /aria-label/);
  assert.match(calendarSource, /data-tooltip/);
  assert.match(stylesSource, /\.info-button:focus-visible::after/);
});
test("calendar detail popups choose inward positions for edge columns", () => {
  assert.equal(calendar.tooltipPositionForColumn(0), "right");
  assert.equal(calendar.tooltipPositionForColumn(1), "right");
  assert.equal(calendar.tooltipPositionForColumn(3), "center");
  assert.equal(calendar.tooltipPositionForColumn(5), "left");
  assert.equal(calendar.tooltipPositionForColumn(6), "left");
});

test("calendar detail popups expose positioning hints without shortening content", () => {
  assert.match(calendarSource, /data-tooltip-position/);
  assert.match(calendarSource, /tooltipPositionForColumn\(columnIndex\)/);
  assert.match(calendarSource, /button\.setAttribute\("data-tooltip", message\)/);
  assert.match(stylesSource, /\.info-button\[data-tooltip-position="right"\]::after \{[\s\S]*left: 0;[\s\S]*transform: none;[\s\S]*\}/);
  assert.match(stylesSource, /\.info-button\[data-tooltip-position="left"\]::after \{[\s\S]*right: 0;[\s\S]*transform: none;[\s\S]*\}/);
  assert.match(stylesSource, /max-width: min\(260px, calc\(100vw - 32px\)\)/);
  assert.doesNotMatch(stylesSource, /\.info-button::after[\s\S]*text-overflow/);
});

test("calendar containers allow tooltip overflow instead of clipping detail popups", () => {
  assert.match(stylesSource, /\.month \{[\s\S]*overflow: visible;[\s\S]*\}/);
  assert.match(stylesSource, /\.info-button::after \{[\s\S]*bottom: calc\(100% \+ 6px\);[\s\S]*\}/);
  assert.match(stylesSource, /\.sr-only \{[\s\S]*overflow: hidden;[\s\S]*\}/);
});

test("CSS exposes approved visual tokens and avoids gradients or badge status classes", () => {
  assert.match(stylesSource, /--order-bg:\s*#e5e7eb/i);
  assert.match(stylesSource, /--production-bg:\s*#dbeafe/i);
  assert.match(stylesSource, /--pickup-bg:\s*#fef3c7/i);
  assert.match(stylesSource, /--transit-bg:\s*#ede9fe/i);
  assert.match(stylesSource, /--delivery-accent:\s*#00c000/i);
  assert.doesNotMatch(stylesSource, /gradient/i);
  assert.doesNotMatch(stylesSource, /\.tag\b/);
});

test("delivery bounds are distinguishable without extra legend categories", () => {
  assert.match(stylesSource, /\.delivery-range-start/);
  assert.match(stylesSource, /\.delivery-range-inside/);
  assert.match(stylesSource, /\.delivery-range-end/);
  assert.doesNotMatch(indexHtml, /Earliest delivery<\/span>|Latest delivery<\/span>/);
});

test("UI contains no hardcoded domain or shipping datasets outside configuration", () => {
  const sourceOutsideConfig = [appSource, calendarSource, estimatorSource].join("\n");

  [
    "Standard Shipping",
    "Slow, no tracking",
    "Standard with tracking",
    "Expedited with tracking",
    "Premium Shipping",
    "2-3 Day Shipping",
    "Express Shipping",
    "Rest of Europe"
  ].forEach((label) => {
    assert.equal(sourceOutsideConfig.includes(label), false);
  });
});

test("calendar exposes overlapping production queue and same-day pickup accessibly", () => {
  const estimate = requiredEstimate("Express Shipping", { shipmentTiming: "queued-before-cutoff" });
  const markerMap = calendar.buildMarkerMap(estimate);
  const summary = calendar.summarizeDateMarkers(markerMap["2026-08-12"]);

  assert.deepEqual(markerMap["2026-08-12"].map((marker) => marker.type), ["production", "pickup"]);
  assert.equal(summary.primaryLabel, "Production 2");
  assert.deepEqual(summary.secondaryLabels.map((marker) => marker.label), ["Same Day Pick-Up"]);
  assert.match(summary.accessibleLabel, /Production day 2, final production day, queued for shipment, Same Day Pick-Up/);
  assert.equal(markerMap["2026-08-13"].some((marker) => marker.accessibleLabel === "Transit day 1"), true);
});

test("next-day pickup receives its own marker and amber calendar treatment", () => {
  const estimate = requiredEstimate("Express Shipping", { shipmentTiming: "unknown" });
  const markerMap = calendar.buildMarkerMap(estimate);
  const pickupMarker = markerMap["2026-08-13"].find((marker) => marker.type === "pickup");

  assert.equal(pickupMarker.label, "Next Day Pick-Up");
  assert.equal(pickupMarker.accessibleLabel, "Next Day Pick-Up");
  assert.match(stylesSource, /\.legend-pickup::before \{[\s\S]*background: var\(--pickup-bg\);[\s\S]*\}/);
  assert.match(stylesSource, /\.calendar-region:hover \.state-pickup,[\s\S]*background: var\(--pickup-bg\);[\s\S]*color: var\(--pickup-text\);/);
});

test("production remains visually primary when same-day pickup overlaps it", () => {
  assert.match(stylesSource, /\.calendar-region:hover \.state-production\.state-pickup:not\(\.state-delivery\)[\s\S]*background: var\(--production-bg\);[\s\S]*color: var\(--production-text\);[\s\S]*var\(--pickup-border\)/);
});

test("result summary no longer renders shipment timing assumption as competing visible detail", () => {
  const estimate = requiredEstimate("Express Shipping", { shipmentTiming: "queued-before-cutoff" });

  assert.match(estimate.shipmentTimingAssumption, /Same-day pickup/);
  assert.doesNotMatch(indexHtml, /Assumption:/);
});
test("calendar CSS keeps non-delivery stages muted until interaction", () => {
  assert.match(stylesSource, /\.state-production \{\s*border-left: 3px solid var\(--border\);\s*background: var\(--surface-muted\);\s*color: var\(--muted\);\s*\}/s);
  assert.match(stylesSource, /\.state-pickup \{\s*border-left: 3px solid var\(--border\);\s*background: var\(--surface-muted\);\s*color: var\(--muted\);\s*\}/s);
  assert.match(stylesSource, /\.state-transit \{\s*border-left: 3px solid var\(--border\);\s*background: var\(--surface-muted\);\s*color: var\(--muted\);\s*\}/s);
  assert.match(stylesSource, /\.calendar-region:hover \.state-production/);
  assert.match(stylesSource, /\.calendar-region:focus-within \.state-production/);
  assert.match(stylesSource, /\.calendar-region:hover \.state-pickup/);
  assert.match(stylesSource, /\.calendar-region:focus-within \.state-pickup/);
  assert.match(stylesSource, /\.calendar-region:hover \.state-transit/);
  assert.match(stylesSource, /\.calendar-region:focus-within \.state-transit/);
});

test("active calendar days are keyboard focusable and expose complete tooltip labels", () => {
  assert.match(calendarSource, /day\.tabIndex = 0/);
  assert.match(calendarSource, /day\.setAttribute\("title", activeDescription\)/);
  assert.match(stylesSource, /\.day:focus-visible/);
});
test("calendar uses Monday-first column placement with weekend columns last", () => {
  assert.deepEqual(calendarSource.match(/var WEEKDAYS = \[(.*?)\]/)[1], "\"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\", \"Sun\"");
  assert.equal(calendar.mondayFirstColumn("2026-08-03"), 0);
  assert.equal(calendar.mondayFirstColumn("2026-08-08"), 5);
  assert.equal(calendar.mondayFirstColumn("2026-08-09"), 6);
});

test("renamed conservative shipment timing option is visible", () => {
  assert.deepEqual(app.getShipmentTimingChoices().map((choice) => choice.label), [
    "Not Shipped Yet / Unknown",
    "Queued before 4 PM",
    "Queued after 4 PM"
  ]);
});

test("copy formats generate written and selected-domain numeric delivery text", () => {
  const formats = app.formatCopyFormats({
    expectedDeliveryDate: null,
    expectedDeliveryStartDate: "2026-09-04",
    expectedDeliveryEndDate: "2026-09-10",
    numericDateFormat: "mdy"
  });

  assert.deepEqual(Object.keys(formats), ["written", "numeric"]);
  assert.equal(formats.written, "Friday, September 4th - Thursday, September 10th");
  assert.equal(formats.numeric, "9/4/2026 - 9/10/2026");
});

test("copy formats use day-first numeric text for non-US domains", () => {
  const formats = app.formatCopyFormats({
    expectedDeliveryDate: null,
    expectedDeliveryStartDate: "2026-09-04",
    expectedDeliveryEndDate: "2026-09-10",
    numericDateFormat: "dmy"
  });

  assert.equal(formats.written, "Friday, September 4th - Thursday, September 10th");
  assert.equal(formats.numeric, "4/9/2026 - 10/9/2026");
});

test("single-day delivery copy formats do not duplicate the date", () => {
  const formats = app.formatCopyFormats({
    expectedDeliveryDate: "2026-08-12",
    numericDateFormat: "dmy"
  });

  assert.equal(formats.written, "Wednesday, August 12th");
  assert.equal(formats.numeric, "12/8/2026");
});

test("ordinal suffix formatting handles exceptions", () => {
  assert.equal(app.formatOrdinalDate("2026-09-01"), "Tuesday, September 1st");
  assert.equal(app.formatOrdinalDate("2026-09-02"), "Wednesday, September 2nd");
  assert.equal(app.formatOrdinalDate("2026-09-03"), "Thursday, September 3rd");
  assert.equal(app.formatOrdinalDate("2026-09-11"), "Friday, September 11th");
  assert.equal(app.formatOrdinalDate("2026-09-12"), "Saturday, September 12th");
  assert.equal(app.formatOrdinalDate("2026-09-13"), "Sunday, September 13th");
});

test("copy buttons copy their individual values and confirm", async () => {
  const writes = [];
  const button = {
    textContent: "Copy",
    classes: new Set(),
    classList: {
      add: (className) => button.classes.add(className),
      remove: (className) => button.classes.delete(className)
    }
  };
  const clipboard = { writeText(value) { writes.push(value); return Promise.resolve(); } };
  const scheduled = [];

  await app.handleCopyButton(button, "9/4/2026 - 9/10/2026", clipboard, (callback, delay) => scheduled.push({ callback, delay }));

  assert.deepEqual(writes, ["9/4/2026 - 9/10/2026"]);
  assert.equal(button.textContent, "Copied");
  assert.equal(button.classes.has("is-copied"), true);
  assert.equal(scheduled[0].delay, 1200);
});
test("visible result line copy buttons target the displayed delivery values", async () => {
  const writes = [];
  const listeners = [];
  const writtenButton = {
    textContent: "Copy",
    attrs: { "data-copy-target": "result-heading" },
    classList: { add() {}, remove() {} },
    getAttribute(name) { return this.attrs[name]; },
    addEventListener(eventName, callback) { listeners.push({ eventName, callback }); }
  };
  const numericButton = {
    textContent: "Copy",
    attrs: { "data-copy-target": "copy-numeric" },
    classList: { add() {}, remove() {} },
    getAttribute(name) { return this.attrs[name]; },
    addEventListener(eventName, callback) { listeners.push({ eventName, callback }); }
  };
  const nodes = {
    "result-heading": { attrs: { "data-copy-value": "Wednesday, September 2nd - Tuesday, September 8th" }, getAttribute(name) { return this.attrs[name]; } },
    "copy-numeric": { attrs: { "data-copy-value": "9/2/2026 - 9/8/2026" }, getAttribute(name) { return this.attrs[name]; } }
  };
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText(value) { writes.push(value); return Promise.resolve(); } } }
  });

  try {
    app.bindCopyButtons({
      copyButtons: [writtenButton, numericButton],
      documentRef: { getElementById(id) { return nodes[id]; } }
    });

    listeners[0].callback();
    listeners[1].callback();
    await Promise.resolve();

    assert.deepEqual(writes, [
      "Wednesday, September 2nd - Tuesday, September 8th",
      "9/2/2026 - 9/8/2026"
    ]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("delivery remains green and prominent during hover and focus reveal", () => {
  assert.match(stylesSource, /\.calendar-region:hover \.state-delivery,\s*\.calendar-region:focus-within \.state-delivery/s);
  assert.match(stylesSource, /background: var\(--delivery-bg\);/);
  assert.match(stylesSource, /color: var\(--delivery-text\);/);
});

test("overlapping delivery production and transit uses delivery-dominant indicators", () => {
  assert.match(stylesSource, /\.state-delivery\.state-production/);
  assert.match(stylesSource, /\.state-delivery\.state-transit/);
  assert.match(stylesSource, /inset 4px 0 0 var\(--delivery-border\)/);
});

test("non-working day label is revealed on hover and keyboard focus", () => {
  assert.match(calendarSource, /nonWorking\.textContent = "Non-Working Day"/);
  assert.match(stylesSource, /\.calendar-region:hover \.non-working-label/);
  assert.match(stylesSource, /\.calendar-region:focus-within \.non-working-label/);
});

test("accessible non-working-day label remains complete while visible label can be hidden", () => {
  assert.match(calendarSource, /Non-Working Day, " \+ holidayMessage\(skippedItems\)/);
  assert.match(stylesSource, /\.non-working-label \{[\s\S]*opacity: 0;/);
});
test("copy helper falls back to document copy command when Clipboard API is unavailable", async () => {
  const removed = [];
  const textarea = {
    value: "",
    className: "",
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    select() { this.selected = true; }
  };
  const documentRef = {
    body: {
      appendChild(node) { this.child = node; },
      removeChild(node) { removed.push(node); }
    },
    createElement(tagName) {
      assert.equal(tagName, "textarea");
      return textarea;
    },
    execCommand(command) {
      assert.equal(command, "copy");
      return true;
    }
  };

  await app.writeClipboardText("Wednesday, August 12th", null, documentRef);

  assert.equal(textarea.value, "Wednesday, August 12th");
  assert.equal(textarea.selected, true);
  assert.deepEqual(removed, [textarea]);
});
test("domains declare the numeric date format used by the copy estimate", () => {
  const formatsByDomain = Object.fromEntries(config.domains.map((domain) => [domain.id, domain.numericDateFormat]));

  assert.equal(formatsByDomain.us, "mdy");
  assert.equal(formatsByDomain.uk, "dmy");
  assert.equal(formatsByDomain["rest-of-europe"], "dmy");
  assert.equal(config.validateConfiguration(config).valid, true);
});

test("copy estimate UI exposes only the main written line and selected numeric line", () => {
  assert.match(indexHtml, /<h2 id="result-heading">/);
  assert.match(indexHtml, /id="copy-numeric" class="numeric-estimate"/);
  assert.match(indexHtml, /data-copy-target="result-heading"/);
  assert.match(indexHtml, /data-copy-target="copy-numeric"/);
  assert.doesNotMatch(indexHtml, /copy-written|copy-us-numeric|copy-day-first|copy-long|copy-format-row|copy-format-value/);
});
test("result copy buttons align in a consistent right-side column", () => {
  assert.match(stylesSource, /\.result-estimate-row \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?\}/);
  assert.match(stylesSource, /\.result-copy-button \{\s*justify-self: end;\s*\}/);
});

test("ordinary weekend skipped days are not annotated as exceptional non-working days", () => {
  const skippedDayMap = calendar.buildSkippedDayMap({
    skippedDays: [
      { date: "2026-09-05", stage: "transit", reason: { type: "weekend" } }
    ]
  });

  assert.deepEqual(skippedDayMap, {});
});

test("weekday holiday skipped days retain exceptional non-working annotations", () => {
  const skipped = {
    date: "2026-09-07",
    stage: "transit",
    reason: {
      type: "holiday",
      holidayName: "Labor Day",
      holiday: { observedDate: "2026-09-07" }
    }
  };
  const skippedDayMap = calendar.buildSkippedDayMap({ skippedDays: [skipped] });

  assert.deepEqual(skippedDayMap["2026-09-07"], [skipped]);
});

test("delivery ranges color only eligible delivery dates from transit dates", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-09-01",
    productionDates: ["2026-09-01"],
    queueForShipmentDate: "2026-09-01",
    transitRange: { min: 2, max: 4 },
    transitDates: ["2026-09-02", "2026-09-04", "2026-09-08", "2026-09-09"],
    expectedDeliveryStartDate: "2026-09-04",
    expectedDeliveryEndDate: "2026-09-09"
  });

  assert.equal(markerMap["2026-09-05"], undefined);
  assert.equal(markerMap["2026-09-06"], undefined);
  assert.equal(markerMap["2026-09-07"], undefined);
  assert.equal(markerMap["2026-09-04"].some((marker) => marker.label === "Earliest delivery"), true);
  assert.equal(markerMap["2026-09-08"].some((marker) => marker.accessibleLabel === "Expected eligible delivery date"), true);
  assert.equal(markerMap["2026-09-09"].some((marker) => marker.label === "Latest delivery"), true);
});

test("Saturday-capable delivery ranges can mark Saturday as eligible delivery", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-09-01",
    productionDates: ["2026-09-01"],
    queueForShipmentDate: "2026-09-01",
    transitRange: { min: 3, max: 4 },
    transitDates: ["2026-09-02", "2026-09-03", "2026-09-05", "2026-09-08"],
    expectedDeliveryStartDate: "2026-09-05",
    expectedDeliveryEndDate: "2026-09-08"
  });

  assert.equal(markerMap["2026-09-05"].some((marker) => marker.label === "Earliest delivery"), true);
  assert.equal(markerMap["2026-09-06"], undefined);
  assert.equal(markerMap["2026-09-08"].some((marker) => marker.label === "Latest delivery"), true);
});
test("Saturday delivery hierarchy keeps only eligible Saturday dates green", () => {
  const us = app.findDomain(config, "us");
  const standardMethod = us.shippingMethods.find((method) => method.id === "standard");
  const saturdayMethod = us.shippingMethods.find((method) => method.id === "standard-saturday");
  const standardEstimate = estimator.calculateEstimate({
    orderDate: "2026-08-31",
    productionDays: 1,
    domain: us,
    shippingMethod: standardMethod,
    shipmentTiming: "queued-before-cutoff"
  });
  const saturdayEstimate = estimator.calculateEstimate({
    orderDate: "2026-08-31",
    productionDays: 1,
    domain: us,
    shippingMethod: saturdayMethod,
    shipmentTiming: "queued-before-cutoff"
  });
  const standardMarkers = calendar.buildMarkerMap(standardEstimate);
  const saturdayMarkers = calendar.buildMarkerMap(saturdayEstimate);

  assert.equal(standardMarkers["2026-09-05"], undefined);
  assert.equal(saturdayMarkers["2026-09-05"].some((marker) => marker.type === "delivery"), true);
  assert.equal(saturdayMarkers["2026-09-06"], undefined);
  assert.equal(saturdayMarkers["2026-09-09"].some((marker) => marker.type === "delivery"), true);
});

test("green delivery styling remains dominant for eligible Saturday at rest and reveal", () => {
  assert.match(stylesSource, /\.day\.is-weekend \{\s*background: #f3f4f6;\s*\}/);
  assert.match(stylesSource, /\.day\.state-delivery \{\s*background: var\(--delivery-bg\);\s*color: var\(--delivery-text\);\s*\}/);
  assert.ok(stylesSource.indexOf(".day.state-delivery {") > stylesSource.indexOf(".day.is-weekend {"));
  assert.match(stylesSource, /\.calendar-region:hover \.state-delivery,[\s\S]*background: var\(--delivery-bg\);[\s\S]*color: var\(--delivery-text\);/);
});

test("fast shipping renders exactly the estimate start month and following month", () => {
  assert.deepEqual(calendar.monthSequence("2026-08-10"), [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 }
  ]);
});

test("slow ranged shipping still renders exactly two months", () => {
  assert.deepEqual(calendar.monthSequence("2026-08-10", "2026-10-15"), [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 }
  ]);
});

test("December estimate start rolls the second calendar month into January", () => {
  assert.deepEqual(calendar.monthSequence("2026-12-20"), [
    { year: 2026, month: 12 },
    { year: 2027, month: 1 }
  ]);
});

test("shipping method changes do not alter the rendered month count", () => {
  assert.equal(calendar.monthSequence("2026-08-10", "2026-08-12").length, 2);
  assert.equal(calendar.monthSequence("2026-08-10", "2026-10-20").length, 2);
  assert.match(calendarSource, /monthSequence\(estimate\.orderDate\)/);
});

test("weekday non-working dates inside the delivery window stay visibly exceptional at rest", () => {
  const estimate = {
    expectedDeliveryStartDate: "2026-09-04",
    expectedDeliveryEndDate: "2026-09-09"
  };

  assert.equal(calendar.isInsideDeliveryWindow(estimate, "2026-09-07"), true);
  assert.match(calendarSource, /is-delivery-window-interruption/);
  assert.match(stylesSource, /\.is-delivery-window-interruption \{[\s\S]*background: var\(--holiday-bg\);[\s\S]*color: var\(--holiday-text\);[\s\S]*\}/);
  assert.match(stylesSource, /\.is-delivery-window-interruption \.non-working-label \{\s*opacity: 1;\s*\}/);
});

test("weekday non-working dates outside the delivery window keep muted reveal treatment", () => {
  const estimate = {
    expectedDeliveryStartDate: "2026-09-04",
    expectedDeliveryEndDate: "2026-09-09"
  };

  assert.equal(calendar.isInsideDeliveryWindow(estimate, "2026-09-10"), false);
  assert.match(stylesSource, /\.is-skipped-holiday \{\s*border-left: 3px solid var\(--border\);\s*background: var\(--surface-muted\);\s*color: var\(--muted\);\s*\}/s);
  assert.match(stylesSource, /\.calendar-region:hover \.is-skipped-holiday/);
});

test("skipped production days do not consume production numbers", () => {
  const us = app.findDomain(config, "us");
  const method = us.shippingMethods.find((shippingMethod) => shippingMethod.id === "express");
  const estimate = estimator.calculateEstimate({
    orderDate: "2026-06-30",
    productionDays: 3,
    domain: us,
    shippingMethod: method
  });
  const markerMap = calendar.buildMarkerMap(estimate);

  assert.deepEqual(estimate.productionDates, ["2026-07-01", "2026-07-02", "2026-07-06"]);
  assert.equal(markerMap["2026-07-01"].find((marker) => marker.type === "production").label, "Production 1");
  assert.equal(markerMap["2026-07-02"].find((marker) => marker.type === "production").label, "Production 2");
  assert.equal(markerMap["2026-07-06"].find((marker) => marker.type === "production").label, "Production 3");
  assert.match(markerMap["2026-07-06"].find((marker) => marker.type === "production").accessibleLabel, /final production day/);
});

test("skipped transit-ineligible days do not consume transit numbers", () => {
  const us = app.findDomain(config, "us");
  const method = us.shippingMethods.find((shippingMethod) => shippingMethod.id === "premium");
  const transit = estimator.calculateTransit("2026-07-02", { min: 2, max: 2 }, us, method, "unknown");
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-07-01",
    productionDates: ["2026-07-02"],
    queueForShipmentDate: "2026-07-02",
    transitDates: transit.transitDates,
    expectedDeliveryDate: transit.expectedDeliveryDate
  });

  assert.deepEqual(transit.transitDates, ["2026-07-06", "2026-07-07"]);
  assert.equal(markerMap["2026-07-06"].find((marker) => marker.type === "transit").label, "Transit 1");
  assert.equal(markerMap["2026-07-07"].find((marker) => marker.type === "transit").label, "Transit 2");
});

test("ranged methods expose transit numbering through the latest delivery calculation", () => {
  const estimate = requiredEstimate("Standard Shipping");
  const markerMap = calendar.buildMarkerMap(estimate);

  assert.equal(estimate.transitDates.length, 7);
  assert.equal(markerMap[estimate.transitDates[0]].find((marker) => marker.type === "transit").label, "Transit 1");
  assert.equal(markerMap[estimate.transitDates[6]].find((marker) => marker.type === "transit").label, "Transit 7");
});

test("same-day pickup overlap retains production queue and pickup semantics", () => {
  const markerMap = calendar.buildMarkerMap({
    orderDate: "2026-08-10",
    productionDates: ["2026-08-11", "2026-08-12"],
    queueForShipmentDate: "2026-08-12",
    shipmentTiming: "queued-before-cutoff",
    pickupDate: "2026-08-12",
    pickupType: "same-day",
    transitDates: ["2026-08-13"],
    expectedDeliveryDate: "2026-08-13"
  });
  const summary = calendar.summarizeDateMarkers(markerMap["2026-08-12"]);

  assert.equal(summary.primaryLabel, "Production 2");
  assert.deepEqual(summary.secondaryLabels.map((marker) => marker.label), ["Same Day Pick-Up"]);
  assert.match(summary.accessibleLabel, /Production day 2, final production day, queued for shipment, Same Day Pick-Up/);
});
