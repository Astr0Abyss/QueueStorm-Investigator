import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTicket } from "../src/analyzer.js";
import { parseAnalyzeTicketRequest, ValidationError } from "../src/schema.js";

test("analyzes phishing complaints with the final response schema", () => {
  const result = analyzeTicket({
    ticket_id: "TKT-005",
    complaint: "Someone called me asking for OTP. Is this real?",
    language: "en",
    channel: "call_center",
    user_type: "customer",
    transaction_history: []
  });

  assert.equal(result.ticket_id, "TKT-005");
  assert.equal(result.relevant_transaction_id, null);
  assert.equal(result.evidence_verdict, "insufficient_data");
  assert.equal(result.case_type, "phishing_or_social_engineering");
  assert.equal(result.severity, "critical");
  assert.equal(result.department, "fraud_risk");
  assert.equal(result.human_review_required, true);
  assert.equal(typeof result.agent_summary, "string");
  assert.equal(typeof result.recommended_next_action, "string");
  assert.equal(typeof result.customer_reply, "string");
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.ok(Array.isArray(result.reason_codes));
});

test("returns a complete safe fallback for non-phishing complaints", () => {
  const result = analyzeTicket({
    ticket_id: "TKT-OTHER",
    complaint: "Something is wrong with my money. Please check.",
    transaction_history: []
  });

  assert.equal(result.ticket_id, "TKT-OTHER");
  assert.equal(result.relevant_transaction_id, null);
  assert.equal(result.evidence_verdict, "insufficient_data");
  assert.equal(result.case_type, "other");
  assert.equal(result.severity, "low");
  assert.equal(result.department, "customer_support");
  assert.equal(result.human_review_required, false);
});

test("does not ask for sensitive credentials in generated fields", () => {
  const result = analyzeTicket({
    ticket_id: "SAFE",
    complaint: "Someone asked for my PIN",
    transaction_history: []
  });

  assertNoUnsafeCredentialRequest(result.agent_summary);
  assertNoUnsafeCredentialRequest(result.recommended_next_action);
  assertNoUnsafeCredentialRequest(result.customer_reply);
});

test("allows safe credential warning language", () => {
  assertNoUnsafeCredentialRequest("Please do not share your PIN or OTP with anyone.");
  assertNoUnsafeCredentialRequest("We never ask for your PIN, OTP, or password.");
});

test("validates required fields, enums, and transaction history", () => {
  assert.throws(
    () => parseAnalyzeTicketRequest({ ticket_id: "", complaint: "", channel: "app" }),
    ValidationError
  );

  const parsed = parseAnalyzeTicketRequest({
    ticket_id: " T-200 ",
    complaint: "  Payment failed but money cut  ",
    language: "mixed",
    channel: "in_app_chat",
    user_type: "customer",
    transaction_history: [
      {
        transaction_id: " TXN-1 ",
        timestamp: "2026-04-14T14:08:22Z",
        type: "payment",
        amount: 1200,
        counterparty: " MERCHANT-1 ",
        status: "failed"
      }
    ]
  });

  assert.deepEqual(parsed, {
    ticket_id: "T-200",
    complaint: "Payment failed but money cut",
    language: "mixed",
    channel: "in_app_chat",
    user_type: "customer",
    transaction_history: [
      {
        transaction_id: "TXN-1",
        timestamp: "2026-04-14T14:08:22Z",
        type: "payment",
        amount: 1200,
        counterparty: "MERCHANT-1",
        status: "failed"
      }
    ]
  });
});

test("defaults missing transaction_history to an empty array", () => {
  const parsed = parseAnalyzeTicketRequest({
    ticket_id: "TKT-NO-HISTORY",
    complaint: "Please check this issue"
  });

  assert.deepEqual(parsed.transaction_history, []);
});

function assertNoUnsafeCredentialRequest(text: string) {
  assert.equal(findUnsafeCredentialRequest(text), undefined, text);
}

function findUnsafeCredentialRequest(text: string): string | undefined {
  const pattern =
    /\b(share|send|provide|tell|give|ask\s+for)\b.{0,40}\b(otp|pin|password|full card|card number|cvv)\b/gi;

  for (const match of text.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const prefix = text.slice(Math.max(0, matchIndex - 20), matchIndex).toLowerCase();

    if (/(do not|don't|never|not)\s*$/.test(prefix)) {
      continue;
    }

    return match[0];
  }

  return undefined;
}
