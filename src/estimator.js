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
    var targetDays = normalizePositiveWholeNumber(productionDays, "Production days");
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

  function calculateTransit(queueForShipmentDate, transitRange, domain, shippingMethod) {
    dateUtils.parseIsoDate(queueForShipmentDate);
    var range = transitRange ? normalizeTransitRange({ transitDays: transitRange }) : normalizeTransitRange(shippingMethod);
    var options = {
      countsSaturdayTransit: methodCountsSaturdayTransit(domain, shippingMethod),
      skipsUsTransitHolidays: domainSkipsUsTransitHolidays(domain)
    };
    var cursor = dateUtils.addCalendarDays(queueForShipmentDate, 1);
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
    var productionDays = normalizePositiveWholeNumber(input.productionDays, "Production days");
    var domain = input.domain;
    var shippingMethod = input.shippingMethod;

    if (!domain) {
      throw new TypeError("Domain is required.");
    }
    if (!shippingMethod) {
      throw new TypeError("Shipping method is required.");
    }

    dateUtils.parseIsoDate(orderDate);

    var transitRange = normalizeTransitRange(shippingMethod);
    var production = calculateProduction(orderDate, productionDays);
    var transit = calculateTransit(production.queueForShipmentDate, transitRange, domain, shippingMethod);

    return {
      orderDate: orderDate,
      domainId: domain.id,
      domainLabel: domain.label,
      shippingMethodId: shippingMethod.id,
      shippingMethodLabel: shippingMethod.label,
      productionDays: productionDays,
      transitRange: transitRange,
      productionStartDate: production.productionStartDate,
      productionDates: production.productionDates,
      queueForShipmentDate: production.queueForShipmentDate,
      transitDates: transit.transitDates,
      expectedDeliveryStartDate: transit.expectedDeliveryStartDate,
      expectedDeliveryEndDate: transit.expectedDeliveryEndDate,
      expectedDeliveryDate: transit.expectedDeliveryDate,
      skippedDays: production.skippedDays.concat(transit.skippedDays)
    };
  }

  return {
    calculateEstimate: calculateEstimate,
    calculateProduction: calculateProduction,
    calculateTransit: calculateTransit,
    domainSkipsUsTransitHolidays: domainSkipsUsTransitHolidays,
    methodCountsSaturdayTransit: methodCountsSaturdayTransit,
    normalizeTransitRange: normalizeTransitRange,
    productionSkipReason: productionSkipReason,
    transitSkipReason: transitSkipReason
  };
});
