(function (root, factory) {
  var dateUtils = root.TurnaroundDateUtils;
  if (!dateUtils && typeof require === "function") {
    dateUtils = require("./date-utils");
  }

  var api = factory(dateUtils);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TurnaroundCalendar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dateUtils) {
  "use strict";

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function pushMarker(map, date, marker) {
    if (!map[date]) {
      map[date] = [];
    }
    map[date].push(marker);
  }

  function buildMarkerMap(estimate) {
    var markers = {};

    pushMarker(markers, estimate.orderDate, {
      type: "order",
      label: "Order placed",
      accessibleLabel: "Order placed"
    });

    estimate.productionDates.forEach(function (date, index) {
      var isFirstProductionDay = index === 0;
      var isFinalProductionDay = date === estimate.queueForShipmentDate;
      pushMarker(markers, date, {
        type: "production",
        label: isFirstProductionDay || isFinalProductionDay ? "Production" : "",
        accessibleLabel: date === estimate.queueForShipmentDate ? "Production, final production day, queues for shipment" : "Production"
      });
    });

    estimate.transitDates.forEach(function (date, index) {
      pushMarker(markers, date, {
        type: "transit",
        label: index === 0 ? "Transit 1" : String(index + 1),
        accessibleLabel: "Transit day " + (index + 1)
      });
    });

    if (estimate.expectedDeliveryDate) {
      pushMarker(markers, estimate.expectedDeliveryDate, {
        type: "delivery",
        label: "Expected delivery",
        accessibleLabel: "Expected delivery"
      });
    } else {
      dateUtils.eachDateInclusive(estimate.expectedDeliveryStartDate, estimate.expectedDeliveryEndDate).forEach(function (date) {
        var isStart = date === estimate.expectedDeliveryStartDate;
        var isEnd = date === estimate.expectedDeliveryEndDate;
        pushMarker(markers, date, {
          type: "delivery",
          label: isStart ? "Earliest delivery" : isEnd ? "Latest delivery" : "",
          accessibleLabel: isStart ? "Expected delivery range begins" : isEnd ? "Expected delivery range ends" : "Expected delivery range",
          rangePosition: isStart ? "start" : isEnd ? "end" : "inside"
        });
      });
    }

    return markers;
  }

  function summarizeDateMarkers(markers) {
    var priority = ["delivery", "order", "production", "transit"];
    var activeTypes = markers.map(function (marker) {
      return marker.type;
    });
    var primaryMarker = priority.map(function (type) {
      return markers.find(function (marker) {
        return marker.type === type;
      });
    }).find(Boolean);

    return {
      activeTypes: activeTypes,
      primaryLabel: primaryMarker ? primaryMarker.label : "",
      shortLabel: primaryMarker ? shortStatusLabel(primaryMarker.label) : "",
      accessibleLabel: markers.map(function (marker) {
        return marker.accessibleLabel;
      }).join(", ")
    };
  }

  function shortStatusLabel(label) {
    if (label === "Order placed") {
      return "Order";
    }
    if (label === "Production") {
      return "Prod";
    }
    if (label === "Expected delivery") {
      return "Expected";
    }
    if (label === "Earliest delivery") {
      return "Earliest";
    }
    if (label === "Latest delivery") {
      return "Latest";
    }
    return label;
  }

  function buildSkippedDayMap(estimate) {
    var map = {};

    estimate.skippedDays.forEach(function (skipped) {
      if (skipped.reason.type !== "holiday") {
        return;
      }

      if (!map[skipped.date]) {
        map[skipped.date] = [];
      }

      map[skipped.date].push(skipped);
    });

    return map;
  }

  function monthSequence(startIsoDate, endIsoDate) {
    var start = dateUtils.parseIsoDate(startIsoDate);
    var end = dateUtils.parseIsoDate(endIsoDate);
    var months = [];
    var year = start.year;
    var month = start.month;

    while (year < end.year || (year === end.year && month <= end.month)) {
      months.push({ year: year, month: month });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return months;
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function holidayMessage(skippedItems) {
    var stages = skippedItems.map(function (item) {
      return item.stage;
    });
    var uniqueStages = Array.from(new Set(stages));
    var holiday = skippedItems[0].reason.holiday;
    var stageText = uniqueStages.length > 1 ? "production and transit" : uniqueStages[0];
    return skippedItems[0].reason.holidayName + " skipped " + stageText + ". Observed date: " + holiday.observedDate + ".";
  }

  function renderMonth(container, monthInfo, markerMap, skippedDayMap) {
    var documentRef = container.ownerDocument;
    var section = documentRef.createElement("section");
    var heading = documentRef.createElement("h3");
    var grid = documentRef.createElement("div");
    var firstDate = dateUtils.startOfMonth(monthInfo.year, monthInfo.month);
    var leadingDays = dateUtils.dayOfWeek(firstDate);
    var daysInMonth = dateUtils.daysInMonth(monthInfo.year, monthInfo.month);
    var totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

    section.className = "month";
    heading.textContent = dateUtils.monthLabel(monthInfo.year, monthInfo.month);
    grid.className = "calendar-grid";

    WEEKDAYS.forEach(function (weekday) {
      var weekdayNode = documentRef.createElement("div");
      weekdayNode.className = "weekday";
      weekdayNode.textContent = weekday;
      grid.appendChild(weekdayNode);
    });

    for (var cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
      var dayNumber = cellIndex - leadingDays + 1;
      var day = documentRef.createElement("div");
      day.className = "day";

      if (dayNumber < 1 || dayNumber > daysInMonth) {
        day.classList.add("is-outside");
        grid.appendChild(day);
        continue;
      }

      var isoDate = dateUtils.formatIsoDate({
        year: monthInfo.year,
        month: monthInfo.month,
        day: dayNumber
      });
      var number = documentRef.createElement("span");
      var primaryLabel = documentRef.createElement("span");
      var markers = markerMap[isoDate] || [];
      var skippedItems = skippedDayMap[isoDate];
      var markerSummary = markers.length ? summarizeDateMarkers(markers) : null;

      day.setAttribute("data-date", isoDate);
      if (dateUtils.isWeekend(isoDate)) {
        day.classList.add("is-weekend");
      }
      if (skippedItems && skippedItems.length) {
        day.classList.add("is-skipped-holiday");
      }

      number.className = "day-number";
      number.textContent = String(dayNumber);

      day.appendChild(number);
      if (markerSummary) {
        markerSummary.activeTypes.forEach(function (type) {
          day.classList.add("state-" + type);
        });
        markers.forEach(function (marker) {
          if (marker.type === "delivery" && marker.rangePosition) {
            day.classList.add("delivery-range-" + marker.rangePosition);
          }
        });
        day.setAttribute("aria-label", isoDate + ": " + markerSummary.accessibleLabel);
        if (markerSummary.primaryLabel) {
          primaryLabel.className = "day-primary-label";
          primaryLabel.textContent = markerSummary.primaryLabel;
          primaryLabel.setAttribute("data-short-label", markerSummary.shortLabel);
          day.appendChild(primaryLabel);
        }
      }

      if (isoDate === container._queueForShipmentDate) {
        var queue = documentRef.createElement("span");
        queue.className = "queue-note";
        queue.textContent = "Queues for shipment";
        queue.setAttribute("data-short-label", "Queues");
        day.appendChild(queue);
      }

      if (skippedItems && skippedItems.length) {
        var message = holidayMessage(skippedItems);
        var button = documentRef.createElement("button");
        button.type = "button";
        button.className = "info-button";
        button.textContent = "i";
        button.title = message;
        button.setAttribute("data-tooltip", message);
        button.setAttribute("aria-label", message);
        day.appendChild(button);
      }

      grid.appendChild(day);
    }

    section.appendChild(heading);
    section.appendChild(grid);
    container.appendChild(section);
  }

  function renderCalendar(container, estimate) {
    clearNode(container);

    if (!estimate) {
      return;
    }

    var markerMap = buildMarkerMap(estimate);
    var skippedDayMap = buildSkippedDayMap(estimate);
    var months = monthSequence(estimate.orderDate, estimate.expectedDeliveryEndDate);

    container._queueForShipmentDate = estimate.queueForShipmentDate;
    months.forEach(function (monthInfo) {
      renderMonth(container, monthInfo, markerMap, skippedDayMap);
    });
  }

  return {
    buildMarkerMap: buildMarkerMap,
    buildSkippedDayMap: buildSkippedDayMap,
    holidayMessage: holidayMessage,
    monthSequence: monthSequence,
    renderCalendar: renderCalendar,
    shortStatusLabel: shortStatusLabel,
    summarizeDateMarkers: summarizeDateMarkers
  };
});
