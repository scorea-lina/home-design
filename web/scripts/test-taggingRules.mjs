import assert from "node:assert/strict";
import { computeSuggestedTagNames } from "../src/lib/taggingRules.js";

const rules = [
  { field: "from", includes: "acme.com", tag: "Vendors", priority: 100 },
  { field: "subject", includes: "invoice", tag: "Bills", priority: 50 },
  { field: "body", includes: "paint", tag: "Paint", priority: 10 },
  { field: "subject", includes: "invoice", tag: "Bills", priority: 1 },
];

const out = computeSuggestedTagNames(
  { from: "bob@acme.com", subject: "Invoice for March", body: "Need paint samples" },
  rules,
);

assert.deepEqual(out, ["Vendors", "Bills", "Paint"]);
console.log("All taggingRules tests passed");
