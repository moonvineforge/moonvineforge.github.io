"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("card-forge.html", "utf8");
const javascript = fs.readFileSync("assets/forge-editor.js", "utf8");
const stylesheet = fs.readFileSync("assets/forge-editor.css", "utf8");
let count = 0;

function test(name, action) {
    action();
    count += 1;
    console.log(`PASS ${name}`);
}

function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

test("editor assets are loaded once and in dependency order", () => {
    assert.equal(occurrences(html, 'href="assets/forge-editor.css"'), 1);
    assert.equal(occurrences(html, 'src="assets/forge-schema.js"'), 1);
    assert.equal(occurrences(html, 'src="assets/forge-editor.js"'), 1);
    assert.ok(html.indexOf('src="assets/forge-schema.js"') < html.indexOf('src="assets/forge-editor.js"'));
});

test("compact editor and legacy fallback coexist", () => {
    assert.equal(occurrences(html, "data-forge-editor"), 1);
    assert.equal(occurrences(html, 'id="forge-editor-form"'), 1);
    assert.equal(occurrences(html, "data-tally-src="), 1);
    assert.ok(html.includes("Use the current Tally form"));
});

test("all six content types are present", () => {
    ["card", "relic", "enemy", "resource", "status", "mechanic"].forEach(value => {
        const pattern = new RegExp(`<input[^>]*name="forge-content-type"[^>]*value="${value}"[^>]*>`);
        assert.equal((html.match(pattern) || []).length, 1);
    });
});

test("rules text is the only required creative text field", () => {
    assert.ok(html.includes('id="forge-rules-text"'));
    assert.ok(html.includes('id="forge-rules-text" maxlength="6000" minlength="3" required'));
    const requiredControls = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*\srequired(?:\s|>)/g)];
    assert.equal(requiredControls.length, 1);
    assert.ok(requiredControls[0][0].includes('id="forge-rules-text"'));
});

test("editor has local-only safety boundaries", () => {
    assert.ok(javascript.includes("window.localStorage"));
    assert.ok(javascript.includes("schema.prepareSubmission"));
    assert.ok(javascript.includes("textContent"));
    assert.ok(javascript.includes("replaceChildren"));
    assert.equal(javascript.includes("innerHTML"), false);
    assert.equal(javascript.includes("fetch("), false);
    assert.equal(javascript.includes("XMLHttpRequest"), false);
});

test("details are repeatable and removable", () => {
    assert.ok(javascript.includes("schema.createDetail"));
    assert.ok(javascript.includes("forge-detail-remove"));
    assert.ok(javascript.includes("schema.LIMITS.detailCount"));
    assert.ok(html.includes("data-add-detail=\"custom\""));
});

test("prompt generator can seed an empty rules field", () => {
    assert.ok(javascript.includes(".prompt-submit-link"));
    assert.ok(javascript.includes("promptText.textContent"));
});

test("untrusted content is rendered as text", () => {
    assert.ok(javascript.includes("outputCode.textContent"));
    assert.ok(javascript.includes("text.textContent = clean(detail.text)"));
});

test("responsive editor styles exist", () => {
    assert.ok(stylesheet.includes(".forge-editor-shell"));
    assert.ok(stylesheet.includes(".forge-live-preview"));
    assert.ok(stylesheet.includes("@media (max-width: 940px)"));
    assert.ok(stylesheet.includes("@media (max-width: 640px)"));
});

test("all literal HTML ids are unique", () => {
    const matches = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    const duplicates = matches.filter((value, index) => matches.indexOf(value) !== index);
    assert.deepEqual([...new Set(duplicates)], []);
});

console.log(`All ${count} Forge editor tests passed.`);
