import assert from "node:assert/strict";
import analyzeTicketHandler from "../api/analyze-ticket.js";
import healthHandler from "../api/health.js";

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

async function main() {
  const healthResponse = createResponse();
  healthHandler({ method: "GET" }, healthResponse);
  assert.equal(healthResponse.statusCode, 200);
  assert.deepEqual(healthResponse.payload, { status: "ok" });

  const analyzeResponse = createResponse();
  await analyzeTicketHandler(
    {
      method: "POST",
      body: {
        ticket_id: "T-SMOKE-001",
        complaint: "Someone called asking my OTP, is that bKash?",
        language: "en",
        channel: "call_center",
        user_type: "customer",
        transaction_history: []
      }
    },
    analyzeResponse
  );

  assert.equal(analyzeResponse.statusCode, 200);
  console.log(JSON.stringify(analyzeResponse.payload, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
