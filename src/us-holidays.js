(function (root, factory) {
  var dateUtils = root.TurnaroundDateUtils;
  if (!dateUtils && typeof require === "function") {
    dateUtils = require("./date-utils");
  }

  var api = factory(dateUtils);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.TurnaroundHolidays = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dateUtils) {
  "use strict";

  function fixedDate(year, month, day) {
    return dateUtils.formatIsoDate({ year: year, month: month, day: day });
  }

  function observedFixedHoliday(year, month, day, name) {
    var actualDate = fixedDate(year, month, day);
    var weekday = dateUtils.dayOfWeek(actualDate);
    var observedDate = actualDate;

    if (weekday === 6) {
      observedDate = dateUtils.addCalendarDays(actualDate, -1);
    } else if (weekday === 0) {
      observedDate = dateUtils.addCalendarDays(actualDate, 1);
    }

    return {
      name: name,
      actualDate: actualDate,
      observedDate: observedDate,
      observed: observedDate !== actualDate
    };
  }

  function nthWeekdayOfMonth(year, month, weekday, occurrence, name) {
    var date = fixedDate(year, month, 1);
    var offset = (weekday - dateUtils.dayOfWeek(date) + 7) % 7;
    var day = 1 + offset + (occurrence - 1) * 7;
    var isoDate = fixedDate(year, month, day);
    return {
      name: name,
      actualDate: isoDate,
      observedDate: isoDate,
      observed: false
    };
  }

  function lastWeekdayOfMonth(year, month, weekday, name) {
    var day = dateUtils.daysInMonth(year, month);
    var date = fixedDate(year, month, day);
    var offset = (dateUtils.dayOfWeek(date) - weekday + 7) % 7;
    var isoDate = fixedDate(year, month, day - offset);
    return {
      name: name,
      actualDate: isoDate,
      observedDate: isoDate,
      observed: false
    };
  }

  function federalHolidaysForYear(year) {
    var holidays = [
      observedFixedHoliday(year, 1, 1, "New Year's Day"),
      nthWeekdayOfMonth(year, 1, 1, 3, "Martin Luther King Jr. Day"),
      nthWeekdayOfMonth(year, 2, 1, 3, "Washington's Birthday"),
      lastWeekdayOfMonth(year, 5, 1, "Memorial Day"),
      observedFixedHoliday(year, 6, 19, "Juneteenth National Independence Day"),
      observedFixedHoliday(year, 7, 4, "Independence Day"),
      nthWeekdayOfMonth(year, 9, 1, 1, "Labor Day"),
      nthWeekdayOfMonth(year, 10, 1, 2, "Columbus Day"),
      observedFixedHoliday(year, 11, 11, "Veterans Day"),
      nthWeekdayOfMonth(year, 11, 4, 4, "Thanksgiving Day"),
      observedFixedHoliday(year, 12, 25, "Christmas Day")
    ];

    return holidays;
  }

  function observedFederalHolidayMapForYears(years) {
    var map = {};

    years.forEach(function (year) {
      federalHolidaysForYear(year).forEach(function (holiday) {
        map[holiday.observedDate] = holiday;
      });
    });

    return map;
  }

  function getObservedFederalHoliday(isoDate) {
    var parts = dateUtils.parseIsoDate(isoDate);
    var holidays = observedFederalHolidayMapForYears([
      parts.year - 1,
      parts.year,
      parts.year + 1
    ]);

    return holidays[isoDate] || null;
  }

  function isObservedFederalHoliday(isoDate) {
    return Boolean(getObservedFederalHoliday(isoDate));
  }

  function describeObservedFederalHoliday(holiday) {
    if (!holiday) {
      return "";
    }

    if (holiday.observed) {
      return holiday.name + " observed for " + holiday.actualDate;
    }

    return holiday.name;
  }

  return {
    describeObservedFederalHoliday: describeObservedFederalHoliday,
    federalHolidaysForYear: federalHolidaysForYear,
    getObservedFederalHoliday: getObservedFederalHoliday,
    isObservedFederalHoliday: isObservedFederalHoliday
  };
});
