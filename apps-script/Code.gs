const FORGE_BACKEND = Object.freeze({
  schemaVersion: 1,
  sheetName: "Submissions",
  maxRequestCharacters: 60000,
  maxPayloadCharacters: 40000,
  lockTimeoutMilliseconds: 10000,
  allowedOrigins: Object.freeze([
    "https://moonvineforge.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000"
  ]),
  contentTypes: Object.freeze([
    "card",
    "relic",
    "enemy",
    "resource",
    "status",
    "mechanic"
  ]),
  detailKinds: Object.freeze([
    "trigger",
    "effect",
    "target",
    "condition",
    "cost",
    "duration",
    "stacking",
    "zone",
    "resource",
    "sequence",
    "randomness",
    "drawback",
    "upgrade",
    "edge_case",
    "purpose",
    "memory",
    "recursion",
    "custom"
  ]),
  limits: Object.freeze({
    formVersion: 20,
    name: 100,
    rulesTextMin: 3,
    rulesTextMax: 6000,
    subtype: 100,
    cost: 100,
    rarity: 100,
    flavourText: 1000,
    upgradeText: 3000,
    detailCount: 24,
    detailId: 100,
    detailLabel: 100,
    detailText: 2000,
    creditAlias: 100,
    noticeVersion: 50
  }),
  headers: Object.freeze([
    "submission_id",
    "public_reference",
    "submitted_at_utc",
    "created_at_client_utc",
    "schema_version",
    "form_version",
    "content_type",
    "name",
    "subtype",
    "cost",
    "rarity",
    "rules_text",
    "detail_count",
    "detail_kinds",
    "credit_alias",
    "public_credit_allowed",
    "submission_notice_version",
    "processing_status",
    "processed_at_utc",
    "review_reference",
    "payload_json",
    "processing_notes"
  ])
});

const FORGE_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORGE_RESPONSE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,120}$/;
const FORGE_CORE_FIELDS = Object.freeze([
  "name",
  "rulesText",
  "subtype",
  "cost",
  "rarity",
  "flavourText",
  "upgradeText"
]);

function setupForgeBackend() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Open the Apps Script project from the target Google Sheet before running setupForgeBackend().");
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    FORGE_SPREADSHEET_ID: spreadsheet.getId(),
    FORGE_SHEET_NAME: FORGE_BACKEND.sheetName
  }, false);

  const sheet = getOrCreateForgeSheet_(spreadsheet, FORGE_BACKEND.sheetName);
  ensureForgeHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, FORGE_BACKEND.headers.length).setFontWeight("bold");
  sheet.autoResizeColumns(1, FORGE_BACKEND.headers.length);

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    columnCount: FORGE_BACKEND.headers.length
  };
}

function doGet() {
  return HtmlService.createHtmlOutput(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Moonvine Forge</title></head>" +
    "<body><p>Moonvine Forge submission endpoint is running.</p></body></html>"
  );
}

function doPost(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const responseToken = normalizeResponseToken_(parameters.responseToken);
  const requestedOrigin = normalizeText_(parameters.origin);
  const responseOrigin = isAllowedOrigin_(requestedOrigin) ? requestedOrigin : "*";

  try {
    if (!isAllowedOrigin_(requestedOrigin)) {
      throw createForgeError_("origin_not_allowed", "This submission origin is not allowed.");
    }

    if (normalizeText_(parameters.website)) {
      throw createForgeError_("spam_rejected", "The submission was rejected.");
    }

    const contentLength = event && Number.isFinite(Number(event.contentLength))
      ? Number(event.contentLength)
      : -1;
    if (contentLength > FORGE_BACKEND.maxRequestCharacters) {
      throw createForgeError_("request_too_large", "The submission is too large.");
    }

    const rawPayload = typeof parameters.payload === "string" ? parameters.payload : "";
    if (!rawPayload) {
      throw createForgeError_("payload_missing", "No Forge submission payload was received.");
    }
    if (rawPayload.length > FORGE_BACKEND.maxPayloadCharacters) {
      throw createForgeError_("payload_too_large", "The submission is too large.");
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch (error) {
      throw createForgeError_("payload_invalid_json", "The submission payload is not valid JSON.");
    }

    const validation = validateForgeSubmission_(parsedPayload);
    if (!validation.valid) {
      throw createForgeError_("submission_invalid", "The submission failed server validation.", validation.errors);
    }

    const result = storeForgeSubmission_(validation.submission);
    return createForgeResponse_(responseOrigin, responseToken, {
      ok: true,
      code: result.duplicate ? "duplicate" : "accepted",
      message: result.duplicate
        ? "This idea had already reached the Forge. The existing submission was kept."
        : "Your idea entered the Forge.",
      publicReference: result.publicReference,
      duplicate: result.duplicate
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    const forgeCode = error && error.forgeCode ? error.forgeCode : "server_error";
    const safeMessage = forgeCode === "server_error"
      ? "The Forge could not save this idea. Your draft is still safe in this browser."
      : String(error.message || "The submission could not be saved.");

    return createForgeResponse_(responseOrigin, responseToken, {
      ok: false,
      code: forgeCode,
      message: safeMessage,
      errors: Array.isArray(error && error.forgeErrors) ? error.forgeErrors : []
    });
  }
}

function storeForgeSubmission_(submission) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("FORGE_SPREADSHEET_ID");
  const sheetName = properties.getProperty("FORGE_SHEET_NAME") || FORGE_BACKEND.sheetName;
  if (!spreadsheetId) {
    throw createForgeError_("backend_not_configured", "The Forge backend has not been configured yet.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(FORGE_BACKEND.lockTimeoutMilliseconds);

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw createForgeError_("sheet_missing", "The Forge submission sheet is missing.");
    }
    ensureForgeHeaders_(sheet);

    const duplicate = findForgeSubmission_(sheet, submission.submissionId);
    if (duplicate) {
      return {
        duplicate: true,
        publicReference: duplicate.publicReference
      };
    }

    const now = new Date();
    const submittedAtUtc = Utilities.formatDate(now, "UTC", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    const year = Utilities.formatDate(now, "UTC", "yyyy");
    const publicReference = createPublicReference_(submission.submissionId, year);
    const row = createForgeSheetRow_(submission, publicReference, submittedAtUtc);

    const nextRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    return {
      duplicate: false,
      publicReference: publicReference
    };
  } finally {
    lock.releaseLock();
  }
}

function validateForgeSubmission_(input) {
  const errors = [];
  const addError = function (path, code, message) {
    errors.push({ path: path, code: code, message: message });
  };

  if (!isPlainObject_(input)) {
    return {
      valid: false,
      errors: [{ path: "$", code: "submission_type", message: "Submission must be an object." }],
      submission: null
    };
  }

  if (input.schemaVersion !== FORGE_BACKEND.schemaVersion) {
    addError("schemaVersion", "schema_version", "Unsupported schema version.");
  }

  const formVersion = normalizeText_(input.formVersion);
  validateTextLength_(errors, "formVersion", formVersion, 1, FORGE_BACKEND.limits.formVersion);

  const submissionId = normalizeText_(input.submissionId);
  if (!FORGE_UUID_V4_PATTERN.test(submissionId)) {
    addError("submissionId", "submission_id", "Submission ID must be a version 4 UUID.");
  }

  const createdAtClient = normalizeText_(input.createdAtClient);
  if (!createdAtClient || Number.isNaN(Date.parse(createdAtClient))) {
    addError("createdAtClient", "created_at_client", "Client creation time must be a valid date.");
  }

  const contentType = normalizeText_(input.contentType);
  if (FORGE_BACKEND.contentTypes.indexOf(contentType) === -1) {
    addError("contentType", "content_type", "Unknown content type.");
  }

  const coreInput = isPlainObject_(input.core) ? input.core : null;
  if (!coreInput) {
    addError("core", "core_type", "Core submission data is required.");
  }

  const core = {};
  FORGE_CORE_FIELDS.forEach(function (field) {
    core[field] = normalizeText_(coreInput ? coreInput[field] : "");
  });

  validateTextLength_(errors, "core.name", core.name, 0, FORGE_BACKEND.limits.name);
  validateTextLength_(errors, "core.rulesText", core.rulesText, FORGE_BACKEND.limits.rulesTextMin, FORGE_BACKEND.limits.rulesTextMax);
  validateTextLength_(errors, "core.subtype", core.subtype, 0, FORGE_BACKEND.limits.subtype);
  validateTextLength_(errors, "core.cost", core.cost, 0, FORGE_BACKEND.limits.cost);
  validateTextLength_(errors, "core.rarity", core.rarity, 0, FORGE_BACKEND.limits.rarity);
  validateTextLength_(errors, "core.flavourText", core.flavourText, 0, FORGE_BACKEND.limits.flavourText);
  validateTextLength_(errors, "core.upgradeText", core.upgradeText, 0, FORGE_BACKEND.limits.upgradeText);

  const detailInput = Array.isArray(input.details) ? input.details : [];
  if (!Array.isArray(input.details)) {
    addError("details", "details_type", "Details must be an array.");
  }
  if (detailInput.length > FORGE_BACKEND.limits.detailCount) {
    addError("details", "details_too_many", "Too many detail blocks.");
  }

  const details = [];
  detailInput.slice(0, FORGE_BACKEND.limits.detailCount).forEach(function (detail, index) {
    const path = "details[" + index + "]";
    if (!isPlainObject_(detail)) {
      addError(path, "detail_type", "Detail must be an object.");
      return;
    }

    const normalized = {
      id: normalizeText_(detail.id),
      kind: normalizeText_(detail.kind),
      label: normalizeText_(detail.label),
      text: normalizeText_(detail.text)
    };

    validateTextLength_(errors, path + ".id", normalized.id, 1, FORGE_BACKEND.limits.detailId);
    if (FORGE_BACKEND.detailKinds.indexOf(normalized.kind) === -1) {
      addError(path + ".kind", "detail_kind", "Unknown detail kind.");
    }
    validateTextLength_(errors, path + ".label", normalized.label, 0, FORGE_BACKEND.limits.detailLabel);
    validateTextLength_(errors, path + ".text", normalized.text, 1, FORGE_BACKEND.limits.detailText);
    if (normalized.kind === "custom" && !normalized.label) {
      addError(path + ".label", "custom_label_missing", "Custom details need a label.");
    }
    details.push(normalized);
  });

  const creditInput = isPlainObject_(input.credit) ? input.credit : {};
  const creditAlias = normalizeText_(creditInput.alias);
  validateTextLength_(errors, "credit.alias", creditAlias, 0, FORGE_BACKEND.limits.creditAlias);
  const publicCreditAllowed = Boolean(creditAlias && creditInput.publicCreditAllowed === true);

  const noticeVersion = normalizeText_(input.submissionNoticeVersion);
  validateTextLength_(errors, "submissionNoticeVersion", noticeVersion, 1, FORGE_BACKEND.limits.noticeVersion);

  const submission = {
    schemaVersion: FORGE_BACKEND.schemaVersion,
    formVersion: formVersion,
    submissionId: submissionId,
    createdAtClient: createdAtClient ? new Date(createdAtClient).toISOString() : "",
    contentType: contentType,
    core: core,
    details: details,
    credit: {
      alias: creditAlias,
      publicCreditAllowed: publicCreditAllowed
    },
    submissionNoticeVersion: noticeVersion
  };

  if (JSON.stringify(submission).length > FORGE_BACKEND.maxPayloadCharacters) {
    addError("$", "payload_too_large", "The normalized submission is too large.");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    submission: errors.length === 0 ? submission : null
  };
}

function createForgeSheetRow_(submission, publicReference, submittedAtUtc) {
  const detailKinds = [];
  submission.details.forEach(function (detail) {
    if (detailKinds.indexOf(detail.kind) === -1) {
      detailKinds.push(detail.kind);
    }
  });

  return [
    submission.submissionId,
    publicReference,
    submittedAtUtc,
    submission.createdAtClient,
    submission.schemaVersion,
    submission.formVersion,
    submission.contentType,
    neutralizeSheetCell_(submission.core.name),
    neutralizeSheetCell_(submission.core.subtype),
    neutralizeSheetCell_(submission.core.cost),
    neutralizeSheetCell_(submission.core.rarity),
    neutralizeSheetCell_(submission.core.rulesText),
    submission.details.length,
    detailKinds.join(", "),
    neutralizeSheetCell_(submission.credit.alias),
    submission.credit.publicCreditAllowed,
    submission.submissionNoticeVersion,
    "new",
    "",
    "",
    JSON.stringify(submission),
    ""
  ];
}

function createForgeResponse_(targetOrigin, responseToken, result) {
  const message = {
    source: "moonvine-forge-backend",
    responseToken: responseToken,
    result: result
  };
  const safeMessageJson = JSON.stringify(message)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const safeOriginJson = JSON.stringify(targetOrigin || "*");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Moonvine Forge</title></head>" +
    "<body><p>Returning to Moonvine Forge...</p><script>" +
    "window.parent.postMessage(" + safeMessageJson + "," + safeOriginJson + ");" +
    "</script></body></html>";

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getOrCreateForgeSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureForgeHeaders_(sheet) {
  const expected = FORGE_BACKEND.headers.slice();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return;
  }

  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw createForgeError_(
        "sheet_header_mismatch",
        "The Forge sheet headers do not match the expected schema at column " + (index + 1) + "."
      );
    }
  }
}

function findForgeSubmission_(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const match = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();

  if (!match) return null;
  return {
    row: match.getRow(),
    publicReference: String(sheet.getRange(match.getRow(), 2).getDisplayValue())
  };
}

function createPublicReference_(submissionId, year) {
  return "MVF-" + String(year) + "-" + submissionId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function neutralizeSheetCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function isAllowedOrigin_(origin) {
  return FORGE_BACKEND.allowedOrigins.indexOf(normalizeText_(origin)) !== -1;
}

function normalizeResponseToken_(value) {
  const token = normalizeText_(value);
  return FORGE_RESPONSE_TOKEN_PATTERN.test(token) ? token : "invalid-response-token";
}

function normalizeText_(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject_(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTextLength_(errors, path, value, minimum, maximum) {
  if (typeof value !== "string") {
    errors.push({ path: path, code: "text_type", message: "Must be text." });
    return;
  }
  if (value.length < minimum) {
    errors.push({ path: path, code: "text_too_short", message: "Must contain at least " + minimum + " characters." });
  }
  if (value.length > maximum) {
    errors.push({ path: path, code: "text_too_long", message: "Must not exceed " + maximum + " characters." });
  }
}

function createForgeError_(code, message, errors) {
  const error = new Error(message);
  error.forgeCode = code;
  error.forgeErrors = Array.isArray(errors) ? errors : [];
  return error;
}

var MoonvineForgeBackendTest = Object.freeze({
  config: FORGE_BACKEND,
  validateSubmission: validateForgeSubmission_,
  createSheetRow: createForgeSheetRow_,
  createPublicReference: createPublicReference_,
  neutralizeSheetCell: neutralizeSheetCell_,
  isAllowedOrigin: isAllowedOrigin_,
  normalizeResponseToken: normalizeResponseToken_
});
