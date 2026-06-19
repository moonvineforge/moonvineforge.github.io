// GoatCounter-compatible local tracking client for Moonvine Forge.
// Endpoint contract: https://www.goatcounter.com/help/pixel
// The original GoatCounter count.js is ISC licensed.
;(function () {
  "use strict";

  window.goatcounter = window.goatcounter || {};
  var goatcounter = window.goatcounter;

  var script = document.querySelector("script[data-goatcounter]");

  if (script && script.dataset.goatcounterSettings) {
    try {
      var settings = JSON.parse(script.dataset.goatcounterSettings);

      Object.keys(settings).forEach(function (key) {
        if (
          [
            "no_onload",
            "no_events",
            "allow_local",
            "allow_frame",
            "path",
            "title",
            "referrer",
            "event"
          ].indexOf(key) > -1
        ) {
          window.goatcounter[key] = settings[key];
        }
      });
    } catch (error) {
      console.error("Invalid JSON in data-goatcounter-settings:", error);
    }
  }

  function isEmpty(value) {
    return (
      value === null ||
      value === undefined ||
      typeof value === "function"
    );
  }

  function isBot() {
    var currentWindow = window;
    var currentDocument = document;

    if (
      currentWindow.callPhantom ||
      currentWindow._phantom ||
      currentWindow.phantom
    ) {
      return 150;
    }

    if (currentWindow.__nightmare) {
      return 151;
    }

    if (
      currentDocument.__selenium_unwrapped ||
      currentDocument.__webdriver_evaluate ||
      currentDocument.__driver_evaluate
    ) {
      return 152;
    }

    if (navigator.webdriver) {
      return 153;
    }

    return 0;
  }

  function getPath() {
    var locationSource = location;
    var canonical = document.querySelector('link[rel="canonical"][href]');

    if (canonical) {
      var canonicalUrl = document.createElement("a");
      canonicalUrl.href = canonical.href;

      if (
        canonicalUrl.hostname.replace(/^www\./, "") ===
        location.hostname.replace(/^www\./, "")
      ) {
        locationSource = canonicalUrl;
      }
    }

    return locationSource.pathname + locationSource.search || "/";
  }

  function getEndpoint() {
    var endpointScript = document.querySelector("script[data-goatcounter]");

    if (endpointScript && endpointScript.dataset.goatcounter) {
      return endpointScript.dataset.goatcounter;
    }

    return window.goatcounter.endpoint;
  }

  function encodeData(data) {
    var pairs = [];

    Object.keys(data).forEach(function (key) {
      var value = data[key];

      if (
        value !== "" &&
        value !== null &&
        value !== undefined &&
        value !== false
      ) {
        pairs.push(
          encodeURIComponent(key) + "=" + encodeURIComponent(value)
        );
      }
    });

    return "?" + pairs.join("&");
  }

  function warn(message) {
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("goatcounter: " + message);
    }
  }

  function onLoad(callback) {
    if (document.body === null) {
      document.addEventListener("DOMContentLoaded", callback, false);
    } else {
      callback();
    }
  }

  window.goatcounter.get_data = function (variables) {
    var values = variables || {};
    var data = {
      p: values.path === undefined ? goatcounter.path : values.path,
      r: values.referrer === undefined ? goatcounter.referrer : values.referrer,
      t: values.title === undefined ? goatcounter.title : values.title,
      e: Boolean(values.event || goatcounter.event),
      s: window.screen.width,
      b: isBot(),
      q: location.search
    };

    var referrerCallback = typeof data.r === "function" ? data.r : null;
    var titleCallback = typeof data.t === "function" ? data.t : null;
    var pathCallback = typeof data.p === "function" ? data.p : null;

    if (isEmpty(data.r)) {
      data.r = document.referrer;
    }

    if (isEmpty(data.t)) {
      data.t = document.title;
    }

    if (isEmpty(data.p)) {
      data.p = getPath();
    }

    if (values.no_session) {
      data.ns =
        typeof values.no_session === "function"
          ? values.no_session(false)
          : values.no_session;
    }

    if (referrerCallback) {
      data.r = referrerCallback(data.r);
    }

    if (titleCallback) {
      data.t = titleCallback(data.t);
    }

    if (pathCallback) {
      data.p = pathCallback(data.p);
    }

    return data;
  };

  window.goatcounter.filter = function () {
    if (
      "visibilityState" in document &&
      document.visibilityState === "prerender"
    ) {
      return "visibilityState";
    }

    if (!goatcounter.allow_frame && location !== parent.location) {
      return "frame";
    }

    if (
      !goatcounter.allow_local &&
      location.hostname.match(
        /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$)/
      )
    ) {
      return "localhost";
    }

    if (!goatcounter.allow_local && location.protocol === "file:") {
      return "localfile";
    }

    try {
      if (localStorage.getItem("skipgc") === "t") {
        return "disabled with #toggle-goatcounter";
      }
    } catch (error) {
      // Storage may be disabled. Tracking can still continue without it.
    }

    return false;
  };

  window.goatcounter.url = function (variables) {
    var data = window.goatcounter.get_data(variables || {});

    if (data.p === null) {
      return undefined;
    }

    data.rnd = Math.random().toString(36).slice(2, 7);

    var endpoint = getEndpoint();

    if (!endpoint) {
      warn("no endpoint found");
      return undefined;
    }

    return endpoint + encodeData(data);
  };

  window.goatcounter.count = function (variables) {
    var filterReason = window.goatcounter.filter();

    if (filterReason) {
      warn("not counting because of: " + filterReason);
      return;
    }

    var url = window.goatcounter.url(variables);

    if (!url) {
      warn("not counting because path callback returned null");
      return;
    }

    if (
      !navigator.sendBeacon ||
      !navigator.sendBeacon(url)
    ) {
      var image = document.createElement("img");
      image.src = url;
      image.style.position = "absolute";
      image.style.bottom = "0";
      image.style.width = "1px";
      image.style.height = "1px";
      image.loading = "eager";
      image.alt = "";
      image.setAttribute("aria-hidden", "true");

      var removeImage = function () {
        if (image.parentNode) {
          image.parentNode.removeChild(image);
        }
      };

      image.addEventListener("load", removeImage, false);
      image.addEventListener("error", removeImage, false);
      document.body.appendChild(image);
    }
  };

  window.goatcounter.get_query = function (name) {
    var queryParts = location.search.slice(1).split("&");
    var prefix = name.toLowerCase() + "=";

    for (var index = 0; index < queryParts.length; index += 1) {
      if (queryParts[index].toLowerCase().indexOf(prefix) === 0) {
        return queryParts[index].slice(name.length + 1);
      }
    }

    return undefined;
  };

  window.goatcounter.bind_events = function () {
    if (!document.querySelectorAll) {
      return;
    }

    Array.prototype.slice
      .call(document.querySelectorAll("[data-goatcounter-click]"))
      .forEach(function (element) {
        if (element.dataset.goatcounterBound) {
          return;
        }

        var send = function () {
          window.goatcounter.count({
            event: true,
            path:
              element.dataset.goatcounterClick ||
              element.name ||
              element.id ||
              "",
            title:
              element.dataset.goatcounterTitle ||
              element.title ||
              (element.textContent || "").trim().slice(0, 200),
            referrer:
              element.dataset.goatcounterReferrer ||
              element.dataset.goatcounterReferral ||
              "",
            no_session: ["1", "t", "true"].indexOf(
              (element.dataset.goatcounterNoSession || "").toLowerCase()
            ) !== -1
          });
        };

        element.addEventListener("click", send, false);
        element.addEventListener("auxclick", send, false);
        element.dataset.goatcounterBound = "true";
      });
  };

  if (location.hash === "#toggle-goatcounter") {
    try {
      if (localStorage.getItem("skipgc") === "t") {
        localStorage.removeItem("skipgc");
        alert("GoatCounter tracking is now ENABLED in this browser.");
      } else {
        localStorage.setItem("skipgc", "t");
        alert(
          "GoatCounter tracking is now DISABLED in this browser until " +
            location +
            " is loaded again."
        );
      }
    } catch (error) {
      warn("could not change the local tracking preference");
    }
  }

  if (!goatcounter.no_onload) {
    onLoad(function () {
      if (
        !("visibilityState" in document) ||
        document.visibilityState === "visible"
      ) {
        window.goatcounter.count();
      } else {
        var countWhenVisible = function () {
          if (document.visibilityState !== "visible") {
            return;
          }

          document.removeEventListener(
            "visibilitychange",
            countWhenVisible
          );
          window.goatcounter.count();
        };

        document.addEventListener(
          "visibilitychange",
          countWhenVisible
        );
      }

      if (!goatcounter.no_events) {
        window.goatcounter.bind_events();
      }
    });
  }
})();

