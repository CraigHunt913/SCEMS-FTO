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
const record = fs.readFileSync(path.join(root, "portal/91_Record.gs"), "utf8");

assert.match(config, /portal-2\.10\.1/);
assert.match(
  record,
  /need = \['DECISION', 'DECIDED BY', 'DECISION DATE', 'RATIONALE', 'RECORD STATUS'\]/
);

assert.match(
  identity,
  /'20 SKILL VALIDATION QUEUE'[\s\S]*?'REASON FOR THE DECISION':\s*'RATIONALE'/,
  "queue must alias Reason for the decision → RATIONALE"
);
assert.match(
  identity,
  /'21 SKILL SIGN-OFF LOG'[\s\S]*?'REASON GIVEN':\s*'RATIONALE'/,
  "sign-off log must alias Reason given → RATIONALE"
);

// Mirror readTabUncachedV1_ + applyHeaderAliasesV1_ for a renamed queue header row
const aliasesByTab = {
  "20 SKILL VALIDATION QUEUE": {
    "REASON FOR THE DECISION": "RATIONALE",
    "EVIDENCE SO FAR": "EVIDENCE SUMMARY",
    "READY SINCE": "READY DATE",
    "LAST EVIDENCE": "LAST EVIDENCE DATE"
  }
};

function applyHeaderAliases(tabName, col) {
  const plan = aliasesByTab[tabName];
  if (!plan || !col) return col;
  Object.keys(plan).forEach(function (pretty) {
    if (col[pretty] === undefined) return;
    const canon = plan[pretty];
    if (col[canon] === undefined) col[canon] = col[pretty];
  });
  return col;
}

function colFromHeaders(tabName, prettyHeaders) {
  const col = {};
  prettyHeaders.forEach(function (h, i) {
    if (!h) return;
    col[h.toUpperCase()] = i;
    col[h.toUpperCase().replace(/\s+/g, " ")] = i;
  });
  return applyHeaderAliases(tabName, col);
}

const col = colFromHeaders("20 SKILL VALIDATION QUEUE", [
  "READY DATE",
  "TRAINEE",
  "SKILL",
  "SKILL ID",
  "EVIDENCE SUMMARY",
  "DECISION",
  "DECIDED BY",
  "DECISION DATE",
  "Reason for the decision",
  "RECORD STATUS",
  "REQUEST ID"
]);

const need = ["DECISION", "DECIDED BY", "DECISION DATE", "RATIONALE", "RECORD STATUS"];
const missing = need.filter(function (h) {
  return col[h] === undefined;
});
assert.deepStrictEqual(missing, [], "sign-off need list must resolve after rename: " + missing.join(", "));
assert.strictEqual(col.RATIONALE, 8, "RATIONALE must resolve from Reason for the decision");
assert.ok(col["REASON FOR THE DECISION"] != null);

console.log("portal-header-aliases.test.js: ok");
