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
      label: "O",
      accessibleLabel: "Order placed"
    });

    estimate.productionDates.forEach(function (date) {
      pushMarker(markers, date, {
        type: "production",
        label: "P",
        accessibleLabel: "Production"
      });
    });

    estimate.transitDates.forEach(function (date) {
      pushMarker(markers, date, {
        type: "transit",
        label: "T",
        accessibleLabel: "Transit"
      });
    });

    if (estimate.expectedDeliveryDate) {
      pushMarker(markers, estimate.expectedDeliveryDate, {
        type: "delivery",
        label: "E",
        accessibleLabel: "Expected delivery"
      });
    } else {
      pushMarker(markers, estimate.expectedDeliveryStartDate, {
        type: "delivery",
        label: "E",
        accessibleLabel: "Expected delivery range begins"
      });
      pushMarker(markers, estimate.expectedDeliveryEndDate, {
        type: "delivery",
        label: "E",
        accessibleLabel: "Expected delivery range ends"
      });
    }

    return markers;
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

  function createTag(documentRef, marker) {
    var tag = documentRef.createElement("span");
    tag.className = "tag tag-" + marker.type;
    tag.textContent = marker.label;
    tag.setAttribute("aria-label", marker.accessibleLabel);
    return tag;
  }

  function holidayMessage(skippedItems) {
    var stages = skippedItems.map(function (item) {
      return item.stage;
    });
    var uniqueStages = Array.from(new Set(stages));
    var holiday = skippedItems[0].reason.holiday;
    var stageText = uniqueStages.join(" and ");
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
      var tags = documentRef.createElement("div");
      var markers = markerMap[isoDate] || [];
      var skippedItems = skippedDayMap[isoDate];

      day.setAttribute("data-date", isoDate);
      if (dateUtils.isWeekend(isoDate)) {
        day.classList.add("is-weekend");
      }

      number.className = "day-number";
      number.textContent = String(dayNumber);
      tags.className = "day-tags";

      markers.forEach(function (marker) {
        tags.appendChild(createTag(documentRef, marker));
      });

      day.appendChild(number);
      day.appendChild(tags);

      if (isoDate === container._queueForShipmentDate) {
        var queue = documentRef.createElement("span");
        queue.className = "queue-note";
        queue.textContent = "Queue";
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
    monthSequence: monthSequence,
    renderCalendar: renderCalendar
  };
});
