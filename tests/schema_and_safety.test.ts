import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTicket } from "../src/analyzer.js";
import { hasSafetyViolation, hasUnsafeCredentialRequest, hasUnsafePromise } from "../src/safety.js";
import type { AnalyzeTicketResponse } from "../src/types.js";

const CASE_TYPES = new Set([
  "wrong_transfer",
  "payment_failed",
  "refund_request",
  "duplicate_payment",
  "merchant_settlement_delay",
  "agent_cash_in_issue",
  "phishing_or_social_engineering",
  "other"
]);
const DEPARTMENTS = new Set([
  "customer_support",
  "dispute_resolution",
  "payments_ops",
  "merchant_operations",
  "agent_operations",
  "fraud_risk"
]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const VERDICTS = new Set(["consistent", "inconsistent", "insufficient_data"]);

function assertSchema(response: AnalyzeTicketResponse) {
  assert.equal(typeof response.ticket_id, "string");
  assert.ok(response.relevant_transaction_id === null || typeof response.relevant_transaction_id === "string");
  assert.ok(VERDICTS.has(response.evidence_verdict));
  assert.ok(CASE_TYPES.has(response.case_type));
  assert.ok(SEVERITIES.has(response.severity));
  assert.ok(DEPARTMENTS.has(response.department));
  assert.equal(typeof response.agent_summary, "string");
  assert.equal(typeof response.recommended_next_action, "string");
  assert.equal(typeof response.customer_reply, "string");
  assert.equal(typeof response.human_review_required, "boolean");
  assert.equal(typeof response.confidence, "number");
  assert.ok(response.confidence >= 0 && response.confidence <= 1);
  assert.ok(Array.isArray(response.reason_codes));
}

test("successful response has all required fields and exact enum values", () => {
  const response = analyzeTicket({
    ticket_id: "SCHEMA-001",
    complaint: "I sent 5000 taka to wrong number.",
    language: "en",
    transaction_history: [
      {
        transaction_id: "TXN-SCHEMA-1",
        timestamp: "2026-04-14T14:00:00Z",
        type: "transfer",
        amount: 5000,
        counterparty: "+8801711111111",
        status: "completed"
      }
    ]
  });

  assertSchema(response);
});

test("safe warning is allowed but credential request is blocked", () => {
  assert.equal(hasUnsafeCredentialRequest("Please do not share your PIN or OTP with anyone."), false);
  assert.equal(hasUnsafeCredentialRequest("Please share your OTP so we can verify."), true);
});

test("unauthorized financial promises are detected", () => {
  assert.equal(hasUnsafePromise("Any eligible amount will be returned through official channels."), false);
  assert.equal(hasUnsafePromise("We will refund your money tomorrow."), true);
  assert.equal(hasUnsafePromise("Your reversal is confirmed."), true);
});

test("generated customer reply and next action avoid safety violations", () => {
  const cases = [
    {
      ticket_id: "SAFE-001",
      complaint: "Someone called me asking for OTP and password.",
      language: "en" as const,
      transaction_history: []
    },
    {
      ticket_id: "SAFE-002",
      complaint: "I paid 500 to a merchant, please refund.",
      language: "en" as const,
      transaction_history: [
        {
          transaction_id: "TXN-SAFE-2",
          timestamp: "2026-04-14T13:00:00Z",
          type: "payment" as const,
          amount: 500,
          counterparty: "MERCHANT-100",
          status: "completed" as const
        }
      ]
    }
  ];

  for (const input of cases) {
    const response = analyzeTicket(input);
    assert.equal(hasSafetyViolation(response.customer_reply), false);
    assert.equal(hasSafetyViolation(response.recommended_next_action), false);
    assert.equal(hasSafetyViolation(response.agent_summary), false);
  }
});

test("Bangla customer cases keep internal fields in English", () => {
  const response = analyzeTicket({
    ticket_id: "LANG-001",
    complaint: "আমি আজ সকালে এজেন্টের কাছে ২০০০ টাকা ক্যাশ ইন করেছি কিন্তু আমার ব্যালেন্সে টাকা আসেনি।",
    language: "bn",
    transaction_history: [
      {
        transaction_id: "TXN-LANG-1",
        timestamp: "2026-04-14T09:30:00Z",
        type: "cash_in",
        amount: 2000,
        counterparty: "AGENT-318",
        status: "pending"
      }
    ]
  });

  assert.doesNotMatch(response.agent_summary, /[\u0980-\u09ff]/);
  assert.doesNotMatch(response.recommended_next_action, /[\u0980-\u09ff]/);
});
