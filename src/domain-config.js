(function (root, factory) {
  var config = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }
  root.TurnaroundDomainConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    metadata: {
      recoveredFromReferenceFiles: false,
      source: "No old application or committed reference files were present in the project folder.",
      note: "Replace these placeholder domains and methods with the employer-approved configuration before production handoff."
    },
    domains: [
      {
        id: "us-placeholder",
        label: "U.S. domain placeholder",
        transitHolidayCalendar: "us-federal",
        shippingMethods: [
          {
            id: "us-standard-placeholder",
            label: "U.S. standard placeholder (4-7 transit days)",
            transitDays: { min: 4, max: 7 },
            countsSaturdayTransit: false
          },
          {
            id: "us-saturday-placeholder",
            label: "U.S. Saturday-capable placeholder (2 transit days)",
            transitDays: 2,
            countsSaturdayTransit: true
          }
        ]
      },
      {
        id: "international-placeholder",
        label: "International domain placeholder",
        transitHolidayCalendar: "none",
        shippingMethods: [
          {
            id: "international-standard-placeholder",
            label: "International standard placeholder (6-10 transit days)",
            transitDays: { min: 6, max: 10 },
            countsSaturdayTransit: false
          }
        ]
      }
    ]
  };
});
