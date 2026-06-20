"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");
const backendPath = path.join(
  repositoryRoot,
  "apps-script",
  "Code.gs"
);
const workflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "process-forge-submissions.yml"
);
const readmePath = path.join(
  repositoryRoot,
  "apps-script",
  "README.md"
);

const backendSource = fs.readFileSync(
  backendPath,
  "utf8"
);
const workflow = fs.readFileSync(
  workflowPath,
  "utf8"
);
const readme = fs.readFileSync(
  readmePath,
  "utf8"
);

const context = vm.createContext({
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Math
});

vm.runInContext(backendSource, context, {
  filename: backendPath
});

const backend = context.MoonvineForgeBackendTest;

if (!backend) {
  throw new Error(
    "MoonvineForgeBackendTest export was not found."
  );
}

function submission(overrides = {}) {
  const base = {
    schemaVersion: 1,
    formVersion: "1.0.0",
    submissionId:
      "550e8400-e29b-41d4-a716-446655440000",
    createdAtClient:
      "2026-06-19T16:30:00.000Z",
    contentType: "card",
    core: {
      name: "Simple Guard",
      rulesText: "Gain 8 Block.",
      subtype: "Skill",
      cost: "1",
      rarity: "",
      flavourText: "",
      upgradeText: ""
    },
    details: [],
    credit: {
      alias: "",
      publicCreditAllowed: false
    },
    submissionNoticeVersion: "2026-06-v1"
  };

  return Object.assign(base, overrides);
}

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

test(
  "creates a low-complexity review for a minimal idea",
  () => {
    const review = backend.createAutomatedReview(
      submission()
    );

    assert.equal(review.complexity, "low");
    assert.ok(review.score >= 1);
    assert.deepEqual(
      Array.from(review.signals),
      ["straightforward effect description"]
    );
    assert.ok(
      review.notes.includes(
        "manual semantic, balance, and implementation review required"
      )
    );
  }
);

test(
  "flags complex engine interactions deterministically",
  () => {
    const complex = submission({
      core: {
        name: "Recursive Archive",
        rulesText:
          "Repeat the stored effect in order, then restore the previous zone state.",
        subtype: "Skill",
        cost: "2",
        rarity: "Rare",
        flavourText: "",
        upgradeText: "The repeated effect may target another card."
      },
      details: [
        {
          id: "detail-1",
          kind: "recursion",
          label: "",
          text: "Prevent ancestor re-entry."
        },
        {
          id: "detail-2",
          kind: "memory",
          label: "",
          text: "Store the previous target."
        },
        {
          id: "detail-3",
          kind: "sequence",
          label: "",
          text: "Resolve in the declared order."
        },
        {
          id: "detail-4",
          kind: "zone",
          label: "",
          text: "Move between discard and banished."
        },
        {
          id: "detail-5",
          kind: "custom",
          label: "Timeline",
          text: "Restore the old ordering."
        }
      ]
    });

    const review =
      backend.createAutomatedReview(complex);

    assert.equal(review.complexity, "high");
    assert.ok(
      review.signals.includes(
        "recursion or effect-chain control"
      )
    );
    assert.ok(
      review.signals.includes(
        "stored state or historical memory"
      )
    );
    assert.ok(
      review.signals.includes(
        "ordered multi-step resolution"
      )
    );
    assert.ok(
      review.signals.includes(
        "card-zone interaction"
      )
    );
  }
);

test(
  "review notes never copy author or rules text",
  () => {
    const privateText =
      "PRIVATE UNIQUE RULE TEXT 918273";
    const privateAlias =
      "PRIVATE UNIQUE ALIAS 564738";

    const review = backend.createAutomatedReview(
      submission({
        core: {
          name: "",
          rulesText: privateText,
          subtype: "",
          cost: "",
          rarity: "",
          flavourText: "",
          upgradeText: ""
        },
        credit: {
          alias: privateAlias,
          publicCreditAllowed: false
        }
      })
    );

    assert.equal(
      review.notes.includes(privateText),
      false
    );
    assert.equal(
      review.notes.includes(privateAlias),
      false
    );
  }
);

test(
  "processor tokens require exact equality",
  () => {
    const token =
      "0123456789abcdef0123456789abcdef";

    assert.equal(
      backend.secureTokensEqual(token, token),
      true
    );
    assert.equal(
      backend.secureTokensEqual(
        token,
        token.slice(0, -1) + "0"
      ),
      false
    );
    assert.equal(
      backend.secureTokensEqual(token, ""),
      false
    );
  }
);

test(
  "admin processing is routed before public origin validation",
  () => {
    const adminIndex = backendSource.indexOf(
      "handleForgeAdminPost_(parameters)"
    );
    const originIndex = backendSource.indexOf(
      "const requestedOrigin"
    );

    assert.ok(adminIndex >= 0);
    assert.ok(originIndex > adminIndex);
  }
);

test(
  "workflow runs hourly with read-only repository permission",
  () => {
    assert.ok(
      workflow.includes('cron: "37 * * * *"')
    );
    assert.ok(
      workflow.includes("workflow_dispatch:")
    );
    assert.ok(
      workflow.includes("contents: read")
    );
    assert.equal(
      workflow.includes("contents: write"),
      false
    );
  }
);

test(
  "workflow exposes no raw submissions",
  () => {
    assert.ok(
      workflow.includes(
        "${{ secrets.FORGE_PROCESSOR_TOKEN }}"
      )
    );
    assert.equal(
      workflow.includes("payload_json"),
      false
    );
    assert.equal(
      workflow.includes("credit_alias"),
      false
    );
    assert.equal(
      workflow.includes("rules_text"),
      false
    );
    assert.equal(
      workflow.includes("actions/upload-artifact"),
      false
    );
  }
);

test(
  "documentation covers private processor setup",
  () => {
    assert.ok(
      readme.includes("FORGE_PROCESSOR_TOKEN")
    );
    assert.ok(
      readme.includes("generateForgeProcessorToken")
    );
    assert.ok(
      readme.includes("needs_review")
    );
  }
);

for (const current of tests) {
  current.callback();
  console.log(`PASS ${current.name}`);
}

console.log(
  `All ${tests.length} Forge processing tests passed.`
);
