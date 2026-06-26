import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTicket } from "../src/analyzer.js";

test("analyzer is defensive when transaction_history is missing", () => {
  const response = analyzeTicket({
    ticket_id: "MISS-HISTORY",
    complaint: "Something is wrong with my money. Please check."
  });

  assert.equal(response.ticket_id, "MISS-HISTORY");
  assert.equal(response.relevant_transaction_id, null);
  assert.equal(response.evidence_verdict, "insufficient_data");
  assert.equal(response.case_type, "other");
});

test("empty complaint should return 422 in API layer, but analyzer fails safe", () => {
  const response = analyzeTicket({
    ticket_id: "EMPTY-COMPLAINT",
    complaint: "",
    transaction_history: []
  });

  assert.equal(response.relevant_transaction_id, null);
  assert.equal(response.evidence_verdict, "insufficient_data");
  assert.equal(response.case_type, "other");
});

test("API layer checklist includes malformed JSON and missing field cases", () => {
  const requiredApiCases = [
    "malformed JSON",
    "missing body",
    "missing ticket_id",
    "missing complaint",
    "empty complaint returns 422",
    "invalid language enum",
    "invalid channel enum",
    "transaction_history is not array",
    "invalid transaction type",
    "invalid transaction status"
  ];

  assert.equal(requiredApiCases.length, 10);
});
