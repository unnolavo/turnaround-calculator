(function (root, factory) {
  var dateUtils = root.TurnaroundDateUtils;
  var holidays = root.TurnaroundHolidays;

  if (!dateUtils && typeof require === "function") {
    dateUtils = require("./date-utils");
  }
  if (!holidays && typeof require === "function") {
    holidays = require("./us-holidays");
  }

  var api = factory(dateUtils, holidays);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TurnaroundEstimator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dateUtils, holidays) {
  "use strict";

  var SHIPMENT_TIMING_OPTIONS = {
    unknown: {
      id: "unknown",
      label: "Not Shipped Yet / Unknown",
      assumption: "Conservative estimate - pickup occurs on the next eligible pickup day",
      allowsSameDayPickup: false
    },
    "queued-before-cutoff": {
      id: "queued-before-cutoff",
      label: "Queued before 4 PM",
      assumption: "Same-day pickup - queue date is the pickup day",
      allowsSameDayPickup: true
    },
    "queued-after-cutoff": {
      id: "queued-after-cutoff",
      label: "Queued after 4 PM",
      assumption: "After-cutoff pickup - pickup occurs on the next eligible pickup day",
      allowsSameDayPickup: false
    }
  };

  var SHIPMENT_TIMING_CHOICES = [
    SHIPMENT_TIMING_OPTIONS.unknown,
    SHIPMENT_TIMING_OPTIONS["queued-before-cutoff"],
    SHIPMENT_TIMING_OPTIONS["queued-after-cutoff"]
  ];

  function normalizePositiveWholeNumber(value, label) {
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
      throw new RangeError(label + " must be a positive whole number.");
    }

    var number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new RangeError(label + " must be a positive whole number.");
    }

    return number;
  }

  function normalizeProductionDays(value) {
    var days = normalizePositiveWholeNumber(value, "Production days");
    if (days > 20) {
      throw new RangeError("Production days must be between 1 and 20.");
    }
    return days;
  }

  function normalizeShipmentTiming(value) {
    if (value === undefined || value === null || value === "") {
      return SHIPMENT_TIMING_OPTIONS.unknown;
    }

    var timing = SHIPMENT_TIMING_OPTIONS[value];
    if (!timing) {
      throw new RangeError("Shipment timing must be one of the approved options.");
    }

    return timing;
  }

  function normalizeTransitRange(shippingMethod) {
    if (!shippingMethod) {
      throw new TypeError("Shipping method is required.");
    }

    var transitDays = shippingMethod.transitDays;
    if (typeof transitDays === "number" || typeof transitDays === "string") {
      var fixed = normalizePositiveWholeNumber(transitDays, "Transit days");
      return { min: fixed, max: fixed, isRange: false };
    }

    if (!transitDays || typeof transitDays !== "object") {
      throw new TypeError("Shipping method must define transitDays.");
    }

    var min = normalizePositiveWholeNumber(transitDays.min, "Minimum transit days");
    var max = normalizePositiveWholeNumber(transitDays.max, "Maximum transit days");

    if (min > max) {
      throw new RangeError("Minimum transit days cannot be greater than maximum transit days.");
    }

    return { min: min, max: max, isRange: min !== max };
  }

  function domainSkipsUsTransitHolidays(domain) {
    return Boolean(domain && domain.transitHolidayCalendar === "us-federal");
  }

  function methodCountsSaturdayTransit(domain, shippingMethod) {
    return domainSkipsUsTransitHolidays(domain) && Boolean(shippingMethod && shippingMethod.countsSaturdayTransit);
  }

  function productionSkipReason(isoDate) {
    if (dateUtils.isWeekend(isoDate)) {
      return {
        type: "weekend",
        message: "Weekend - production skipped."
      };
    }

    var holiday = holidays.getObservedFederalHoliday(isoDate);
    if (holiday) {
      return {
        type: "holiday",
        holidayName: holiday.name,
        holiday: holiday,
        message: holidays.describeObservedFederalHoliday(holiday) + " - production skipped."
      };
    }

    return null;
  }

  function pickupSkipReason(isoDate) {
    if (dateUtils.isWeekend(isoDate)) {
      return {
        type: "weekend",
        message: "Weekend - pickup skipped."
      };
    }

    var holiday = holidays.getObservedFederalHoliday(isoDate);
    if (holiday) {
      return {
        type: "holiday",
        holidayName: holiday.name,
        holiday: holiday,
        message: holidays.describeObservedFederalHoliday(holiday) + " - pickup skipped."
      };
    }

    return null;
  }

  function transitSkipReason(isoDate, options) {
    if (dateUtils.isSunday(isoDate)) {
      return {
        type: "weekend",
        message: "Sunday - transit skipped."
      };
    }

    if (dateUtils.isSaturday(isoDate) && !options.countsSaturdayTransit) {
      return {
        type: "weekend",
        message: "Saturday - transit skipped for this method."
      };
    }

    if (options.skipsUsTransitHolidays) {
      var holiday = holidays.getObservedFederalHoliday(isoDate);
      if (holiday) {
        return {
          type: "holiday",
          holidayName: holiday.name,
          holiday: holiday,
          message: holidays.describeObservedFederalHoliday(holiday) + " - transit skipped."
        };
      }
    }

    return null;
  }

  function calculateProduction(orderDate, productionDays) {
    dateUtils.parseIsoDate(orderDate);
    var targetDays = normalizeProductionDays(productionDays);
    var cursor = dateUtils.addCalendarDays(orderDate, 1);
    var countedDays = 0;
    var productionDates = [];
    var skippedDays = [];

    while (countedDays < targetDays) {
      var skipReason = productionSkipReason(cursor);

      if (skipReason) {
        skippedDays.push({
          date: cursor,
          stage: "production",
          reason: skipReason
        });
      } else {
        countedDays += 1;
        productionDates.push(cursor);
      }

      if (countedDays < targetDays) {
        cursor = dateUtils.addCalendarDays(cursor, 1);
      }
    }

    return {
      productionDates: productionDates,
      productionStartDate: productionDates[0],
      queueForShipmentDate: productionDates[productionDates.length - 1],
      skippedDays: skippedDays
    };
  }

  function calculatePickup(queueForShipmentDate, shipmentTiming) {
    dateUtils.parseIsoDate(queueForShipmentDate);
    var timing = normalizeShipmentTiming(shipmentTiming);
    var cursor = timing.allowsSameDayPickup ? queueForShipmentDate : dateUtils.addCalendarDays(queueForShipmentDate, 1);
    var skippedDays = [];
    var skipReason = pickupSkipReason(cursor);

    while (skipReason) {
      skippedDays.push({
        date: cursor,
        stage: "pickup",
        reason: skipReason
      });
      cursor = dateUtils.addCalendarDays(cursor, 1);
      skipReason = pickupSkipReason(cursor);
    }

    return {
      pickupDate: cursor,
      pickupType: cursor === queueForShipmentDate ? "same-day" : "next-day",
      skippedDays: skippedDays
    };
  }

  function calculateTransit(pickupDate, transitRange, domain, shippingMethod) {
    dateUtils.parseIsoDate(pickupDate);
    var range = transitRange ? normalizeTransitRange({ transitDays: transitRange }) : normalizeTransitRange(shippingMethod);
    var options = {
      countsSaturdayTransit: methodCountsSaturdayTransit(domain, shippingMethod),
      skipsUsTransitHolidays: domainSkipsUsTransitHolidays(domain)
    };
    var cursor = dateUtils.addCalendarDays(pickupDate, 1);
    var countedDays = 0;
    var transitDates = [];
    var skippedDays = [];
    var expectedDeliveryStartDate = null;
    var expectedDeliveryEndDate = null;

    while (countedDays < range.max) {
      var skipReason = transitSkipReason(cursor, options);

      if (skipReason) {
        skippedDays.push({
          date: cursor,
          stage: "transit",
          reason: skipReason
        });
      } else {
        countedDays += 1;
        transitDates.push(cursor);

        if (countedDays === range.min) {
          expectedDeliveryStartDate = cursor;
        }
        if (countedDays === range.max) {
          expectedDeliveryEndDate = cursor;
        }
      }

      if (countedDays < range.max) {
        cursor = dateUtils.addCalendarDays(cursor, 1);
      }
    }

    return {
      transitDates: transitDates,
      transitBeginsDate: transitDates[0],
      expectedDeliveryStartDate: expectedDeliveryStartDate,
      expectedDeliveryEndDate: expectedDeliveryEndDate,
      expectedDeliveryDate: range.isRange ? null : expectedDeliveryEndDate,
      skippedDays: skippedDays
    };
  }

  function calculateEstimate(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError("Estimate input is required.");
    }

    var orderDate = input.orderDate;
    var productionDays = normalizeProductionDays(input.productionDays);
    var domain = input.domain;
    var shippingMethod = input.shippingMethod;
    var shipmentTiming = normalizeShipmentTiming(input.shipmentTiming);

    if (!domain) {
      throw new TypeError("Domain is required.");
    }
    if (!shippingMethod) {
      throw new TypeError("Shipping method is required.");
    }

    dateUtils.parseIsoDate(orderDate);

    var transitRange = normalizeTransitRange(shippingMethod);
    var production = calculateProduction(orderDate, productionDays);
    var pickup = calculatePickup(production.queueForShipmentDate, shipmentTiming.id);
    var transit = calculateTransit(pickup.pickupDate, transitRange, domain, shippingMethod);

    return {
      orderDate: orderDate,
      domainId: domain.id,
      domainLabel: domain.label,
      shippingMethodId: shippingMethod.id,
      shippingMethodLabel: shippingMethod.label,
      productionDays: productionDays,
      shipmentTiming: shipmentTiming.id,
      shipmentTimingLabel: shipmentTiming.label,
      shipmentTimingAssumption: shipmentTiming.assumption,
      transitRange: transitRange,
      productionStartDate: production.productionStartDate,
      productionDates: production.productionDates,
      queueForShipmentDate: production.queueForShipmentDate,
      pickupDate: pickup.pickupDate,
      pickupType: pickup.pickupType,
      transitBeginsDate: transit.transitBeginsDate,
      transitDates: transit.transitDates,
      expectedDeliveryStartDate: transit.expectedDeliveryStartDate,
      expectedDeliveryEndDate: transit.expectedDeliveryEndDate,
      expectedDeliveryDate: transit.expectedDeliveryDate,
      skippedDays: production.skippedDays.concat(pickup.skippedDays, transit.skippedDays)
    };
  }

  return {
    SHIPMENT_TIMING_CHOICES: SHIPMENT_TIMING_CHOICES,
    calculateEstimate: calculateEstimate,
    calculatePickup: calculatePickup,
    calculateProduction: calculateProduction,
    calculateTransit: calculateTransit,
    domainSkipsUsTransitHolidays: domainSkipsUsTransitHolidays,
    methodCountsSaturdayTransit: methodCountsSaturdayTransit,
    normalizeProductionDays: normalizeProductionDays,
    normalizeShipmentTiming: normalizeShipmentTiming,
    normalizeTransitRange: normalizeTransitRange,
    pickupSkipReason: pickupSkipReason,
    productionSkipReason: productionSkipReason,
    transitSkipReason: transitSkipReason
  };
});
