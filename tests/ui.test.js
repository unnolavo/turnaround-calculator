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

function requiredEstimate(methodLabel) {
  const us = config.domains.find((domain) => domain.id === "us");
  const shippingMethod = us.shippingMethods.find((method) => method.label === methodLabel);

  return estimator.calculateEstimate({
    orderDate: "2026-08-10",
    productionDays: 2,
    domain: us,
    shippingMethod
  });
}

test("all four required inputs are present and prohibited controls are absent", () => {
  assert.match(indexHtml, /<select id="domain"/);
  assert.match(indexHtml, /<input id="order-date"[^>]+type="date"/);
  assert.match(indexHtml, /<input id="production-days"[^>]+type="number"/);
  assert.match(indexHtml, /<select id="shipping-method"/);

  assert.doesNotMatch(indexHtml, /<button[^>]*>[^<]*calculate/i);
  assert.doesNotMatch(indexHtml, /queue cutoff/i);
  assert.doesNotMatch(indexHtml, /carrier received/i);
});

test("form controls declare the intended logical rows", () => {
  assert.match(indexHtml, /<div class="field" data-form-row="1">\s*<label for="domain">Domain<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="1">\s*<label for="order-date">Order date<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="2">\s*<label for="production-days">Production days<\/label>/);
  assert.match(indexHtml, /<div class="field" data-form-row="2">\s*<label for="shipping-method">Shipping method<\/label>/);
});

test("production-days validation is visibly and accessibly associated with the field", () => {
  assert.match(indexHtml, /id="production-days"[^>]+aria-describedby="production-days-error"/);
  assert.match(indexHtml, /id="production-days-error"[^>]+class="field-error"[^>]+hidden/);
});

test("changing each input is wired to recalculate immediately", () => {
  assert.match(appSource, /domainSelect\.addEventListener\("change"/);
  assert.match(appSource, /orderDateInput\.addEventListener\("input"/);
  assert.match(appSource, /orderDateInput\.addEventListener\("change"/);
  assert.match(appSource, /productionDaysInput\.addEventListener\("input"/);
  assert.match(appSource, /productionDaysInput\.addEventListener\("change"/);
  assert.match(appSource, /shippingMethodSelect\.addEventListener\("change"/);
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
    "Standard with tracking",
    "Expedited with tracking"
  ]);
  assert.equal(select.value, "standard");
});

test("fixed shipping displays one expected-delivery date", () => {
  assert.equal(app.formatEstimateHeading(requiredEstimate("Express Shipping")), "Thursday, August 13, 2026");
});

test("ranged shipping displays both expected-delivery bounds", () => {
  assert.equal(
    app.formatEstimateHeading(requiredEstimate("Standard Shipping")),
    "Tuesday, August 18, 2026 - Friday, August 21, 2026"
  );
});

test("summary states selected domain, method, and queue as final production day", () => {
  const estimate = requiredEstimate("Express Shipping");

  assert.equal(estimate.queueForShipmentDate, estimate.productionDates.at(-1));
  assert.match(app.formatEstimateDetail(estimate), /Domain: US/);
  assert.match(app.formatEstimateDetail(estimate), /Method: Express Shipping/);
  assert.match(app.formatEstimateDetail(estimate), /Queue for Shipment: Wednesday, August 12, 2026 \(final production day\)/);
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
    transitDates: ["2026-08-12"],
    expectedDeliveryDate: "2026-08-13"
  });

  assert.deepEqual(markerMap["2026-08-11"].map((marker) => marker.type), ["production"]);
  assert.deepEqual(markerMap["2026-08-12"].map((marker) => marker.type), ["transit"]);
  assert.deepEqual(markerMap["2026-08-13"].map((marker) => marker.type), ["delivery"]);
  assert.equal(/transitDays|shippingMethods|business day/i.test(calendarSource), false);
});

test("calendar marker summary produces one concise primary label", () => {
  const summary = calendar.summarizeDateMarkers([
    { type: "production", label: "Production", accessibleLabel: "Production" },
    { type: "delivery", label: "Expected delivery", accessibleLabel: "Expected delivery" }
  ]);

  assert.equal(summary.primaryLabel, "Expected delivery");
  assert.deepEqual(summary.activeTypes, ["production", "delivery"]);
});

test("four-item legend contains only approved concepts", () => {
  const legendLabels = Array.from(indexHtml.matchAll(/<span class="legend-item [^"]+">([^<]+)<\/span>/g)).map((match) => match[1]);

  assert.deepEqual(legendLabels, [
    "Order placed",
    "Production",
    "Transit",
    "Expected delivery"
  ]);
});

test("holiday information identifies skipped stage and is keyboard accessible", () => {
  const message = calendar.holidayMessage([
    {
      stage: "production",
      reason: {
        holidayName: "Independence Day",
        holiday: { observedDate: "2026-07-03" }
      }
    },
    {
      stage: "transit",
      reason: {
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
