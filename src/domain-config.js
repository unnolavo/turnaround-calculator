(function (root, factory) {
  var config = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }
  root.TurnaroundDomainConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var INTERNATIONAL_METHOD_LABELS = [
    "Slow, no tracking",
    "Standard with tracking",
    "Expedited with tracking"
  ];

  function range(min, max) {
    return { min: min, max: max };
  }

  function method(id, label, transitDays, countsSaturdayTransit) {
    return {
      id: id,
      label: label,
      transitDays: typeof transitDays === "number" ? transitDays : range(transitDays.min, transitDays.max),
      countsSaturdayTransit: Boolean(countsSaturdayTransit)
    };
  }

  function internationalMethod(methodKey, transitDays) {
    var labelsByKey = {
      slow: INTERNATIONAL_METHOD_LABELS[0],
      standard: INTERNATIONAL_METHOD_LABELS[1],
      expedited: INTERNATIONAL_METHOD_LABELS[2]
    };

    return method(methodKey, labelsByKey[methodKey], transitDays, false);
  }

  function cloneMethod(sourceMethod) {
    return method(
      sourceMethod.id,
      sourceMethod.label,
      sourceMethod.transitDays,
      sourceMethod.countsSaturdayTransit
    );
  }

  function makeInternationalDomain(id, label, durations) {
    var methods = [];

    if (durations.slow) {
      methods.push(internationalMethod("slow", durations.slow));
    }
    if (durations.standard) {
      methods.push(internationalMethod("standard", durations.standard));
    }
    if (durations.expedited) {
      methods.push(internationalMethod("expedited", durations.expedited));
    }

    return {
      id: id,
      label: label,
      transitHolidayCalendar: "none",
      shippingMethods: methods
    };
  }

  var usDomain = {
    id: "us",
    label: "US",
    transitHolidayCalendar: "us-federal",
    shippingMethods: [
      method("standard", "Standard Shipping", range(4, 7), false),
      method("standard-saturday", "Standard Shipping (with Saturday Delivery)", range(4, 7), true),
      method("premium", "Premium Shipping", 2, false),
      method("two-three-day", "2-3 Day Shipping", range(2, 3), false),
      method("express", "Express Shipping", 1, false)
    ]
  };

  var ukDomain = makeInternationalDomain("uk", "UK", {
    slow: range(9, 18),
    standard: range(5, 8),
    expedited: range(2, 4)
  });

  var domains = [
    usDomain,
    ukDomain,
    makeInternationalDomain("ca", "CA", {
      slow: range(9, 18),
      standard: range(5, 8),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("au", "AU", {
      slow: range(10, 18),
      standard: range(5, 9),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("nz", "NZ", {
      slow: range(11, 20),
      standard: range(7, 11),
      expedited: range(4, 6)
    }),
    makeInternationalDomain("jp", "JP", {
      standard: range(5, 9),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("br", "BR", {
      standard: range(7, 12),
      expedited: range(4, 6)
    }),
    makeInternationalDomain("pt", "PT", {
      slow: range(9, 18),
      standard: range(6, 8),
      expedited: range(2, 5)
    }),
    makeInternationalDomain("fr", "FR", {
      slow: range(9, 18),
      standard: range(7, 10),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("de", "DE", {
      slow: range(9, 18),
      standard: range(7, 10),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("it", "IT", {
      slow: range(9, 18),
      standard: range(7, 10),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("ch", "CH", {
      slow: range(9, 18),
      standard: range(7, 10),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("nl", "NL", {
      slow: range(9, 18),
      standard: range(5, 9),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("be", "BE", {
      slow: range(9, 18),
      standard: range(5, 9),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("es", "ES", {
      slow: range(10, 18),
      standard: range(5, 10),
      expedited: range(3, 5)
    }),
    makeInternationalDomain("se", "SE", {
      slow: range(10, 18),
      standard: range(7, 10),
      expedited: range(3, 5)
    }),
    {
      id: "rest-of-europe",
      label: "Rest of Europe",
      transitHolidayCalendar: "none",
      shippingMethods: ukDomain.shippingMethods.map(cloneMethod)
    }
  ];

  function isPositiveWholeNumber(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isValidTransitDuration(transitDays) {
    if (typeof transitDays === "number") {
      return isPositiveWholeNumber(transitDays);
    }

    return Boolean(
      transitDays &&
      typeof transitDays === "object" &&
      isPositiveWholeNumber(transitDays.min) &&
      isPositiveWholeNumber(transitDays.max) &&
      transitDays.min <= transitDays.max
    );
  }

  function sameTransitDuration(left, right) {
    if (typeof left === "number" || typeof right === "number") {
      return left === right;
    }

    return left.min === right.min && left.max === right.max;
  }

  function validateConfiguration(config) {
    var errors = [];
    var allDomains = config && Array.isArray(config.domains) ? config.domains : [];
    var domainIds = {};
    var us = allDomains.find(function (domain) { return domain.id === "us"; });
    var restOfEurope = allDomains.find(function (domain) { return domain.id === "rest-of-europe"; });
    var uk = allDomains.find(function (domain) { return domain.id === "uk"; });

    allDomains.forEach(function (domain) {
      if (!domain.id || !domain.label) {
        errors.push("Every domain must have an id and label.");
      }
      if (domainIds[domain.id]) {
        errors.push("Duplicate domain id " + domain.id + ".");
      }
      domainIds[domain.id] = true;

      var methodIds = {};
      if (!Array.isArray(domain.shippingMethods) || domain.shippingMethods.length === 0) {
        errors.push(domain.id + " must have at least one shipping method.");
      }

      (domain.shippingMethods || []).forEach(function (shippingMethod) {
        if (!shippingMethod.id || !shippingMethod.label) {
          errors.push(domain.id + " has a method without an id or label.");
        }
        if (methodIds[shippingMethod.id]) {
          errors.push(domain.id + " has duplicate method id " + shippingMethod.id + ".");
        }
        methodIds[shippingMethod.id] = true;

        if (!isValidTransitDuration(shippingMethod.transitDays)) {
          errors.push(domain.id + " " + shippingMethod.id + " has invalid transitDays.");
        }
        if (shippingMethod.label.toLowerCase() === "n/a") {
          errors.push(domain.id + " exposes an n/a shipping method.");
        }
      });
    });

    if (!us || us.transitHolidayCalendar !== "us-federal") {
      errors.push("US domain must use the observed US federal holiday transit calendar.");
    }

    allDomains.filter(function (domain) { return domain.id !== "us"; }).forEach(function (domain) {
      if (domain.transitHolidayCalendar !== "none") {
        errors.push(domain.id + " must not use a transit holiday calendar.");
      }

      domain.shippingMethods.forEach(function (shippingMethod) {
        if (INTERNATIONAL_METHOD_LABELS.indexOf(shippingMethod.label) === -1) {
          errors.push(domain.id + " has an unapproved international method label.");
        }
      });
    });

    allDomains.forEach(function (domain) {
      domain.shippingMethods.forEach(function (shippingMethod) {
        var isApprovedSaturdayMethod =
          domain.id === "us" &&
          shippingMethod.label === "Standard Shipping (with Saturday Delivery)";

        if (shippingMethod.countsSaturdayTransit && !isApprovedSaturdayMethod) {
          errors.push(domain.id + " " + shippingMethod.id + " has unauthorized Saturday transit.");
        }
      });
    });

    if (uk && restOfEurope) {
      if (uk.shippingMethods.length !== restOfEurope.shippingMethods.length) {
        errors.push("Rest of Europe must have the same method count as UK.");
      }

      uk.shippingMethods.forEach(function (ukMethod, index) {
        var restMethod = restOfEurope.shippingMethods[index];
        if (
          !restMethod ||
          ukMethod.label !== restMethod.label ||
          !sameTransitDuration(ukMethod.transitDays, restMethod.transitDays)
        ) {
          errors.push("Rest of Europe must match UK method labels and durations.");
        }
      });
    } else {
      errors.push("UK and Rest of Europe domains are required.");
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  return {
    metadata: {
      recoveredFromReferenceFiles: true,
      internationalSource: "reference/estimated-shipping-times.png",
      internationalSourceDescription: "International shipping values transcribed from the supplied Estimated Shipping Times image.",
      usSourceDescription: "US shipping values and Saturday-delivery behavior confirmed directly by the project owner on 2026-08-04.",
      status: "Current values are considered accurate for this milestone and may be updated later.",
      businessDayMeaning: "bd means business days. All configured shipping durations are transit-day durations.",
      restOfEuropeNote: "Rest of Europe uses UK shipping times.",
      wrongDomainNote: "The source image states that if an order was placed on the wrong domain, it can take up to 30 calendar days. This is informational only and does not alter estimates."
    },
    approvedInternationalMethodLabels: INTERNATIONAL_METHOD_LABELS.slice(),
    domains: domains,
    validateConfiguration: validateConfiguration
  };
});
