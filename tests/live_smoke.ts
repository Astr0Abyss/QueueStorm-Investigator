const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
  console.error("Set BASE_URL to run live smoke tests, for example: BASE_URL=http://localhost:3000 npm run live-smoke");
  process.exit(2);
}

const cleanBase = baseUrl.replace(/\/$/, "");

async function main() {
  const health = await fetch(`${cleanBase}/health`);
  const healthBody: unknown = await health.json();
  if (!isRecord(healthBody) || health.status !== 200 || healthBody.status !== "ok") {
    throw new Error(`/health failed: ${health.status} ${JSON.stringify(healthBody)}`);
  }

  const analysis = await fetch(`${cleanBase}/analyze-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_id: "SMOKE-001",
      complaint: "Someone called me saying they are from bKash and asked for my OTP.",
      language: "en",
      channel: "call_center",
      user_type: "customer",
      transaction_history: []
    })
  });

  const body: unknown = await analysis.json();
  if (analysis.status !== 200) {
    throw new Error(`/analyze-ticket failed: ${analysis.status} ${JSON.stringify(body)}`);
  }
  if (!isRecord(body)) {
    throw new Error(`Unexpected non-object smoke response: ${JSON.stringify(body)}`);
  }
  if (body.case_type !== "phishing_or_social_engineering" || body.department !== "fraud_risk") {
    throw new Error(`Unexpected smoke response: ${JSON.stringify(body)}`);
  }
  if (typeof body.customer_reply !== "string" || /(?:please\s+)?share.{0,40}(otp|pin|password)/i.test(body.customer_reply)) {
    throw new Error(`Unsafe customer reply: ${body.customer_reply}`);
  }

  console.log("Live smoke passed for /health and /analyze-ticket.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
