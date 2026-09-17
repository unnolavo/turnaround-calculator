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

  function getShipmentTimingChoices() {
    return estimator.SHIPMENT_TIMING_CHOICES.map(function (timing) {
      return { value: timing.id, label: timing.label };
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

  function clampProductionDaysValue(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return "";
    }
    return String(Math.min(20, Math.max(1, Math.trunc(number))));
  }

  function updateProductionQuickButtons(elements) {
    if (!elements.productionQuickButtons) {
      return;
    }

    elements.productionQuickButtons.forEach(function (button) {
      var active = button.getAttribute("data-production-days") === elements.productionDaysInput.value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function bindProductionQuickButtons(elements, callbacks) {
    if (!elements.productionQuickButtons) {
      return;
    }

    elements.productionQuickButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        elements.productionDaysInput.value = button.getAttribute("data-production-days");
        updateProductionQuickButtons(elements);
        callbacks.onRecalculate();
      });
    });
  }

  function bindFormEvents(elements, callbacks) {
    elements.domainSelect.addEventListener("change", function () {
      callbacks.onDomainChange();
      callbacks.onRecalculate();
    });

    elements.orderDateInput.addEventListener("input", callbacks.onRecalculate);
    elements.orderDateInput.addEventListener("change", callbacks.onRecalculate);
    elements.productionDaysInput.addEventListener("input", function () {
      updateProductionQuickButtons(elements);
      callbacks.onRecalculate();
    });
    elements.productionDaysInput.addEventListener("change", function () {
      elements.productionDaysInput.value = clampProductionDaysValue(elements.productionDaysInput.value);
      updateProductionQuickButtons(elements);
      callbacks.onRecalculate();
    });
    elements.shippingMethodSelect.addEventListener("change", callbacks.onRecalculate);
    elements.shipmentTimingSelect.addEventListener("change", callbacks.onRecalculate);
    bindProductionQuickButtons(elements, callbacks);
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

  function ordinalSuffix(day) {
    var mod100 = day % 100;
    if (mod100 >= 11 && mod100 <= 13) {
      return "th";
    }

    if (day % 10 === 1) {
      return "st";
    }
    if (day % 10 === 2) {
      return "nd";
    }
    if (day % 10 === 3) {
      return "rd";
    }
    return "th";
  }

  function formatOrdinalDate(isoDate) {
    var parts = dateUtils.parseIsoDate(isoDate);
    var date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    var weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
    var month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);

    return weekday + ", " + month + " " + parts.day + ordinalSuffix(parts.day);
  }

  function formatNumericDate(isoDate, dayFirst) {
    var parts = dateUtils.parseIsoDate(isoDate);
    if (dayFirst) {
      return parts.day + "/" + parts.month + "/" + parts.year;
    }
    return parts.month + "/" + parts.day + "/" + parts.year;
  }

  function formatEstimateHeading(estimate) {
    return formatEstimateRange(estimate, formatOrdinalDate);
  }

  function formatEstimateRange(estimate, formatter) {
    var start = estimate.expectedDeliveryDate || estimate.expectedDeliveryStartDate;
    var end = estimate.expectedDeliveryDate || estimate.expectedDeliveryEndDate;

    if (start === end) {
      return formatter(start);
    }

    return formatter(start) + " - " + formatter(end);
  }

  function formatCopyFormats(estimate) {
    var dayFirst = estimate.numericDateFormat === "dmy";
    return {
      written: formatEstimateHeading(estimate),
      numeric: formatEstimateRange(estimate, function (isoDate) {
        return formatNumericDate(isoDate, dayFirst);
      })
    };
  }

  function formatProductionRange(estimate) {
    var start = formatLongDisplayDate(estimate.productionStartDate);
    var end = formatLongDisplayDate(estimate.queueForShipmentDate);

    if (estimate.productionStartDate === estimate.queueForShipmentDate) {
      return start;
    }

    return start + " - " + end;
  }

  function formatEstimateDetail(estimate) {
    return [
      "Estimated delivery: " + formatEstimateHeading(estimate),
      "Production: " + formatProductionRange(estimate),
      "Queue for shipment: " + formatLongDisplayDate(estimate.queueForShipmentDate),
      "Transit begins: " + formatLongDisplayDate(estimate.transitBeginsDate),
      "Assumption: " + estimate.shipmentTimingAssumption,
      "Domain: " + estimate.domainLabel,
      "Method: " + estimate.shippingMethodLabel
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
      shippingMethod: shippingMethod,
      shipmentTiming: elements.shipmentTimingSelect.value
    };
  }

  function updateCopyFormats(elements, estimate) {
    var formats = formatCopyFormats(estimate);

    elements.copyFormats.hidden = false;
    elements.numericEstimateRow.hidden = false;
    elements.resultHeading.textContent = formats.written;
    elements.resultHeading.setAttribute("data-copy-value", formats.written);
    elements.copyNumeric.textContent = formats.numeric;
    elements.copyNumeric.setAttribute("data-copy-value", formats.numeric);
  }

  function resetCopyButton(button) {
    button.classList.remove("is-copied");
    button.textContent = "Copy";
  }

  function writeClipboardText(value, clipboard, documentRef) {
    var writer = clipboard && typeof clipboard.writeText === "function" ? clipboard : null;
    if (writer) {
      return writer.writeText(value);
    }

    if (!documentRef || !documentRef.body || typeof documentRef.execCommand !== "function") {
      return Promise.reject(new Error("Clipboard is not available."));
    }

    var textarea = documentRef.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.className = "sr-only";
    documentRef.body.appendChild(textarea);
    textarea.select();

    try {
      if (!documentRef.execCommand("copy")) {
        return Promise.reject(new Error("Copy command failed."));
      }
      return Promise.resolve();
    } finally {
      documentRef.body.removeChild(textarea);
    }
  }

  function handleCopyButton(button, value, clipboard, scheduleReset, documentRef) {
    return writeClipboardText(value, clipboard, documentRef).then(function () {
      button.classList.add("is-copied");
      button.textContent = "Copied";
      if (typeof scheduleReset === "function") {
        scheduleReset(function () {
          resetCopyButton(button);
        }, 1200);
      }
    });
  }

  function bindCopyButtons(elements) {
    if (!elements.copyButtons) {
      return;
    }

    elements.copyButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-copy-target");
        var valueNode = target ? elements.documentRef.getElementById(target) : null;
        var value = valueNode ? valueNode.getAttribute("data-copy-value") : "";

        handleCopyButton(button, value, typeof navigator !== "undefined" ? navigator.clipboard : null, setTimeout, elements.documentRef).catch(function () {
          button.textContent = "Unavailable";
        });
      });
    });
  }

  function createBrowserController(documentRef, appConfig) {
    var elements = {
      documentRef: documentRef,
      domainSelect: documentRef.getElementById("domain"),
      orderDateInput: documentRef.getElementById("order-date"),
      productionDaysInput: documentRef.getElementById("production-days"),
      productionQuickButtons: Array.from(documentRef.querySelectorAll("[data-production-days]")),
      productionDaysError: documentRef.getElementById("production-days-error"),
      shippingMethodSelect: documentRef.getElementById("shipping-method"),
      shipmentTimingSelect: documentRef.getElementById("shipment-timing"),
      resultPanel: documentRef.querySelector(".result-panel"),
      resultHeading: documentRef.getElementById("result-heading"),
      resultDetail: documentRef.getElementById("result-detail"),
      configNote: documentRef.getElementById("config-note"),
      copyFormats: documentRef.getElementById("copy-formats"),
      copyNumeric: documentRef.getElementById("copy-numeric"),
      numericEstimateRow: documentRef.getElementById("numeric-estimate-row"),
      copyButtons: Array.from(documentRef.querySelectorAll("[data-copy-target]")),
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

    function populateShipmentTiming() {
      replaceSelectOptions(
        documentRef,
        elements.shipmentTimingSelect,
        getShipmentTimingChoices(),
        elements.shipmentTimingSelect.value || "unknown"
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
      elements.resultHeading.removeAttribute("data-copy-value");
      elements.resultDetail.hidden = false;
      elements.resultDetail.textContent = error.message;
      elements.copyFormats.hidden = false;
      elements.numericEstimateRow.hidden = true;
      setProductionDaysError(elements, /^Production days/.test(error.message) ? error.message : "");
      calendar.renderCalendar(elements.calendarRegion, null);
    }

    function recalculate() {
      try {
        var estimateInput = readEstimateInput(elements, appConfig);
        var estimate = estimator.calculateEstimate(estimateInput);
        estimate.numericDateFormat = estimateInput.domain.numericDateFormat || "dmy";
        elements.resultPanel.classList.remove("is-error");
        setProductionDaysError(elements, "");
        updateProductionQuickButtons(elements);
        elements.resultDetail.hidden = true;
        elements.resultDetail.textContent = "";
        updateCopyFormats(elements, estimate);
        calendar.renderCalendar(elements.calendarRegion, estimate);
      } catch (error) {
        showError(error);
      }
    }

    function init() {
      populateDomains();
      populateShippingMethods();
      populateShipmentTiming();
      bindCopyButtons(elements);
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
      populateShipmentTiming: populateShipmentTiming,
      recalculate: recalculate
    };
  }

  function initBrowserApp(documentRef) {
    createBrowserController(documentRef, config).init();
  }

  return {
    bindCopyButtons: bindCopyButtons,
    bindFormEvents: bindFormEvents,
    bindProductionQuickButtons: bindProductionQuickButtons,
    clampProductionDaysValue: clampProductionDaysValue,
    createBrowserController: createBrowserController,
    findDomain: findDomain,
    findShippingMethod: findShippingMethod,
    formatCopyFormats: formatCopyFormats,
    formatEstimateDetail: formatEstimateDetail,
    formatEstimateHeading: formatEstimateHeading,
    formatLongDisplayDate: formatLongDisplayDate,
    formatNumericDate: formatNumericDate,
    formatOrdinalDate: formatOrdinalDate,
    formatProductionRange: formatProductionRange,
    getDomainChoices: getDomainChoices,
    getShipmentTimingChoices: getShipmentTimingChoices,
    getShippingMethodChoices: getShippingMethodChoices,
    handleCopyButton: handleCopyButton,
    initBrowserApp: initBrowserApp,
    ordinalSuffix: ordinalSuffix,
    readEstimateInput: readEstimateInput,
    setProductionDaysError: setProductionDaysError,
    replaceSelectOptions: replaceSelectOptions,
    updateCopyFormats: updateCopyFormats,
    writeClipboardText: writeClipboardText,
    updateProductionQuickButtons: updateProductionQuickButtons
  };
});