(function () {
  "use strict";

  var counterElements = document.querySelectorAll("[data-visitor-count]");

  if (counterElements.length === 0) {
    return;
  }

  function setCounterValue(value) {
    counterElements.forEach(function (element) {
      element.textContent = value;
    });
  }

  var hourBucket = new Date().toISOString().slice(0, 13);
  var counterUrl = "visitor-count.json?v=" + encodeURIComponent(hourBucket);

  fetch(counterUrl, {
    cache: "no-store",
    credentials: "same-origin"
  })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Visitor counter request failed with HTTP " + response.status);
      }

      return response.json();
    })
    .then(function (data) {
      var count = data && data.count;

      if (
        (typeof count !== "string" && typeof count !== "number") ||
        String(count).trim() === ""
      ) {
        throw new Error("visitor-count.json does not contain a valid count");
      }

      setCounterValue(String(count));
    })
    .catch(function (error) {
      console.warn("Could not refresh the local visitor count:", error);
    });
})();

