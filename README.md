# QueueStorm Investigator

Backend API for the SUST CSE Carnival 2026 Codex Community Hackathon preliminary round.

The service exposes the required health and analysis endpoints for a digital finance support copilot. It combines the Member 1 API shell with the Member 2 deterministic evidence reasoning engine.

## API

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

### `POST /analyze-ticket`

Request:

```json
{
  "ticket_id": "TKT-005",
  "complaint": "Someone called me asking for OTP. Is this real?",
  "language": "en",
  "channel": "call_center",
  "user_type": "customer",
  "transaction_history": []
}
```

Response:

```json
{
  "ticket_id": "TKT-005",
  "relevant_transaction_id": null,
  "evidence_verdict": "insufficient_data",
  "case_type": "phishing_or_social_engineering",
  "severity": "critical",
  "department": "fraud_risk",
  "agent_summary": "Customer reports suspicious contact or credential-related activity. No transaction match is required for this safety case.",
  "recommended_next_action": "Escalate to fraud_risk and remind the customer to use only official support channels.",
  "customer_reply": "Thank you for checking before sharing any information. We never ask for your PIN, OTP, or password. Please do not share these with anyone and use only official support channels.",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["credential_risk", "safety_escalation"]
}
```

## Reasoning Engine

The current `src/analyzer.ts` is a deterministic investigator:

- detects the complaint category from English, Bangla, and Banglish hints
- scores transaction matches using transaction ID, amount, type, status, counterparty, phone, and time hints
- refuses to guess when multiple transactions are plausible
- returns `consistent`, `inconsistent`, or `insufficient_data`
- routes to the official departments and sets severity/human-review flags
- uses safe customer reply templates and a final safety sanitizer

The matcher uses a minimum transaction score of `45`, ambiguity margin of `25`, duplicate payment window of `180` seconds, and high-value human-review threshold of `25000` BDT.

`agent_summary` and `recommended_next_action` are always written in English because they are internal support-agent fields. `customer_reply` may switch to Bangla or Banglish when the customer complaint language requires it.

## MODELS

Default scoring decisions use no database and no model server. The evidence reasoning engine is deterministic TypeScript rules, which is a deliberate reliability and latency choice for the 30-second enforced judge timeout and the 60-second health-readiness requirement.

Optional fallback:

- Model providers: direct Gemini API, NVIDIA/OpenAI-compatible chat completion endpoint, or OpenRouter/OpenAI-compatible endpoint
- Suggested fast model: `gemini-2.5-flash`
- Runtime location: external API, only if `ENABLE_LLM_FALLBACK=true`
- Purpose: text enrichment for low-confidence `other` / `insufficient_data` cases only
- Guardrails: cannot change schema, enum values, transaction selection, evidence verdict, department, severity, human-review decisions, or safety policy

Recommended deployment posture for judging: keep deterministic reasoning as the source of truth. If `ENABLE_LLM_FALLBACK=true`, the API still falls back safely to deterministic text whenever a provider is slow, unavailable, or rejects the request.

## Local Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
```

This runs TypeScript build plus the full test suite, including all 10 public sample cases.

Run smoke test:

```bash
npm run smoke
```

Start locally:

```bash
npm run dev
```

Test health:

```bash
curl http://localhost:3000/health
```

Test analysis:

```bash
curl -X POST http://localhost:3000/analyze-ticket \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"TKT-005\",\"complaint\":\"Someone called me asking for OTP. Is this real?\",\"language\":\"en\",\"channel\":\"call_center\",\"user_type\":\"customer\",\"transaction_history\":[]}"
```

## Deployment

Priority order for the round:

1. Keep the local API working and tested.
2. Submit one reliable public live URL.
3. Add a backup deployment only if time remains.

### Vercel

```bash
npm run check
npx vercel
npx vercel --prod
```

Verify:

```bash
curl https://YOUR-VERCEL-URL/health
```

After deployment, regenerate `sample-output.json` from a real deployed `/analyze-ticket` call using one public sample input. The checked-in `sample-output.json` is a local captured example; the final submitted sample should come from the live URL.

### Render

Render is a backup deployment path, not mandatory if the Vercel URL is stable.

Use these settings:

- Environment: Node
- Build command: `npm install`
- Start command: `npm run start`

The local server uses `process.env.PORT`, so Render can assign the port automatically. `tsx` is listed as a runtime dependency because `npm run start` uses it directly.

## Environment

No secrets are required for the default deterministic implementation.

Optional hybrid LLM fallback variables are documented in `.env.example`. The fallback is disabled unless `ENABLE_LLM_FALLBACK=true` is set. When enabled, it only enriches text for low-confidence `other` / `insufficient_data` cases; it cannot change schema, enum values, transaction selection, evidence verdict, department, severity, human-review decisions, or safety policy.

Example variable names only:

```text
ENABLE_LLM_FALLBACK=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
AI_API_KEY=
AI_MODEL=google/gemini-2.5-flash
AI_BASE_URL=https://openrouter.ai/api/v1
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_REPAIR_MODEL=mistralai/mistral-nemotron
LLM_TIMEOUT_MS=2500
```

Keep real API keys only in the hosting provider environment or a local uncommitted `.env` file. Do not commit them.

Neon/Postgres is not required for this challenge. The API is stateless by design.

## Safety

The analyzer never asks customers to share PIN, OTP, password, card number, CVV, or other sensitive credentials. It also does not promise refunds, reversals, recovery, or account unblocks.

Safety checks must distinguish actual credential requests from warning language. Text like "Please do not share your PIN or OTP" is safe and should not be rewritten.
