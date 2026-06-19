(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.MoonvineForgeSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const SCHEMA_VERSION = 1;
    const FORM_VERSION = "1.0.0";
    const SUBMISSION_NOTICE_VERSION = "2026-06-v1";

    const CONTENT_TYPES = Object.freeze({
        card: { label: "Card", placeholderName: "Untitled Card" },
        relic: { label: "Relic", placeholderName: "Untitled Relic" },
        enemy: { label: "Enemy or Enemy Action", placeholderName: "Untitled Enemy Idea" },
        resource: { label: "Resource", placeholderName: "Untitled Resource" },
        status: { label: "Status", placeholderName: "Untitled Status" },
        mechanic: { label: "Complete Mechanic", placeholderName: "Untitled Mechanic" }
    });

    const DETAIL_KINDS = Object.freeze({
        trigger: "Trigger",
        effect: "Additional effect",
        target: "Target",
        condition: "Condition",
        cost: "Cost",
        duration: "Duration",
        stacking: "Stacking rule",
        zone: "Zone interaction",
        resource: "Resource interaction",
        sequence: "Sequence rule",
        randomness: "Randomness rule",
        drawback: "Drawback",
        upgrade: "Upgrade",
        edge_case: "Edge case",
        purpose: "Design purpose",
        memory: "Memory rule",
        recursion: "Recursion rule",
        custom: "Custom detail"
    });

    const LIMITS = Object.freeze({
        name: 100,
        rulesTextMin: 3,
        rulesTextMax: 6000,
        subtype: 100,
        cost: 100,
        rarity: 100,
        flavourText: 1000,
        upgradeText: 3000,
        detailCount: 24,
        detailText: 2000,
        detailLabel: 100,
        creditAlias: 100,
        payloadCharacters: 40000
    });

    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const CORE_FIELDS = ["name", "rulesText", "subtype", "cost", "rarity", "flavourText", "upgradeText"];

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function cleanText(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function generateUuid() {
        const cryptoObject = typeof globalThis !== "undefined" ? globalThis.crypto : null;
        if (cryptoObject && typeof cryptoObject.randomUUID === "function") return cryptoObject.randomUUID();

        const bytes = new Uint8Array(16);
        if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
            cryptoObject.getRandomValues(bytes);
        } else {
            for (let index = 0; index < bytes.length; index += 1) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }

        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function createDetail(kind = "effect", text = "", label = "") {
        if (!Object.prototype.hasOwnProperty.call(DETAIL_KINDS, kind)) {
            throw new RangeError(`Unknown Forge detail kind: ${kind}`);
        }
        return { id: `detail-${generateUuid()}`, kind, label: cleanText(label), text: cleanText(text) };
    }

    function createSubmission(overrides = {}) {
        const source = isObject(overrides) ? overrides : {};
        const coreSource = isObject(source.core) ? source.core : {};
        const creditSource = isObject(source.credit) ? source.credit : {};
        const core = Object.fromEntries(CORE_FIELDS.map(field => [field, coreSource[field] ?? ""]));

        return {
            schemaVersion: source.schemaVersion ?? SCHEMA_VERSION,
            formVersion: source.formVersion ?? FORM_VERSION,
            submissionId: source.submissionId ?? generateUuid(),
            createdAtClient: source.createdAtClient ?? new Date().toISOString(),
            contentType: source.contentType ?? "card",
            core,
            details: Array.isArray(source.details) ? source.details.map(detail => isObject(detail) ? { ...detail } : detail) : [],
            credit: {
                alias: creditSource.alias ?? "",
                publicCreditAllowed: creditSource.publicCreditAllowed ?? false
            },
            submissionNoticeVersion: source.submissionNoticeVersion ?? SUBMISSION_NOTICE_VERSION
        };
    }

    function normalizeSubmission(input) {
        const source = isObject(input) ? input : {};
        const coreSource = isObject(source.core) ? source.core : {};
        const creditSource = isObject(source.credit) ? source.credit : {};
        const core = Object.fromEntries(CORE_FIELDS.map(field => [field, cleanText(coreSource[field])]));
        const alias = cleanText(creditSource.alias);
        const contentType = Object.prototype.hasOwnProperty.call(CONTENT_TYPES, source.contentType)
            ? source.contentType
            : "card";
        const details = Array.isArray(source.details)
            ? source.details.filter(isObject).map(detail => ({
                id: cleanText(detail.id) || `detail-${generateUuid()}`,
                kind: Object.prototype.hasOwnProperty.call(DETAIL_KINDS, detail.kind) ? detail.kind : "custom",
                label: cleanText(detail.label),
                text: cleanText(detail.text)
            })).filter(detail => detail.text)
            : [];
        const validDate = typeof source.createdAtClient === "string" && !Number.isNaN(Date.parse(source.createdAtClient));

        return {
            schemaVersion: SCHEMA_VERSION,
            formVersion: cleanText(source.formVersion) || FORM_VERSION,
            submissionId: typeof source.submissionId === "string" && UUID_PATTERN.test(source.submissionId)
                ? source.submissionId
                : generateUuid(),
            createdAtClient: validDate ? new Date(source.createdAtClient).toISOString() : new Date().toISOString(),
            contentType,
            core,
            details,
            credit: { alias, publicCreditAllowed: Boolean(alias && creditSource.publicCreditAllowed === true) },
            submissionNoticeVersion: cleanText(source.submissionNoticeVersion) || SUBMISSION_NOTICE_VERSION
        };
    }

    function validateSubmission(input) {
        const errors = [];
        const add = (path, code, message) => errors.push({ path, code, message });
        const text = (path, value, maximum, options = {}) => {
            if (typeof value !== "string") return add(path, `${options.code || "text"}_type`, "Must be text.");
            const length = options.trimmed ? value.trim().length : value.length;
            if (options.minimum && length < options.minimum) add(path, `${options.code}_too_short`, `Must contain at least ${options.minimum} characters.`);
            if (length > maximum) add(path, `${options.code || "text"}_too_long`, `Must not exceed ${maximum} characters.`);
        };

        if (!isObject(input)) return { valid: false, errors: [{ path: "$", code: "submission_type", message: "Submission must be an object." }] };
        if (input.schemaVersion !== SCHEMA_VERSION) add("schemaVersion", "schema_version", "Unsupported schema version.");
        text("formVersion", input.formVersion, 20, { code: "form_version", minimum: 1 });
        if (typeof input.submissionId !== "string" || !UUID_PATTERN.test(input.submissionId)) add("submissionId", "submission_id", "Must be a version 4 UUID.");
        if (typeof input.createdAtClient !== "string" || Number.isNaN(Date.parse(input.createdAtClient))) add("createdAtClient", "created_at_client", "Must be a valid date.");
        if (!Object.prototype.hasOwnProperty.call(CONTENT_TYPES, input.contentType)) add("contentType", "content_type", "Unknown content type.");

        if (!isObject(input.core)) {
            add("core", "core_type", "Core submission data is required.");
        } else {
            text("core.name", input.core.name, LIMITS.name, { code: "name" });
            text("core.rulesText", input.core.rulesText, LIMITS.rulesTextMax, { code: "rules_text", minimum: LIMITS.rulesTextMin, trimmed: true });
            text("core.subtype", input.core.subtype, LIMITS.subtype, { code: "subtype" });
            text("core.cost", input.core.cost, LIMITS.cost, { code: "cost" });
            text("core.rarity", input.core.rarity, LIMITS.rarity, { code: "rarity" });
            text("core.flavourText", input.core.flavourText, LIMITS.flavourText, { code: "flavour_text" });
            text("core.upgradeText", input.core.upgradeText, LIMITS.upgradeText, { code: "upgrade_text" });
        }

        if (!Array.isArray(input.details)) {
            add("details", "details_type", "Details must be a list.");
        } else {
            if (input.details.length > LIMITS.detailCount) add("details", "details_too_many", `No more than ${LIMITS.detailCount} detail blocks are allowed.`);
            const ids = new Set();
            input.details.forEach((detail, index) => {
                const path = `details[${index}]`;
                if (!isObject(detail)) return add(path, "detail_type", "Detail must be an object.");
                if (typeof detail.id !== "string" || !detail.id.trim() || detail.id.length > 64) add(`${path}.id`, "detail_id", "Detail ID is invalid.");
                else if (ids.has(detail.id)) add(`${path}.id`, "detail_id_duplicate", "Detail IDs must be unique.");
                else ids.add(detail.id);
                if (!Object.prototype.hasOwnProperty.call(DETAIL_KINDS, detail.kind)) add(`${path}.kind`, "detail_kind", "Unknown detail kind.");
                text(`${path}.label`, detail.label, LIMITS.detailLabel, { code: "detail_label" });
                text(`${path}.text`, detail.text, LIMITS.detailText, { code: "detail_text", minimum: 1, trimmed: true });
                if (detail.kind === "custom" && typeof detail.label === "string" && !detail.label.trim()) add(`${path}.label`, "custom_detail_label_missing", "Custom details need a label.");
            });
        }

        if (!isObject(input.credit)) {
            add("credit", "credit_type", "Credit settings are required.");
        } else {
            text("credit.alias", input.credit.alias, LIMITS.creditAlias, { code: "credit_alias" });
            if (typeof input.credit.publicCreditAllowed !== "boolean") add("credit.publicCreditAllowed", "public_credit_type", "Must be true or false.");
            if (input.credit.publicCreditAllowed === true && typeof input.credit.alias === "string" && !input.credit.alias.trim()) add("credit.alias", "public_credit_alias_missing", "An alias is required for public credit.");
        }

        text("submissionNoticeVersion", input.submissionNoticeVersion, 40, { code: "submission_notice_version", minimum: 1 });
        try {
            if (JSON.stringify(input).length > LIMITS.payloadCharacters) add("$", "payload_too_large", `Must not exceed ${LIMITS.payloadCharacters} serialized characters.`);
        } catch (error) {
            add("$", "payload_serialization", "Submission cannot be serialized.");
        }
        return { valid: errors.length === 0, errors };
    }

    function prepareSubmission(input) {
        const submission = normalizeSubmission(input);
        const validation = validateSubmission(submission);
        return { submission, valid: validation.valid, errors: validation.errors };
    }

    function serializeSubmission(input) {
        const prepared = prepareSubmission(input);
        if (!prepared.valid) {
            const error = new Error("Forge submission is invalid.");
            error.validationErrors = prepared.errors;
            throw error;
        }
        return JSON.stringify(prepared.submission);
    }

    return Object.freeze({
        SCHEMA_VERSION,
        FORM_VERSION,
        SUBMISSION_NOTICE_VERSION,
        CONTENT_TYPES,
        DETAIL_KINDS,
        LIMITS,
        createDetail,
        createSubmission,
        normalizeSubmission,
        validateSubmission,
        prepareSubmission,
        serializeSubmission
    });
});
