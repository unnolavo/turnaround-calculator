const assert = require("node:assert/strict");
const test = require("node:test");

const app = require("../src/app");
const config = require("../src/domain-config");

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

test("shipping method choices show their configured business-day durations", () => {
  assert.deepEqual(app.getShippingMethodChoices(testConfig, "us"), [
    { value: "ground", label: "Ground (4-7 bd)" },
    { value: "express", label: "Express (2 bd)" }
  ]);
  assert.deepEqual(app.getShippingMethodChoices(testConfig, "international"), [
    { value: "intl-standard", label: "International standard (6-10 bd)" }
  ]);
});

test("real configuration validates successfully", () => {
  const result = config.validateConfiguration(config);

  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("US domain contains exactly five approved methods", () => {
  const us = app.findDomain(config, "us");

  assert.deepEqual(
    us.shippingMethods.map((method) => method.label),
    [
      "Standard Shipping",
      "Standard Shipping (with Saturday Delivery)",
      "Premium Shipping",
      "2-3 Day Shipping",
      "Express Shipping"
    ]
  );
});

test("real domain dropdown choices include Zazzle website labels without changing ids", () => {
  assert.deepEqual(
    app.getDomainChoices(config),
    [
      { value: "us", label: "US — Zazzle.com" },
      { value: "uk", label: "UK — Zazzle.co.uk" },
      { value: "ca", label: "CA — Zazzle.ca" },
      { value: "au", label: "AU — Zazzle.com.au" },
      { value: "nz", label: "NZ — Zazzle.co.nz" },
      { value: "at", label: "AT — Zazzle.at" },
      { value: "jp", label: "JP — Zazzle.co.jp" },
      { value: "br", label: "BR — Zazzle.com.br" },
      { value: "pt", label: "PT — Zazzle.pt" },
      { value: "fr", label: "FR — Zazzle.fr" },
      { value: "de", label: "DE — Zazzle.de" },
      { value: "it", label: "IT — Zazzle.it" },
      { value: "ch", label: "CH — Zazzle.ch" },
      { value: "nl", label: "NL — Zazzle.nl" },
      { value: "be", label: "BE — Zazzle.be" },
      { value: "es", label: "ES — Zazzle.es" },
      { value: "se", label: "SE — Zazzle.se" },
      { value: "rest-of-europe", label: "Rest of Europe — Zazzle.co.uk" }
    ]
  );
});

test("US methods have the approved durations and Saturday eligibility", () => {
  const us = app.findDomain(config, "us");
  const methods = Object.fromEntries(us.shippingMethods.map((method) => [method.label, method]));

  assert.deepEqual(methods["Standard Shipping"].transitDays, { min: 4, max: 7 });
  assert.equal(methods["Standard Shipping"].countsSaturdayTransit, false);
  assert.deepEqual(methods["Standard Shipping (with Saturday Delivery)"].transitDays, { min: 4, max: 7 });
  assert.equal(methods["Standard Shipping (with Saturday Delivery)"].countsSaturdayTransit, true);
  assert.equal(methods["Premium Shipping"].transitDays, 2);
  assert.equal(methods["Premium Shipping"].countsSaturdayTransit, false);
  assert.deepEqual(methods["2-3 Day Shipping"].transitDays, { min: 2, max: 3 });
  assert.equal(methods["2-3 Day Shipping"].countsSaturdayTransit, false);
  assert.equal(methods["Express Shipping"].transitDays, 1);
  assert.equal(methods["Express Shipping"].countsSaturdayTransit, false);
});

test("JP and BR do not offer Slow, no tracking", () => {
  ["jp", "br"].forEach((domainId) => {
    const domain = app.findDomain(config, domainId);

    assert.equal(domain.shippingMethods.some((method) => method.label === "Slow, no tracking"), false);
  });
});

test("international domains expose approved methods and source values", () => {
  const expected = {
    uk: { slow: [9, 18], standard: [4, 7], expedited: [2, 4] },
    ca: { slow: [9, 18], standard: [5, 8], expedited: [3, 5] },
    au: { slow: [10, 18], standard: [7, 10], expedited: [3, 5] },
    nz: { slow: [11, 20], standard: [7, 11], expedited: [4, 6] },
    at: { slow: [9, 18], standard: [7, 10], expedited: [3, 5] },
    jp: { standard: [7, 10], expedited: [5, 6] },
    br: { standard: [7, 12], expedited: [4, 6] },
    pt: { slow: [9, 18], standard: [5, 9], expedited: [2, 5] },
    fr: { slow: [9, 18], standard: [5, 9], expedited: [3, 5] },
    de: { slow: [9, 18], standard: [5, 9], expedited: [3, 5] },
    it: { slow: [9, 18], standard: [7, 10], expedited: [3, 5] },
    ch: { slow: [9, 18], standard: [7, 10], expedited: [3, 5] },
    nl: { slow: [9, 18], standard: [5, 9], expedited: [3, 5] },
    be: { slow: [9, 18], standard: [5, 9], expedited: [3, 5] },
    es: { slow: [10, 18], standard: [5, 9], expedited: [3, 5] },
    se: { slow: [10, 18], standard: [5, 9], expedited: [3, 5] }
  };
  const labelsById = {
    slow: "Slow, no tracking",
    standard: "Standard with tracking",
    expedited: "Expedited with tracking"
  };

  Object.entries(expected).forEach(([domainId, methodRanges]) => {
    const domain = app.findDomain(config, domainId);
    assert.equal(domain.transitHolidayCalendar, "none");

    assert.deepEqual(
      domain.shippingMethods.map((method) => method.label),
      Object.keys(methodRanges).map((methodId) => labelsById[methodId])
    );

    Object.entries(methodRanges).forEach(([methodId, bounds]) => {
      const shippingMethod = domain.shippingMethods.find((method) => method.id === methodId);
      assert.deepEqual(shippingMethod.transitDays, { min: bounds[0], max: bounds[1] });
      assert.equal(shippingMethod.countsSaturdayTransit, false);
    });
  });
});

test("Rest of Europe matches UK method labels and durations without sharing method objects", () => {
  const uk = app.findDomain(config, "uk");
  const restOfEurope = app.findDomain(config, "rest-of-europe");

  assert.deepEqual(
    restOfEurope.shippingMethods.map((method) => ({ label: method.label, transitDays: method.transitDays })),
    uk.shippingMethods.map((method) => ({ label: method.label, transitDays: method.transitDays }))
  );

  restOfEurope.shippingMethods.forEach((method, index) => {
    assert.notEqual(method, uk.shippingMethods[index]);
    assert.notEqual(method.transitDays, uk.shippingMethods[index].transitDays);
  });
});

test("every configured shipping method dropdown label includes its business-day duration", () => {
  config.domains.forEach((domain) => {
    const choices = app.getShippingMethodChoices(config, domain.id);

    assert.equal(choices.length, domain.shippingMethods.length);
    choices.forEach((choice, index) => {
      const method = domain.shippingMethods[index];
      const expectedDuration = typeof method.transitDays === "number"
        ? method.transitDays + " bd"
        : method.transitDays.min + "-" + method.transitDays.max + " bd";

      assert.equal(choice.label, method.label + " (" + expectedDuration + ")");
    });
  });
});

test("changing from US to international methods replaces unavailable prior selection", () => {
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

  app.replaceSelectOptions(
    documentRef,
    select,
    app.getShippingMethodChoices(config, "jp"),
    "express"
  );

  assert.deepEqual(select.children.map((option) => option.value), ["standard", "expedited"]);
  assert.equal(select.value, "standard");
});

test("changing any input wires immediate recalculation", () => {
  const elements = {
    domainSelect: fakeField(),
    orderDateInput: fakeField(),
    productionDaysInput: fakeField(),
    shippingMethodSelect: fakeField(),
    shipmentTimingSelect: fakeField()
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
  elements.shipmentTimingSelect.trigger("change");

  assert.deepEqual(events, [
    "domain",
    "recalculate",
    "recalculate",
    "recalculate",
    "recalculate",
    "recalculate"
  ]);
});

test("production quick buttons set values 1 through 5 and update active state", () => {
  const events = [];
  const input = { value: "1" };
  function button(value) {
    const control = {
      value,
      listeners: {},
      classes: new Set(),
      attrs: { "data-production-days": value },
      getAttribute(name) { return this.attrs[name]; },
      setAttribute(name, nextValue) { this.attrs[name] = nextValue; },
      addEventListener(eventName, callback) { this.listeners[eventName] = callback; },
      trigger(eventName) { this.listeners[eventName](); }
    };
    control.classList = {
      toggle(className, active) {
        if (active) {
          control.classes.add(className);
        } else {
          control.classes.delete(className);
        }
      }
    };
    return control;
  }
  const buttons = ["1", "2", "3", "4", "5"].map(button);
  const elements = { productionDaysInput: input, productionQuickButtons: buttons };

  app.bindProductionQuickButtons(elements, { onRecalculate() { events.push("recalculate"); } });
  buttons[4].trigger("click");

  assert.equal(input.value, "5");
  assert.equal(buttons[4].attrs["aria-pressed"], "true");
  assert.equal(buttons[0].attrs["aria-pressed"], "false");
  assert.deepEqual(events, ["recalculate"]);
});

test("production numeric input is clamped to the supported 1 through 20 range", () => {
  assert.equal(app.clampProductionDaysValue("0"), "1");
  assert.equal(app.clampProductionDaysValue("21"), "20");
  assert.equal(app.clampProductionDaysValue("4.9"), "4");
});
