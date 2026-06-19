"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");
const backendPath = path.join(repositoryRoot, "apps-script", "Code.gs");
const source = fs.readFileSync(backendPath, "utf8");
const context = vm.createContext({ console, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error });
vm.runInContext(source, context, { filename: backendPath });
const backend = context.MoonvineForgeBackendTest;

if (!backend) throw new Error("MoonvineForgeBackendTest export was not found.");

function validSubmission(overrides = {}) {
    const base = {
        schemaVersion: 1,
        formVersion: "1.0.0",
        submissionId: "550e8400-e29b-41d4-a716-446655440000",
        createdAtClient: "2026-06-19T16:30:00.000Z",
        contentType: "card",
        core: {
            name: "Recursive Petition",
            rulesText: "Gain 8 Block.",
            subtype: "Skill",
            cost: "2",
            rarity: "Rare",
            flavourText: "Please refer to the request.",
            upgradeText: "Gain 11 Block."
        },
        details: [],
        credit: {
            alias: "ExampleDesigner",
            publicCreditAllowed: true
        },
        submissionNoticeVersion: "2026-06-v1"
    };
    return Object.assign(base, overrides);
}

const tests = [];
function test(name, callback) {
    tests.push({ name, callback });
}

test("accepts and normalizes a minimal valid submission", () => {
    const input = validSubmission({
        core: {
            name: "  ",
            rulesText: "  Gain 8 Block.  ",
            subtype: "",
            cost: "",
            rarity: "",
            flavourText: "",
            upgradeText: ""
        },
        credit: { alias: "", publicCreditAllowed: true }
    });
    const result = backend.validateSubmission(input);
    assert.equal(result.valid, true);
    assert.equal(result.submission.core.rulesText, "Gain 8 Block.");
    assert.equal(result.submission.credit.publicCreditAllowed, false);
});

test("rejects a missing rules description", () => {
    const input = validSubmission();
    input.core.rulesText = "  ";
    const result = backend.validateSubmission(input);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.path === "core.rulesText"));
});

test("rejects an unsupported content type", () => {
    const result = backend.validateSubmission(validSubmission({ contentType: "spell" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.code === "content_type"));
});

test("rejects an invalid UUID", () => {
    const result = backend.validateSubmission(validSubmission({ submissionId: "not-a-uuid" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.code === "submission_id"));
});

test("validates repeatable detail blocks", () => {
    const input = validSubmission({
        details: [{ id: "detail-01", kind: "recursion", label: "", text: "Do not invoke this card again." }]
    });
    const result = backend.validateSubmission(input);
    assert.equal(result.valid, true);
    assert.equal(result.submission.details[0].kind, "recursion");
});

test("requires a label for custom details", () => {
    const input = validSubmission({
        details: [{ id: "detail-01", kind: "custom", label: "", text: "Restore the old order." }]
    });
    const result = backend.validateSubmission(input);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.code === "custom_label_missing"));
});

test("drops unknown top-level properties from normalized data", () => {
    const input = validSubmission({ unexpectedSecret: "must not survive" });
    const result = backend.validateSubmission(input);
    assert.equal(result.valid, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.submission, "unexpectedSecret"), false);
});

test("neutralizes spreadsheet formula prefixes", () => {
    assert.equal(backend.neutralizeSheetCell("=IMPORTXML(...)"), "'=IMPORTXML(...)");
    assert.equal(backend.neutralizeSheetCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
    assert.equal(backend.neutralizeSheetCell("Normal card"), "Normal card");
});

test("creates a stable public reference", () => {
    assert.equal(
        backend.createPublicReference("550e8400-e29b-41d4-a716-446655440000", "2026"),
        "MVF-2026-550E8400"
    );
});

test("creates exactly one value for every sheet header", () => {
    const result = backend.validateSubmission(validSubmission());
    assert.equal(result.valid, true);
    const row = backend.createSheetRow(result.submission, "MVF-2026-550E8400", "2026-06-19T16:31:00.000Z");
    assert.equal(row.length, backend.config.headers.length);
    assert.equal(row[0], result.submission.submissionId);
    assert.equal(row[17], "new");
});

test("allows only the configured website and local development origins", () => {
    assert.equal(backend.isAllowedOrigin("https://moonvineforge.github.io"), true);
    assert.equal(backend.isAllowedOrigin("http://localhost:8000"), true);
    assert.equal(backend.isAllowedOrigin("https://example.com"), false);
});

test("normalizes response tokens without reflecting arbitrary text", () => {
    assert.equal(backend.normalizeResponseToken("abcDEF_1234567890-token"), "abcDEF_1234567890-token");
    assert.equal(backend.normalizeResponseToken("<script>"), "invalid-response-token");
});

let failures = 0;
for (const { name, callback } of tests) {
    try {
        callback();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}`);
        console.error(error.stack || error);
    }
}

if (failures > 0) {
    process.exitCode = 1;
} else {
    console.log(`All ${tests.length} Forge backend tests passed.`);
}
