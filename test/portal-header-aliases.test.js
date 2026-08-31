/**
 * Tracker renameHeadersV20_4 turns RATIONALE into "Reason for the decision".
 * Portal must still resolve that pretty header to RATIONALE for sign-off writes.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const identity = fs.readFileSync(path.join(root, "portal/10_Identity.gs"), "utf8");
const config = fs.readFileSync(path.join(root, "portal/00_Config.gs"), "utf8");

assert.match(config, /portal-2\.10\.1/);

assert.match(
  identity,
  /"20 SKILL VALIDATION QUEUE"[\s\S]*?"REASON FOR THE DECISION":\s*"RATIONALE"/,
  "queue must alias Reason for the decision → RATIONALE"
);
assert.match(
  identity,
  /"21 SKILL SIGN-OFF LOG"[\s\S]*?"REASON GIVEN":\s*"RATIONALE"/,
  "sign-off log must alias Reason given → RATIONALE"
);

// Simulate applyHeaderAliasesV1_ map building for a renamed queue header row
const prettyHeaders = [
  "Queue ID",
  "Trainee Email",
  "Skill ID",
  "Status",
  "Reason for the decision",
  "Decided by (email)",
  "When decided"
];
const aliases = {
  "QUEUE ID": "QUEUE_ID",
  "TRAINEE EMAIL": "TRAINEE_EMAIL",
  "SKILL ID": "SKILL_ID",
  STATUS: "STATUS",
  "REASON FOR THE DECISION": "RATIONALE",
  "DECIDED BY (EMAIL)": "DECIDED_BY_EMAIL",
  "WHEN DECIDED": "DECIDED_AT"
};
const col = {};
prettyHeaders.forEach(function (h, i) {
  const raw = String(h || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  const canon = aliases[raw] || raw.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (canon && col[canon] == null) col[canon] = i;
});

assert.strictEqual(col.RATIONALE, 4, "RATIONALE must resolve from Reason for the decision");
assert.strictEqual(col.QUEUE_ID, 0);
assert.strictEqual(col.STATUS, 3);
assert.ok(col.DECIDED_BY_EMAIL != null);
assert.ok(col.DECIDED_AT != null);

console.log("portal-header-aliases.test.js: ok");
