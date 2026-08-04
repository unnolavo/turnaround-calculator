const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const estimator = require("../src/estimator");
const holidays = require("../src/us-holidays");
const config = require("../src/domain-config");

const usDomain = {
  id: "us",
  label: "United States",
  transitHolidayCalendar: "us-federal"
};

const internationalDomain = {
  id: "international",
  label: "International",
  transitHolidayCalendar: "none"
};

const fixedOneDay = {
  id: "fixed-one",
  label: "Fixed one day",
  transitDays: 1,
  countsSaturdayTransit: false
};

const fixedOneDaySaturday = {
  id: "fixed-one-saturday",
  label: "Fixed one day with Saturday delivery",
  transitDays: 1,
  countsSaturdayTransit: true
};

function estimate(overrides) {
  return estimator.calculateEstimate(Object.assign({
    orderDate: "2026-07-28",
    productionDays: 2,
    domain: usDomain,
    shippingMethod: fixedOneDay
  }, overrides));
}

test("Tuesday order plus two production days queues on Thursday", () => {
  const result = estimate({
    orderDate: "2026-07-28",
    productionDays: 2
  });

  assert.deepEqual(result.productionDates, ["2026-07-29", "2026-07-30"]);
  assert.equal(result.queueForShipmentDate, "2026-07-30");
});

test("Friday order begins production on Monday when Monday is not a holiday", () => {
  const result = estimate({
    orderDate: "2026-07-10",
    productionDays: 1
  });

  assert.deepEqual(result.productionDates, ["2026-07-13"]);
});

test("production crossing a weekend skips Saturday and Sunday", () => {
  const result = estimate({
    orderDate: "2026-07-09",
    productionDays: 3
  });

  assert.deepEqual(result.productionDates, ["2026-07-10", "2026-07-13", "2026-07-14"]);
  assert.deepEqual(
    result.skippedDays.filter((day) => day.stage === "production").map((day) => day.date),
    ["2026-07-11", "2026-07-12"]
  );
});

test("production crossing an observed U.S. federal holiday skips it", () => {
  const result = estimate({
    orderDate: "2026-07-02",
    productionDays: 2
  });

  assert.deepEqual(result.productionDates, ["2026-07-06", "2026-07-07"]);
  assert.equal(result.queueForShipmentDate, "2026-07-07");
  assert.equal(
    result.skippedDays.find((day) => day.date === "2026-07-03").reason.holidayName,
    "Independence Day"
  );
});

test("order placed on a weekend starts production on the next eligible production day", () => {
  const result = estimate({
    orderDate: "2026-07-11",
    productionDays: 1
  });

  assert.deepEqual(result.productionDates, ["2026-07-13"]);
});

test("order placed on a holiday starts production on the next eligible production day", () => {
  const result = estimate({
    orderDate: "2026-01-19",
    productionDays: 1
  });

  assert.deepEqual(result.productionDates, ["2026-01-20"]);
});

test("U.S. transit crossing an observed federal holiday skips it", () => {
  const result = estimate({
    orderDate: "2026-07-01",
    productionDays: 1,
    domain: usDomain,
    shippingMethod: fixedOneDay
  });

  assert.equal(result.queueForShipmentDate, "2026-07-02");
  assert.equal(result.expectedDeliveryDate, "2026-07-06");
  assert.equal(
    result.skippedDays.find((day) => day.date === "2026-07-03" && day.stage === "transit").reason.holidayName,
    "Independence Day"
  );
});

test("international transit crossing a U.S. holiday does not skip it", () => {
  const result = estimate({
    orderDate: "2026-07-01",
    productionDays: 1,
    domain: internationalDomain,
    shippingMethod: fixedOneDay
  });

  assert.equal(result.queueForShipmentDate, "2026-07-02");
  assert.equal(result.expectedDeliveryDate, "2026-07-03");
});

test("default transit skips Saturday and Sunday", () => {
  const result = estimate({
    orderDate: "2026-07-09",
    productionDays: 1,
    domain: usDomain,
    shippingMethod: fixedOneDay
  });

  assert.equal(result.queueForShipmentDate, "2026-07-10");
  assert.equal(result.expectedDeliveryDate, "2026-07-13");
});

test("configured U.S. Saturday delivery counts Saturday once transit minimum is reached", () => {
  const result = estimate({
    orderDate: "2026-07-09",
    productionDays: 1,
    domain: usDomain,
    shippingMethod: fixedOneDaySaturday
  });

  assert.equal(result.queueForShipmentDate, "2026-07-10");
  assert.equal(result.expectedDeliveryDate, "2026-07-11");
});

test("fixed-duration shipping produces one expected delivery date", () => {
  const result = estimate({
    orderDate: "2026-08-03",
    productionDays: 1,
    shippingMethod: {
      id: "two-day",
      label: "Two day",
      transitDays: 2
    }
  });

  assert.equal(result.expectedDeliveryDate, "2026-08-06");
  assert.equal(result.expectedDeliveryStartDate, "2026-08-06");
  assert.equal(result.expectedDeliveryEndDate, "2026-08-06");
});

test("minimum-to-maximum delivery ranges produce inclusive bound dates", () => {
  const result = estimate({
    orderDate: "2026-01-05",
    productionDays: 1,
    shippingMethod: {
      id: "range",
      label: "Range",
      transitDays: { min: 4, max: 7 }
    }
  });

  assert.equal(result.queueForShipmentDate, "2026-01-06");
  assert.equal(result.expectedDeliveryDate, null);
  assert.equal(result.expectedDeliveryStartDate, "2026-01-12");
  assert.equal(result.expectedDeliveryEndDate, "2026-01-15");
});

test("year-end observed holiday boundaries are handled", () => {
  const result = estimate({
    orderDate: "2021-12-30",
    productionDays: 2
  });

  assert.deepEqual(result.productionDates, ["2022-01-03", "2022-01-04"]);
  assert.equal(
    result.skippedDays.find((day) => day.date === "2021-12-31").reason.holidayName,
    "New Year's Day"
  );
});

test("observed holidays that move to Monday are handled", () => {
  const result = estimate({
    orderDate: "2022-12-30",
    productionDays: 1
  });

  assert.deepEqual(result.productionDates, ["2023-01-03"]);
});

test("leap years are handled as date-only calendar days", () => {
  const result = estimate({
    orderDate: "2024-02-28",
    productionDays: 2
  });

  assert.deepEqual(result.productionDates, ["2024-02-29", "2024-03-01"]);
});

test("invalid and zero production durations are rejected", () => {
  assert.throws(() => estimate({ productionDays: 0 }), /positive whole number/);
  assert.throws(() => estimate({ productionDays: "1.5" }), /positive whole number/);
  assert.throws(() => estimate({ productionDays: -1 }), /positive whole number/);
});

test("holiday helper exposes observed Friday and Monday dates", () => {
  assert.equal(holidays.getObservedFederalHoliday("2021-12-31").name, "New Year's Day");
  assert.equal(holidays.getObservedFederalHoliday("2023-01-02").name, "New Year's Day");
});

test("date-only calculations remain stable regardless of Node timezone", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const script = [
    "const estimator = require('./src/estimator');",
    "const domain = { id: 'us', label: 'US', transitHolidayCalendar: 'us-federal' };",
    "const method = { id: 'range', label: 'Range', transitDays: { min: 4, max: 7 } };",
    "const result = estimator.calculateEstimate({ orderDate: '2024-02-28', productionDays: 2, domain, shippingMethod: method });",
    "console.log(result.queueForShipmentDate + '|' + result.expectedDeliveryStartDate + '|' + result.expectedDeliveryEndDate);"
  ].join("");
  const zones = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"];
  const outputs = zones.map((zone) => execFileSync(process.execPath, ["-e", script], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, { TZ: zone }),
    encoding: "utf8"
  }).trim());

  assert.equal(new Set(outputs).size, 1);
});

test("representative international range from real configuration integrates with estimator", () => {
  const ca = config.domains.find((domain) => domain.id === "ca");
  const standard = ca.shippingMethods.find((method) => method.label === "Standard with tracking");
  const result = estimator.calculateEstimate({
    orderDate: "2026-07-01",
    productionDays: 1,
    domain: ca,
    shippingMethod: standard
  });

  assert.equal(result.queueForShipmentDate, "2026-07-02");
  assert.equal(result.expectedDeliveryStartDate, "2026-07-09");
  assert.equal(result.expectedDeliveryEndDate, "2026-07-14");
});

test("real US Saturday method counts eligible Saturday while ordinary Standard Shipping skips it", () => {
  const us = config.domains.find((domain) => domain.id === "us");
  const standard = us.shippingMethods.find((method) => method.label === "Standard Shipping");
  const saturday = us.shippingMethods.find((method) => method.label === "Standard Shipping (with Saturday Delivery)");
  const input = {
    orderDate: "2026-07-06",
    productionDays: 1,
    domain: us
  };

  const standardResult = estimator.calculateEstimate(Object.assign({}, input, { shippingMethod: standard }));
  const saturdayResult = estimator.calculateEstimate(Object.assign({}, input, { shippingMethod: saturday }));

  assert.equal(standardResult.queueForShipmentDate, "2026-07-07");
  assert.equal(standardResult.expectedDeliveryStartDate, "2026-07-13");
  assert.equal(saturdayResult.expectedDeliveryStartDate, "2026-07-11");
});

test("real US transit skips observed federal holiday while international transit does not", () => {
  const us = config.domains.find((domain) => domain.id === "us");
  const ca = config.domains.find((domain) => domain.id === "ca");
  const express = us.shippingMethods.find((method) => method.label === "Express Shipping");
  const caStandard = ca.shippingMethods.find((method) => method.label === "Standard with tracking");

  const usResult = estimator.calculateEstimate({
    orderDate: "2026-07-01",
    productionDays: 1,
    domain: us,
    shippingMethod: express
  });
  const internationalResult = estimator.calculateEstimate({
    orderDate: "2026-07-01",
    productionDays: 1,
    domain: ca,
    shippingMethod: caStandard
  });

  assert.equal(usResult.queueForShipmentDate, "2026-07-02");
  assert.equal(usResult.expectedDeliveryDate, "2026-07-06");
  assert.equal(internationalResult.transitDates.includes("2026-07-03"), true);
});
