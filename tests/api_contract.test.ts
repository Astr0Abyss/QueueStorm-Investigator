import assert from "node:assert/strict";
import test from "node:test";
import analyzeTicketHandler from "../api/analyze-ticket.js";

type MockResponse = {
  statusCode?: number;
  headers: Record<string, string>;
  payload?: unknown;
  setHeader(name: string, value: string): void;
  status(code: number): {
    json(payload: unknown): void;
  };
};

function createResponse(): MockResponse {
  const response: MockResponse = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return {
        json: (payload: unknown) => {
          this.payload = payload;
        }
      };
    }
  };

  return response;
}

test("missing complaint returns 400 invalid_request", async () => {
  const response = createResponse();

  await analyzeTicketHandler(
    {
      method: "POST",
      body: {
        ticket_id: "MISSING-COMPLAINT"
      }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(readError(response.payload), "invalid_request");
});

test("empty complaint returns 422 semantically_invalid_request", async () => {
  const response = createResponse();

  await analyzeTicketHandler(
    {
      method: "POST",
      body: {
        ticket_id: "EMPTY-COMPLAINT",
        complaint: "   "
      }
    },
    response
  );

  assert.equal(response.statusCode, 422);
  assert.deepEqual(readError(response.payload), "semantically_invalid_request");
});

test("metadata object is accepted and does not affect required output fields", async () => {
  const response = createResponse();

  await analyzeTicketHandler(
    {
      method: "POST",
      body: {
        ticket_id: "WITH-METADATA",
        complaint: "Someone called me asking for OTP.",
        metadata: {
          source: "hidden_harness",
          priority_hint: "ignore_this_for_schema"
        },
        transaction_history: []
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.ok(isRecord(response.payload));
  assert.equal(response.payload.ticket_id, "WITH-METADATA");
  assert.equal(response.payload.case_type, "phishing_or_social_engineering");
  assert.equal(response.payload.department, "fraud_risk");
});

test("malformed metadata returns controlled 400 instead of crashing", async () => {
  const response = createResponse();

  await analyzeTicketHandler(
    {
      method: "POST",
      body: {
        ticket_id: "BAD-METADATA",
        complaint: "Please check this issue.",
        metadata: "not-an-object"
      }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(readError(response.payload), "invalid_request");
});

function readError(payload: unknown): unknown {
  return isRecord(payload) ? payload.error : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
