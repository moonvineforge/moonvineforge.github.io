"use strict";

const assert = require("node:assert/strict");
const schema = require("../assets/forge-schema.js");
let count = 0;
const test = (name, action) => { action(); count += 1; console.log(`PASS ${name}`); };
const codes = result => result.errors.map(error => error.code);

test("minimal submission", () => {
    const value = schema.createSubmission({ core: { rulesText: "Gain 8 Block." } });
    assert.equal(schema.validateSubmission(value).valid, true);
});

test("all content types", () => {
    Object.keys(schema.CONTENT_TYPES).forEach(contentType => {
        const value = schema.createSubmission({ contentType, core: { rulesText: "Create a meaningful interaction." } });
        assert.equal(schema.validateSubmission(value).valid, true);
    });
});

test("missing rules text", () => {
    const result = schema.validateSubmission(schema.createSubmission());
    assert.equal(result.valid, false);
    assert.ok(codes(result).includes("rules_text_too_short"));
});

test("detail normalization and order", () => {
    const first = schema.createDetail("trigger", "When a card changes zones.");
    const second = schema.createDetail("recursion", "This cannot invoke itself again.");
    const normalized = schema.normalizeSubmission(schema.createSubmission({
        core: { rulesText: "Remember a sequence and reward it." },
        details: [{ id: "empty", kind: "effect", label: "", text: " " }, first, second]
    }));
    assert.deepEqual(normalized.details.map(detail => detail.id), [first.id, second.id]);
});

test("complex recursive card", () => {
    const value = schema.createSubmission({
        core: {
            name: "Recursive Petition",
            rulesText: "Choose a card in your discard pile. Resolve its first non-damage effect without paying its cost. If that effect would invoke this card again, stop the chain and Exhaust both cards.",
            subtype: "Skill",
            cost: "2",
            rarity: "Rare"
        },
        details: [
            schema.createDetail("target", "One card in the discard pile."),
            schema.createDetail("sequence", "Choose before resolving the copied effect."),
            schema.createDetail("recursion", "The copied effect may not invoke this card again."),
            schema.createDetail("edge_case", "Stop the chain and Exhaust both cards when recursion is detected.")
        ]
    });
    assert.equal(schema.validateSubmission(value).valid, true);
});

test("custom detail label", () => {
    const value = schema.createSubmission({
        core: { rulesText: "Restore an earlier combat state." },
        details: [schema.createDetail("custom", "Restore the earlier order.")]
    });
    assert.ok(codes(schema.validateSubmission(value)).includes("custom_detail_label_missing"));
});

test("public credit alias", () => {
    const value = schema.createSubmission({
        core: { rulesText: "Gain a resource when a status expires." },
        credit: { alias: "", publicCreditAllowed: true }
    });
    assert.ok(codes(schema.validateSubmission(value)).includes("public_credit_alias_missing"));
});

test("duplicate detail IDs", () => {
    const first = schema.createDetail("trigger", "At round start.");
    const second = schema.createDetail("effect", "Gain 1 charge.");
    second.id = first.id;
    const value = schema.createSubmission({ core: { rulesText: "Gain a charge." }, details: [first, second] });
    assert.ok(codes(schema.validateSubmission(value)).includes("detail_id_duplicate"));
});

test("unknown fields removed", () => {
    const value = schema.normalizeSubmission({
        contentType: "card",
        internalSecret: "remove",
        core: { rulesText: "Draw a card.", unknownField: "remove" }
    });
    assert.equal("internalSecret" in value, false);
    assert.equal("unknownField" in value.core, false);
});

test("validated serialization", () => {
    const json = schema.serializeSubmission(schema.createSubmission({
        core: { name: "  Clean Name  ", rulesText: "  Draw two cards.  " }
    }));
    const value = JSON.parse(json);
    assert.equal(value.core.name, "Clean Name");
    assert.equal(value.core.rulesText, "Draw two cards.");
    assert.equal(schema.validateSubmission(value).valid, true);
});

console.log(`All ${count} Forge schema tests passed.`);
