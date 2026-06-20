(function () {
  "use strict";

  var RESPONSE_SOURCE = "moonvine-forge-backend";
  var RESPONSE_TIMEOUT_MILLISECONDS = 45000;

  function element(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function setHidden(target, hidden) {
    if (target) target.hidden = hidden;
  }

  function createResponseToken() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID().replace(/-/g, "");
    }

    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    ).slice(0, 64);
  }

  function appendHiddenField(form, name, value) {
    var input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  function isExpectedGoogleOrigin(origin) {
    try {
      var parsed = new URL(origin);
      var hostname = parsed.hostname.toLowerCase();

      if (parsed.protocol !== "https:") return false;

      return (
        hostname === "script.google.com" ||
        hostname === "script.googleusercontent.com" ||
        hostname.endsWith(".script.googleusercontent.com") ||
        hostname.endsWith("-script.googleusercontent.com")
      );
    } catch (error) {
      return false;
    }
  }

  function countEvent(path) {
    if (
      window.goatcounter &&
      typeof window.goatcounter.count === "function"
    ) {
      window.goatcounter.count({
        path: path,
        event: true
      });
    }
  }

  function initializeSubmission() {
    var root = document.querySelector("[data-forge-editor]");
    var form = element("forge-editor-form");

    if (!root || !form) return;

    var endpoint = clean(root.dataset.forgeEndpoint);
    var editorApi = window.MoonvineForgeEditor;
    var submitButton = element("forge-submit-button");
    var validationStatus = element("forge-validation-status");
    var validationMessage = element("forge-validation-message");
    var validationList = element("forge-validation-errors");
    var outputPanel = element("forge-local-output");
    var outputCode = element("forge-output-json");
    var outputHeading = element("forge-local-output-heading");
    var fatalStatus = element("forge-editor-fatal-status");
    var defaultButtonText = submitButton
      ? submitButton.textContent
      : "Submit idea";
    var activeRequest = null;

    if (!endpoint || !editorApi) {
      if (fatalStatus) {
        fatalStatus.textContent =
          "Direct submission could not be initialized. Your current entry remains in this open tab. Reload the page and try again.";
        fatalStatus.hidden = false;
      }

      return;
    }

    function setSubmitting(submitting) {
      if (!submitButton) return;

      submitButton.disabled = submitting;
      submitButton.setAttribute(
        "aria-busy",
        submitting ? "true" : "false"
      );
      submitButton.textContent = submitting
        ? "Sending..."
        : defaultButtonText;
    }

    function clearResultList() {
      if (validationList) validationList.replaceChildren();
    }

    function addResultErrors(errors) {
      if (!validationList || !Array.isArray(errors)) return;

      errors.forEach(function (error) {
        if (!error || typeof error.message !== "string") return;

        var item = document.createElement("li");
        item.textContent = error.message;
        validationList.appendChild(item);
      });
    }

    function showStatus(message, success, errors) {
      clearResultList();
      addResultErrors(errors);

      if (validationMessage) {
        validationMessage.textContent = message;
      }

      if (validationStatus) {
        validationStatus.classList.toggle(
          "is-success",
          success
        );
        validationStatus.hidden = false;
        validationStatus.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }
    }

    function cleanupRequest(request) {
      if (!request) return;

      window.clearTimeout(request.timeoutId);

      if (request.form && request.form.isConnected) {
        request.form.remove();
      }

      if (request.iframe && request.iframe.isConnected) {
        request.iframe.remove();
      }

      if (activeRequest === request) {
        activeRequest = null;
      }

      setSubmitting(false);
    }

    function completeSuccess(result) {
      editorApi.resetAfterSubmission();

      var reference = clean(result.publicReference);
      var message =
        clean(result.message) ||
        "Your idea entered the Forge.";

      if (outputHeading) {
        outputHeading.textContent = "Submission received";
      }

      if (outputCode) {
        outputCode.textContent =
          reference || "Reference unavailable";
      }

      setHidden(outputPanel, false);

      showStatus(
        reference
          ? message + " Reference: " + reference + "."
          : message,
        true,
        []
      );

      countEvent("card-forge-submit-success");

      if (outputPanel) {
        outputPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }
    }

    function completeFailure(result) {
      var message =
        clean(result && result.message) ||
        "The Forge could not confirm this submission. Your current entry remains in this open tab.";

      showStatus(
        message,
        false,
        result && result.errors
      );
      setHidden(outputPanel, true);
      countEvent("card-forge-submit-failure");
    }

    window.addEventListener("message", function (event) {
      var request = activeRequest;

      if (!request) return;
      if (!isExpectedGoogleOrigin(event.origin)) return;
      var message = event.data;

      if (!message || typeof message !== "object") return;
      if (message.source !== RESPONSE_SOURCE) return;
      if (
        message.responseToken !== request.responseToken
      ) {
        return;
      }

      cleanupRequest(request);

      if (
        message.result &&
        message.result.ok === true
      ) {
        completeSuccess(message.result);
      } else {
        completeFailure(message.result || {});
      }
    });

    form.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (activeRequest) return;

        var prepared = editorApi.prepareSubmission();

        if (!prepared || prepared.valid !== true) {
          editorApi.showValidation(
            prepared &&
              Array.isArray(prepared.errors)
              ? prepared.errors
              : [{
                  message:
                    "The submission could not be validated."
                }]
          );
          return;
        }

        if (
          window.location.protocol !== "https:" &&
          window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1"
        ) {
          showStatus(
            "Direct submission requires the secure Moonvine Forge website. Your current entry remains in this open tab.",
            false,
            []
          );
          return;
        }

        var responseToken = createResponseToken();
        var iframe =
          document.createElement("iframe");
        var postForm =
          document.createElement("form");
        var targetName =
          "moonvine-forge-response-" + responseToken;

        iframe.name = targetName;
        iframe.title =
          "Moonvine Forge submission response";
        iframe.hidden = true;
        iframe.setAttribute("aria-hidden", "true");

        postForm.method = "post";
        postForm.action = endpoint;
        postForm.target = targetName;
        postForm.hidden = true;
        postForm.acceptCharset = "UTF-8";

        appendHiddenField(
          postForm,
          "payload",
          JSON.stringify(prepared.submission)
        );
        appendHiddenField(
          postForm,
          "origin",
          window.location.origin
        );
        appendHiddenField(
          postForm,
          "responseToken",
          responseToken
        );
        appendHiddenField(
          postForm,
          "website",
          ""
        );

        document.body.appendChild(iframe);
        document.body.appendChild(postForm);

        var request = {
          iframe: iframe,
          form: postForm,
          responseToken: responseToken,
          timeoutId: 0
        };

        request.timeoutId = window.setTimeout(
          function () {
            if (activeRequest !== request) return;

            cleanupRequest(request);
            completeFailure({
              message:
                "The Forge did not answer in time. Your current entry remains in this open tab, so you can try again."
            });
          },
          RESPONSE_TIMEOUT_MILLISECONDS
        );

        activeRequest = request;

        setHidden(outputPanel, true);
        showStatus(
          "Sending your idea to the Forge...",
          false,
          []
        );
        setSubmitting(true);
        postForm.submit();
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeSubmission,
      { once: true }
    );
  } else {
    initializeSubmission();
  }
})();
