(function (root, factory) {
  var dateUtils = root.TurnaroundDateUtils;
  var estimator = root.TurnaroundEstimator;
  var calendar = root.TurnaroundCalendar;
  var config = root.TurnaroundDomainConfig;

  if (!dateUtils && typeof require === "function") {
    dateUtils = require("./date-utils");
  }
  if (!estimator && typeof require === "function") {
    estimator = require("./estimator");
  }
  if (!calendar && typeof require === "function") {
    calendar = require("./calendar");
  }
  if (!config && typeof require === "function") {
    config = require("./domain-config");
  }

  var api = factory(dateUtils, estimator, calendar, config);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TurnaroundApp = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      api.initBrowserApp(document);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (dateUtils, estimator, calendar, config) {
  "use strict";

  function findDomain(appConfig, domainId) {
    return appConfig.domains.find(function (domain) {
      return domain.id === domainId;
    }) || null;
  }

  function findShippingMethod(domain, methodId) {
    if (!domain) {
      return null;
    }

    return domain.shippingMethods.find(function (method) {
      return method.id === methodId;
    }) || null;
  }

  function getDomainChoices(appConfig) {
    return appConfig.domains.map(function (domain) {
      return { value: domain.id, label: domain.label };
    });
  }

  function getShippingMethodChoices(appConfig, domainId) {
    var domain = findDomain(appConfig, domainId);
    if (!domain) {
      return [];
    }

    return domain.shippingMethods.map(function (method) {
      return { value: method.id, label: method.label };
    });
  }

  function replaceSelectOptions(documentRef, select, choices, preferredValue) {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }

    choices.forEach(function (choice) {
      var option = documentRef.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      select.appendChild(option);
    });

    if (choices.some(function (choice) { return choice.value === preferredValue; })) {
      select.value = preferredValue;
    } else if (choices.length) {
      select.value = choices[0].value;
    }

    select.disabled = choices.length === 0;
  }

  function bindFormEvents(elements, callbacks) {
    elements.domainSelect.addEventListener("change", function () {
      callbacks.onDomainChange();
      callbacks.onRecalculate();
    });

    elements.orderDateInput.addEventListener("input", callbacks.onRecalculate);
    elements.orderDateInput.addEventListener("change", callbacks.onRecalculate);
    elements.productionDaysInput.addEventListener("input", callbacks.onRecalculate);
    elements.productionDaysInput.addEventListener("change", callbacks.onRecalculate);
    elements.shippingMethodSelect.addEventListener("change", callbacks.onRecalculate);
  }

  function formatLongDisplayDate(isoDate) {
    var parts = dateUtils.parseIsoDate(isoDate);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  }

  function formatEstimateHeading(estimate) {
    if (estimate.expectedDeliveryDate) {
      return formatLongDisplayDate(estimate.expectedDeliveryDate);
    }

    return formatLongDisplayDate(estimate.expectedDeliveryStartDate) +
      " - " +
      formatLongDisplayDate(estimate.expectedDeliveryEndDate);
  }

  function formatEstimateDetail(estimate) {
    return [
      "Domain: " + estimate.domainLabel,
      "Method: " + estimate.shippingMethodLabel,
      "Queue for Shipment: " + formatLongDisplayDate(estimate.queueForShipmentDate) + " (final production day)"
    ].join(" | ");
  }

  function setProductionDaysError(elements, message) {
    if (!elements.productionDaysError) {
      return;
    }

    if (message) {
      elements.productionDaysInput.setAttribute("aria-invalid", "true");
      elements.productionDaysError.hidden = false;
      elements.productionDaysError.textContent = message;
      return;
    }

    elements.productionDaysInput.removeAttribute("aria-invalid");
    elements.productionDaysError.hidden = true;
    elements.productionDaysError.textContent = "";
  }

  function readEstimateInput(elements, appConfig) {
    var domain = findDomain(appConfig, elements.domainSelect.value);
    var shippingMethod = findShippingMethod(domain, elements.shippingMethodSelect.value);

    return {
      orderDate: elements.orderDateInput.value,
      productionDays: elements.productionDaysInput.value,
      domain: domain,
      shippingMethod: shippingMethod
    };
  }

  function createBrowserController(documentRef, appConfig) {
    var elements = {
      domainSelect: documentRef.getElementById("domain"),
      orderDateInput: documentRef.getElementById("order-date"),
      productionDaysInput: documentRef.getElementById("production-days"),
      productionDaysError: documentRef.getElementById("production-days-error"),
      shippingMethodSelect: documentRef.getElementById("shipping-method"),
      resultPanel: documentRef.querySelector(".result-panel"),
      resultHeading: documentRef.getElementById("result-heading"),
      resultDetail: documentRef.getElementById("result-detail"),
      configNote: documentRef.getElementById("config-note"),
      calendarRegion: documentRef.getElementById("calendar")
    };

    function populateDomains() {
      replaceSelectOptions(documentRef, elements.domainSelect, getDomainChoices(appConfig));
    }

    function populateShippingMethods() {
      replaceSelectOptions(
        documentRef,
        elements.shippingMethodSelect,
        getShippingMethodChoices(appConfig, elements.domainSelect.value),
        elements.shippingMethodSelect.value
      );
    }

    function showConfigNote() {
      if (!appConfig.metadata || appConfig.metadata.recoveredFromReferenceFiles) {
        elements.configNote.hidden = true;
        return;
      }

      elements.configNote.hidden = false;
      elements.configNote.textContent = appConfig.metadata.note;
    }

    function showError(error) {
      elements.resultPanel.classList.add("is-error");
      elements.resultHeading.textContent = "Unable to estimate";
      elements.resultDetail.textContent = error.message;
      setProductionDaysError(elements, /^Production days/.test(error.message) ? error.message : "");
      calendar.renderCalendar(elements.calendarRegion, null);
    }

    function recalculate() {
      try {
        var estimate = estimator.calculateEstimate(readEstimateInput(elements, appConfig));
        elements.resultPanel.classList.remove("is-error");
        setProductionDaysError(elements, "");
        elements.resultHeading.textContent = formatEstimateHeading(estimate);
        elements.resultDetail.textContent = formatEstimateDetail(estimate);
        calendar.renderCalendar(elements.calendarRegion, estimate);
      } catch (error) {
        showError(error);
      }
    }

    function init() {
      populateDomains();
      populateShippingMethods();
      showConfigNote();

      if (!elements.orderDateInput.value) {
        elements.orderDateInput.value = dateUtils.todayIsoLocal();
      }

      bindFormEvents(elements, {
        onDomainChange: populateShippingMethods,
        onRecalculate: recalculate
      });

      recalculate();
    }

    return {
      init: init,
      populateShippingMethods: populateShippingMethods,
      recalculate: recalculate
    };
  }

  function initBrowserApp(documentRef) {
    createBrowserController(documentRef, config).init();
  }

  return {
    bindFormEvents: bindFormEvents,
    createBrowserController: createBrowserController,
    findDomain: findDomain,
    findShippingMethod: findShippingMethod,
    formatEstimateDetail: formatEstimateDetail,
    formatEstimateHeading: formatEstimateHeading,
    formatLongDisplayDate: formatLongDisplayDate,
    getDomainChoices: getDomainChoices,
    getShippingMethodChoices: getShippingMethodChoices,
    initBrowserApp: initBrowserApp,
    readEstimateInput: readEstimateInput,
    setProductionDaysError: setProductionDaysError,
    replaceSelectOptions: replaceSelectOptions
  };
});
