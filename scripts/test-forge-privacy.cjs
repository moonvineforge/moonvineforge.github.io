"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(repositoryRoot, relativePath),
    "utf8"
  );
}

const html = read("card-forge.html");
const privacy = read("datenschutz.html");
const normalizedPrivacy = privacy.replace(/\s+/g, " ").trim();
const editor = read("assets/forge-editor.js");
const submission = read("assets/forge-submission.js");
const schema = read("assets/forge-schema.js");
const css = read("assets/forge-editor.css");

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

test("Tally is absent from production website files", () => {
  const productionFiles = childProcess
    .execFileSync("git", ["ls-files", "-z"], {
      cwd: repositoryRoot
    })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter(file => (
      file.endsWith(".html") ||
      file.endsWith(".css") ||
      file.endsWith(".js")
    ));

  const forbidden = [
    "tal" + "ly.so",
    "data-" + "tally-src",
    "Tal" + "ly.loadEmbeds",
    "forge-" + "legacy-form",
    "tal" + "ly-wrapper",
    "legacy" + " form"
  ];

  productionFiles.forEach(file => {
    const source = read(file).toLowerCase();

    forbidden.forEach(marker => {
      assert.equal(
        source.includes(marker.toLowerCase()),
        false,
        `${file} still contains ${marker}`
      );
    });
  });
});

test("unfinished entries are not persisted in browser storage", () => {
  [
    "local" + "Storage",
    "session" + "Storage",
    "moonvine-forge-draft-v1",
    "safe" + "Save",
    "safe" + "Load",
    "safe" + "Clear"
  ].forEach(marker => {
    assert.equal(editor.includes(marker), false);
  });

  assert.ok(
    html.includes(
      "Reloading or closing the page will discard it."
    )
  );
  assert.ok(html.includes('id="forge-reset-form"'));
  assert.equal(html.includes("forge-restore-notice"), false);
});

test("submission notice and version are synchronized", () => {
  assert.ok(
    html.includes('id="forge-submission-notice"')
  );
  assert.ok(
    html.includes("Do not include contact details")
  );
  assert.ok(
    html.includes('href="datenschutz.html"')
  );
  assert.ok(
    schema.includes(
      'SUBMISSION_NOTICE_VERSION = "2026-06-v2"'
    )
  );
  assert.equal(
    schema.includes(
      'SUBMISSION_NOTICE_VERSION = "2026-06-v1"'
    ),
    false
  );
});

test("public credit requires explicit consent language", () => {
  assert.ok(
    html.includes(
      "I consent to Moonvine Forge publicly crediting this submission"
    )
  );
  assert.ok(
    html.includes(
      "I can withdraw this consent for future use at any time."
    )
  );
});

test("privacy policy documents the actual Forge workflow", () => {
  [
    "Google Apps Script and Google Sheets",
    "standard Google account",
    "Automated technical intake review",
    "No persistent browser draft storage",
    "planned duration of",
    "24 months",
    "no more than three additional months",
    "Article 6(1)(f) GDPR",
    "Article 6(1)(a) GDPR",
    "Bayerisches Landesamt für Datenschutzaufsicht",
    "MVF-..."
  ].forEach(marker => {
    assert.ok(
      normalizedPrivacy.includes(marker),
      `Privacy policy is missing: ${marker}`
    );
  });

  assert.ok(
    normalizedPrivacy.includes(
      "Card text, aliases, and complete submission payloads are not returned to GitHub Actions."
    )
  );
});

test("failure text no longer promises a removed fallback", () => {
  assert.equal(submission.includes("legacy form"), false);
  assert.equal(
    submission.includes("Your draft is still safe"),
    false
  );
  assert.ok(
    submission.includes(
      "Your current entry remains in this open tab."
    )
  );
});

test("removed selectors and controls do not remain", () => {
  assert.equal(css.includes("forge-legacy-form"), false);
  assert.equal(css.includes("tally-wrapper"), false);
  assert.equal(css.includes("forge-restore-notice"), false);
  assert.ok(css.includes(".forge-submission-notice"));
  assert.equal(editor.includes("forge-clear-draft"), false);
  assert.equal(editor.includes("restoreNotice"), false);
  assert.equal(
    editor.includes('form.addEventListener("submit"'),
    false
  );
});

for (const current of tests) {
  current.callback();
  console.log(`PASS ${current.name}`);
}

console.log(
  `All ${tests.length} Forge privacy tests passed.`
);
