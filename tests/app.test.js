const assert = require("node:assert/strict");
const test = require("node:test");

const app = require("../src/app");

const testConfig = {
  domains: [
    {
      id: "us",
      label: "United States",
      transitHolidayCalendar: "us-federal",
      shippingMethods: [
        { id: "ground", label: "Ground", transitDays: { min: 4, max: 7 } },
        { id: "express", label: "Express", transitDays: 2, countsSaturdayTransit: true }
      ]
    },
    {
      id: "international",
      label: "International",
      transitHolidayCalendar: "none",
      shippingMethods: [
        { id: "intl-standard", label: "International standard", transitDays: { min: 6, max: 10 } }
      ]
    }
  ]
};

function fakeField() {
  return {
    listeners: {},
    addEventListener(eventName, callback) {
      if (!this.listeners[eventName]) {
        this.listeners[eventName] = [];
      }
      this.listeners[eventName].push(callback);
    },
    trigger(eventName) {
      this.listeners[eventName].forEach((callback) => callback());
    }
  };
}

test("changing domain updates the available shipping methods", () => {
  assert.deepEqual(
    app.getShippingMethodChoices(testConfig, "us").map((choice) => choice.value),
    ["ground", "express"]
  );

  assert.deepEqual(
    app.getShippingMethodChoices(testConfig, "international").map((choice) => choice.value),
    ["intl-standard"]
  );
});

test("changing any input wires immediate recalculation", () => {
  const elements = {
    domainSelect: fakeField(),
    orderDateInput: fakeField(),
    productionDaysInput: fakeField(),
    shippingMethodSelect: fakeField()
  };
  const events = [];

  app.bindFormEvents(elements, {
    onDomainChange() {
      events.push("domain");
    },
    onRecalculate() {
      events.push("recalculate");
    }
  });

  elements.domainSelect.trigger("change");
  elements.orderDateInput.trigger("input");
  elements.productionDaysInput.trigger("input");
  elements.shippingMethodSelect.trigger("change");

  assert.deepEqual(events, [
    "domain",
    "recalculate",
    "recalculate",
    "recalculate",
    "recalculate"
  ]);
});
