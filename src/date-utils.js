(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TurnaroundDateUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function parseIsoDate(value) {
    if (typeof value !== "string") {
      throw new TypeError("Date must be a YYYY-MM-DD string.");
    }

    var match = ISO_DATE.exec(value);
    if (!match) {
      throw new RangeError("Date must use YYYY-MM-DD format.");
    }

    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var utcDate = new Date(Date.UTC(year, month - 1, day));

    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day
    ) {
      throw new RangeError("Date is not a valid calendar day.");
    }

    return { year: year, month: month, day: day };
  }

  function formatIsoDate(parts) {
    return [parts.year, pad2(parts.month), pad2(parts.day)].join("-");
  }

  function toUtcDate(isoDate) {
    var parts = parseIsoDate(isoDate);
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  }

  function fromUtcDate(date) {
    return formatIsoDate({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    });
  }

  function addCalendarDays(isoDate, days) {
    var date = toUtcDate(isoDate);
    date.setUTCDate(date.getUTCDate() + days);
    return fromUtcDate(date);
  }

  function compareIsoDates(left, right) {
    parseIsoDate(left);
    parseIsoDate(right);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function dayOfWeek(isoDate) {
    return toUtcDate(isoDate).getUTCDay();
  }

  function isWeekend(isoDate) {
    var day = dayOfWeek(isoDate);
    return day === 0 || day === 6;
  }

  function isSaturday(isoDate) {
    return dayOfWeek(isoDate) === 6;
  }

  function isSunday(isoDate) {
    return dayOfWeek(isoDate) === 0;
  }

  function startOfMonth(year, month) {
    return formatIsoDate({ year: year, month: month, day: 1 });
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function eachDateInclusive(startIsoDate, endIsoDate) {
    if (compareIsoDates(startIsoDate, endIsoDate) > 0) {
      return [];
    }

    var dates = [];
    var cursor = startIsoDate;
    while (compareIsoDates(cursor, endIsoDate) <= 0) {
      dates.push(cursor);
      cursor = addCalendarDays(cursor, 1);
    }
    return dates;
  }

  function formatDisplayDate(isoDate) {
    var parts = parseIsoDate(isoDate);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  }

  function monthLabel(year, month) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  function todayIsoLocal() {
    var now = new Date();
    return formatIsoDate({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    });
  }

  return {
    addCalendarDays: addCalendarDays,
    compareIsoDates: compareIsoDates,
    dayOfWeek: dayOfWeek,
    daysInMonth: daysInMonth,
    eachDateInclusive: eachDateInclusive,
    formatDisplayDate: formatDisplayDate,
    formatIsoDate: formatIsoDate,
    isSaturday: isSaturday,
    isSunday: isSunday,
    isWeekend: isWeekend,
    monthLabel: monthLabel,
    parseIsoDate: parseIsoDate,
    startOfMonth: startOfMonth,
    todayIsoLocal: todayIsoLocal
  };
});
