"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(
  "card-forge.html",
  "utf8"
);
const editor = fs.readFileSync(
  "assets/forge-editor.js",
  "utf8"
);
const submission = fs.readFileSync(
  "assets/forge-submission.js",
  "utf8"
);
const backend = fs.readFileSync(
  "apps-script/Code.gs",
  "utf8"
);

const endpoint =
  "https://script.google.com/macros/s/AKfycbwjPby49avdHa1EH5pgmzOPaTJHKxOTBOS70izRkenANfEWX8myI8uZJJ_qBFxe6RD6UQ/exec";

let count = 0;

function test(name, action) {
  action();
  count += 1;
  console.log(`PASS ${name}`);
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test(
  "submission asset is loaded once after the editor",
  () => {
    assert.equal(
      occurrences(
        html,
        'src="assets/forge-submission.js"'
      ),
      1
    );

    assert.ok(
      html.indexOf(
        'src="assets/forge-editor.js"'
      ) <
        html.indexOf(
          'src="assets/forge-submission.js"'
        )
    );
  }
);

test(
  "the deployed endpoint is configured exactly once",
  () => {
    assert.equal(occurrences(html, endpoint), 1);
    assert.ok(
      html.includes(
        `data-forge-endpoint="${endpoint}"`
      )
    );
  }
);

test(
  "the primary action submits instead of previewing",
  () => {
    assert.ok(
      html.includes('id="forge-submit-button"')
    );
    assert.ok(
      html.includes(">Submit idea</button>")
    );
    assert.equal(
      html.includes(
        ">Preview submission</button>"
      ),
      false
    );
    assert.equal(
      html.includes("It does not send data yet."),
      false
    );
  }
);

test(
  "the editor exposes the submission bridge",
  () => {
    assert.ok(
      editor.includes(
        "window.MoonvineForgeEditor = Object.freeze"
      )
    );
    assert.ok(
      editor.includes("prepareSubmission: function")
    );
    assert.ok(
      editor.includes("showValidation: function")
    );
    assert.ok(
      editor.includes(
        "resetAfterSubmission: function"
      )
    );
    assert.ok(
      editor.includes(
        "state = schema.createSubmission()"
      )
    );
  }
);

test(
  "submission uses a form POST and hidden iframe",
  () => {
    assert.ok(
      submission.includes(
        'postForm.method = "post"'
      )
    );
    assert.ok(
      submission.includes(
        "postForm.target = targetName"
      )
    );
    assert.ok(
      submission.includes(
        'document.createElement("iframe")'
      )
    );
    assert.ok(
      submission.includes('"payload"')
    );
    assert.ok(
      submission.includes('"origin"')
    );
    assert.ok(
      submission.includes('"responseToken"')
    );
    assert.ok(
      submission.includes('"website"')
    );
  }
);

test(
  "submission exposes no browser credentials",
  () => {
    assert.equal(
      submission.includes("fetch("),
      false
    );
    assert.equal(
      submission.includes("XMLHttpRequest"),
      false
    );
    assert.equal(
      submission.includes("Authorization"),
      false
    );
    assert.equal(
      submission.includes("apiKey"),
      false
    );
    assert.equal(
      submission.includes("github_pat_"),
      false
    );
  }
);

test(
  "Google response origins are structurally restricted",
  () => {
    assert.ok(
      submission.includes(
        'hostname === "script.google.com"'
      )
    );
    assert.ok(
      submission.includes(
        'hostname === "script.googleusercontent.com"'
      )
    );
    assert.ok(
      submission.includes(
        'hostname.endsWith(".script.googleusercontent.com")'
      )
    );
    assert.ok(
      submission.includes(
        'hostname.endsWith("-script.googleusercontent.com")'
      )
    );
    assert.ok(
      submission.includes(
        'parsed.protocol !== "https:"'
      )
    );
  }
);

test(
  "responses require trusted Google origin and token correlation",
  () => {
    assert.ok(
      submission.includes(
        "isExpectedGoogleOrigin(event.origin)"
      )
    );
    assert.equal(
      submission.includes(
        "event.source !== request.iframe.contentWindow"
      ),
      false
    );
    assert.ok(
      backend.includes(
        '"window.top.postMessage("'
      )
    );
    assert.equal(
      backend.includes(
        '"window.parent.postMessage("'
      ),
      false
    );
    assert.ok(
      submission.includes(
        "message.responseToken !== request.responseToken"
      )
    );
    assert.ok(
      submission.includes(
        "message.source !== RESPONSE_SOURCE"
      )
    );
  }
);

test(
  "the draft resets only after confirmed success",
  () => {
    const successIndex = submission.indexOf(
      "function completeSuccess"
    );
    const failureIndex = submission.indexOf(
      "function completeFailure"
    );
    const resetIndex = submission.indexOf(
      "editorApi.resetAfterSubmission()"
    );

    assert.ok(successIndex >= 0);
    assert.ok(failureIndex > successIndex);
    assert.ok(
      resetIndex > successIndex &&
        resetIndex < failureIndex
    );

    assert.equal(
      submission
        .slice(failureIndex)
        .includes(
          "editorApi.resetAfterSubmission()"
        ),
      false
    );
  }
);

test(
  "live and development origins are accepted",
  () => {
    assert.ok(
      backend.includes(
        '"https://moonvineforge.com"'
      )
    );
    assert.ok(
      backend.includes(
        '"https://www.moonvineforge.com"'
      )
    );
    assert.ok(
      backend.includes(
        '"https://moonvineforge.github.io"'
      )
    );
    assert.ok(
      backend.includes(
        '"http://localhost:8000"'
      )
    );
    assert.ok(
      backend.includes(
        '"http://127.0.0.1:8000"'
      )
    );
  }
);

test(
  "direct submission has no legacy fallback dependency",
  () => {
    assert.equal(
      html.includes("data-tally-src="),
      false
    );
    assert.equal(
      html.includes("forge-legacy-form"),
      false
    );
    assert.equal(
      submission.includes("legacy form"),
      false
    );
    assert.equal(
      submission.includes("Your draft is still safe"),
      false
    );
    assert.ok(
      submission.includes(
        "Your current entry remains in this open tab."
      )
    );
    assert.ok(
      submission.includes(
        "outputCode.textContent"
      )
    );
  }
);

console.log(
  `All ${count} Forge submission tests passed.`
);
